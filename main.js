const {
    default: makeWASocket,
    useMultiFileAuthState,
    delay,
    makeCacheableSignalKeyStore,
    jidNormalizedUser,
    Browsers,
    DisconnectReason,
    jidDecode,
    downloadContentFromMessage,
    getContentType,
} = require('@whiskeysockets/baileys');
const { arslanmd } = require('./lib/system');
const config = require('./config');
const events = require('./arslan');
const { sms } = require('./lib/msg');
const {
    connectdb,
    saveSessionToMongoDB,
    getSessionFromMongoDB,
    deleteSessionFromMongoDB,
    getUserConfigFromMongoDB,
    updateUserConfigInMongoDB,
    addNumberToMongoDB,
    removeNumberFromMongoDB,
    getAllNumbersFromMongoDB,
    saveOTPToMongoDB,
    verifyOTPFromMongoDB,
    incrementStats,
    getStatsForNumber
} = require('./lib/database');
const { handleAntidelete } = require('./lib/antidelete');

const express = require('express');
const fs = require('fs-extra');
const path = require('path');
const pino = require('pino');
const crypto = require('crypto');
const FileType = require('file-type');
const axios = require('axios');
const moment = require('moment-timezone');

const prefix = config.PREFIX;
const mode = config.MODE || config.WORK_TYPE;
// ========== SETTINGS.JS SE VALUES ==========
const prefix = config.PREFIX || '.';
const mode = config.MODE || config.WORK_TYPE || 'public';
const BOT_NAME = config.BOT_NAME || 'Aʀꜱʟᴀɴ-ᴍD';
const OWNER_NAME = config.OWNER_NAME || 'ᴀʀꜱʟᴀɴ-ᴍᴅ';
const OWNER_NUMBER = config.OWNER_NUMBER || ['923237045919'];

// ========== CHANNEL SETTINGS ==========
const CHANNEL_IDS = config.CHANNEL_IDS || [
    '120363348739987203@newsletter'
];

const REACT_EMOJIS = config.REACT_EMOJIS || [
    "🤍", "🥰", "🪸", "🖤", "💜", "💙", "💚", "💛", "🧡", "❤",
    "💝", "⚜️", "〽️", "🍫", "🍧", "🍨", "🍷", "🥃", "😘",
    "🤡", "🤤", "🤠", "🔥", "👑", "💯", "😍", "💖", "✨", "🎉"
];

const router = express.Router();


connectdb();

const activeSockets = new Map();
const socketCreationTime = new Map();


function createarslanStore() {
    const store = {
        messages: {},
        bind(ev) {
            ev.on('messages.upsert', ({ messages }) => {
                for (const msg of messages) {
                    const jid = msg.key && msg.key.remoteJid;
                    if (!jid) continue;
                    if (!store.messages[jid]) store.messages[jid] = [];
                    store.messages[jid].push(msg);
                    if (store.messages[jid].length > 200) store.messages[jid].shift();
                }
            });
        },
        async loadMessage(jid, id) {
            if (!store.messages[jid]) return null;
            return store.messages[jid].find(m => m.key && m.key.id === id) || null;
        }
    };
    return store;
}

// Utility functions
const createSerial = (size) => crypto.randomBytes(size).toString('hex').slice(0, size);

// ========== FIXED: getGroupAdmins ==========
const getGroupAdmins = (participants) => {
    let admins = [];
    for (let i of participants) {
        if (i.admin === 'admin' || i.admin === 'superadmin') {
            admins.push(i.id);
        }
    }
    return admins;
};

function isNumberAlreadyConnected(number) {
    return activeSockets.has(number.replace(/[^0-9]/g, ''));
}

function getConnectionStatus(number) {
    const n = number.replace(/[^0-9]/g, '');
    const isConnected = activeSockets.has(n);
    const connectionTime = socketCreationTime.get(n);
    return {
        isConnected,
        connectionTime: connectionTime ? new Date(connectionTime).toLocaleString() : null,
        uptime: connectionTime ? Math.floor((Date.now() - connectionTime) / 1000) : 0
    };
}

function arslanLog(message, type = 'info') {
    const icons = { info: '📝', success: '✅', error: '❌', warning: '⚠️', debug: '🐛' };
    console.log(`${icons[type] || '📝'} [ARSLAN-MD-MINI] ${new Date().toISOString()}: ${message}`);
}

// Load Plugins
const pluginsDir = path.join(__dirname, 'plugins');
if (!fs.existsSync(pluginsDir)) fs.mkdirSync(pluginsDir, { recursive: true });
const pluginFiles = fs.readdirSync(pluginsDir).filter(f => f.endsWith('.js'));
arslanLog(`Loading ${pluginFiles.length} plugins...`, 'info');
for (const file of pluginFiles) {
    try { require(path.join(pluginsDir, file)); }
    catch (e) { arslanLog(`Failed to load plugin ${file}: ${e.message}`, 'error'); }
}


async function setupCallHandlers(socket, number) {
    socket.ev.on('call', async (calls) => {
        try {
            const userConfig = await getUserConfigFromMongoDB(number);
            if (userConfig.ANTI_CALL !== 'true') return;
            for (const call of calls) {
                if (call.status !== 'offer') continue;
                await socket.rejectCall(call.id, call.from);
                await socket.sendMessage(call.from, {
                    text: userConfig.REJECT_MSG || config.REJECT_MSG
                });
                arslanLog(`Auto-rejected call for ${number} from ${call.from}`, 'info');
            }
        } catch (err) {
            arslanLog(`Anti-call error for ${number}: ${err.message}`, 'error');
        }
    });
}

function setupAutoRestart(socket, number) {
    let restartAttempts = 0;
    const maxRestartAttempts = 3;

    socket.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const statusCode = lastDisconnect && lastDisconnect.error && lastDisconnect.error.output && lastDisconnect.error.output.statusCode;
            const errorMessage = lastDisconnect && lastDisconnect.error && lastDisconnect.error.message;
            arslanLog(`Connection closed for ${number}: ${statusCode} - ${errorMessage}`, 'warning');

            if (statusCode === 401 || (errorMessage && errorMessage.includes('401'))) {
                arslanLog(`Manual unlink detected for ${number}, cleaning up...`, 'warning');
                const sanitizedNumber = number.replace(/[^0-9]/g, '');
                activeSockets.delete(sanitizedNumber);
                socketCreationTime.delete(sanitizedNumber);
                await deleteSessionFromMongoDB(sanitizedNumber);
                await removeNumberFromMongoDB(sanitizedNumber);
                socket.ev.removeAllListeners();
                return;
            }

            const isNormalError = statusCode === 408 || (errorMessage && errorMessage.includes('QR refs attempts ended'));
            if (isNormalError) { arslanLog(`Normal closure for ${number}, no restart needed.`, 'info'); return; }

            if (restartAttempts < maxRestartAttempts) {
                restartAttempts++;
                arslanLog(`Reconnecting ${number} (${restartAttempts}/${maxRestartAttempts}) in 10s...`, 'warning');
                const sanitizedNumber = number.replace(/[^0-9]/g, '');
                activeSockets.delete(sanitizedNumber);
                socketCreationTime.delete(sanitizedNumber);
                socket.ev.removeAllListeners();
                await delay(10000);
                try {
                    const mockRes = { headersSent: false, send: () => {}, status: () => mockRes, setHeader: () => {}, json: () => {} };
                    await arslanPair(number, mockRes);
                } catch (e) { arslanLog(`Reconnection failed for ${number}: ${e.message}`, 'error'); }
            } else {
                arslanLog(`Max restart attempts reached for ${number}.`, 'error');
            }
        }
        if (connection === 'open') { restartAttempts = 0; }
    });
}


async function arslanPair(number, res = null) {
    let connectionLockKey;
    const sanitizedNumber = number.replace(/[^0-9]/g, '');

    try {
        const sessionPath = path.join(__dirname, 'session', `session_${sanitizedNumber}`);

        if (isNumberAlreadyConnected(sanitizedNumber)) {
            const status = getConnectionStatus(sanitizedNumber);
            if (res && !res.headersSent) {
                return res.json({ status: 'already_connected', message: 'Number is already connected', connectionTime: status.connectionTime, uptime: `${status.uptime} seconds` });
            }
            return;
        }

        connectionLockKey = `arslan_lock_${sanitizedNumber}`;
        if (global[connectionLockKey]) {
            if (res && !res.headersSent) return res.json({ status: 'connection_in_progress' });
            return;
        }
        global[connectionLockKey] = true;

        // Check MongoDB session
        const existingSession = await getSessionFromMongoDB(sanitizedNumber);

        if (!existingSession) {
            arslanLog(`No MongoDB session for ${sanitizedNumber} — new pairing required`, 'info');
            if (fs.existsSync(sessionPath)) {
                await fs.remove(sessionPath);
                arslanLog(`Cleaned leftover local session for ${sanitizedNumber}`, 'info');
            }
        } else {
            // Session exists - restore from MongoDB
            fs.ensureDirSync(sessionPath);
            fs.writeFileSync(path.join(sessionPath, 'creds.json'), JSON.stringify(existingSession, null, 2));
            arslanLog(`🔄 Restored existing session from MongoDB for ${sanitizedNumber}`, 'success');
        }

        const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
        const logger = pino({ level: process.env.NODE_ENV === 'production' ? 'fatal' : 'debug' });

        const arslanStore = createarslanStore();

        const conn = makeWASocket({
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, logger),
            },
            printQRInTerminal: false,
            logger: pino({ level: "silent" }),
            connectTimeoutMs: 60000,
            defaultQueryTimeoutMs: 0,
            keepAliveIntervalMs: 10000,
            emitOwnEvents: false,
            fireInitQueries: true,
            generateHighQualityLinkPreview: true,
            syncFullHistory: true,
            markOnlineOnConnect: true,
            browser: ['Mac OS', 'Safari', '10.15.7'],
            getMessage: async () => ({}),
            }
        });

        socketCreationTime.set(sanitizedNumber, Date.now());
        activeSockets.set(sanitizedNumber, conn);
        arslanStore.bind(conn.ev);

        // Setup handlers
        setupCallHandlers(conn, number);
        setupAutoRestart(conn, number);

        // decodeJid utility
        conn.decodeJid = jid => {
            if (!jid) return jid;
            if (/:\d+@/gi.test(jid)) {
                const decode = jidDecode(jid) || {};
                return (decode.user && decode.server && decode.user + '@' + decode.server) || jid;
            }
            return jid;
        };

        conn.downloadAndSaveMediaMessage = async (message, filename, attachExtension = true) => {
            const quoted = message.msg ? message.msg : message;
            const mime = (message.msg || message).mimetype || '';
            const messageType = message.mtype ? message.mtype.replace(/Message/gi, '') : mime.split('/')[0];
            const stream = await downloadContentFromMessage(quoted, messageType);
            let buffer = Buffer.from([]);
            for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
            const type = await FileType.fromBuffer(buffer);
            const trueFileName = attachExtension ? (filename + '.' + type.ext) : filename;
            await fs.writeFileSync(trueFileName, buffer);
            return trueFileName;
        };

        // Pairing Code
        if (!conn.authState.creds.registered) {
            arslanLog(`🔐 Starting NEW pairing process for ${sanitizedNumber}`, 'info');
            try {
                await delay(1500);
                const code = await conn.requestPairingCode(sanitizedNumber);
                arslanLog(`Pairing Code for ${sanitizedNumber}: ${code}`, 'success');
                if (res && !res.headersSent) {
                    res.send({ code, status: 'new_pairing' });
                }
            } catch (error) {
                arslanLog(`Failed to request pairing code: ${error.message}`, 'error');
                if (res && !res.headersSent) {
                    res.status(500).send({ error: 'Failed to get pairing code', status: 'error', message: error.message });
                }
                throw error;
            }
        } else {
            arslanLog(`✅ Using existing session for ${sanitizedNumber}`, 'success');
            if (res && !res.headersSent) {
                res.json({ status: 'reconnecting', message: 'Reconnecting with existing session' });
            }
        }

        // Save creds on update
        conn.ev.on('creds.update', async () => {
            await saveCreds();
            const fileContent = await fs.readFile(path.join(sessionPath, 'creds.json'), 'utf8');
            const creds = JSON.parse(fileContent);
            const existingSessionCheck = await getSessionFromMongoDB(sanitizedNumber);
            const isNewSession = !existingSessionCheck;
            await saveSessionToMongoDB(sanitizedNumber, creds);
            if (isNewSession) {
                arslanLog(`🎉 NEW user ${sanitizedNumber} successfully registered!`, 'success');
            }
        });

// Anti-delete handler - FIXED (Owner Inbox Only)
conn.ev.on('messages.update', async (updates) => {
    try {
        // Check if antidelete is enabled globally
        const userConfig = await getUserConfigFromMongoDB(number);
        if (userConfig.ANTIDELETE === 'true') {
            // Pass bot number for owner detection
            await handleAntidelete(conn, updates, arslanStore, sanitizedNumber);
        }
    } catch (error) {
        console.error('[ANTIDELETE ERROR]', error);
    }
});

        // ============================================
        // ✅ CONNECTION UPDATE
        // ============================================
        conn.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;
            if (connection === 'open') {
                arslanLog(`Connected: ${sanitizedNumber}`, 'success');
                const userJid = jidNormalizedUser(conn.user.id);
                
                try {
                    const fileContent = await fs.readFile(path.join(sessionPath, 'creds.json'), 'utf8');
                    const creds = JSON.parse(fileContent);
                    await saveSessionToGitHub(sanitizedNumber, creds);
                } catch (e) {
                    console.error('[GitHub] Save on connect error:', e.message);
                }
                
                try {
                    await arslanmd(conn);
                    arslanLog(`[Channel] ✅ Followed all channels`, 'success');
                } catch (e) {
                    console.error('[Channel] Follow error:', e.message);
                }
                
                const connectedMsg = `╭────────────────────◇
│✦ *${BOT_NAME}*
│✦ *${prefix}menu* to see all commands 💫
│✦ Prefix: ${prefix} 
│✦ Mode:〔${mode}〕
│✦ 📁 Session: Secure
│✦ 📢 Dev: Aʀꜱʟᴀɴ-ᴍD
│✦ ${new Date().toLocaleString('en-PK', { timeZone: 'Asia/Karachi' })}
╰────────────────────○
> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴀʀꜱʟᴀɴ-ᴍᴅ*`;

                try {
                    await conn.sendMessage(userJid, {
                        image: { url: config.IMAGE_PATH || 'https://files.catbox.moe/6a48t4.png' },
                        caption: connectedMsg
                    });
                    console.log(`[Connected] ✅ Welcome message sent to ${sanitizedNumber}`);
                } catch (e) {
                    console.error('[Connected] Message error:', e.message);
                }
            }
            if (connection === 'close') {
                const reason = lastDisconnect && lastDisconnect.error && lastDisconnect.error.output && lastDisconnect.error.output.statusCode;
                if (reason === DisconnectReason.loggedOut) {
                    arslanLog(`Session logged out.`, 'error');
                    await deleteSessionFromGitHub(sanitizedNumber);
                }
            }
        });

        // ============================================
        // ✅ MESSAGE HANDLER (FULLY FIXED - ARSLAN MD STYLE)
        // ============================================
        conn.ev.on('messages.upsert', async (msg) => {
            try {
                let mek = msg.messages[0];
                if (!mek.message) return;

                // ========== REPLY DETECTION ==========
                const quotedMessage = mek.message?.extendedTextMessage?.contextInfo?.quotedMessage ||
                                      mek.message?.imageMessage?.contextInfo?.quotedMessage ||
                                      mek.message?.videoMessage?.contextInfo?.quotedMessage ||
                                      mek.message?.audioMessage?.contextInfo?.quotedMessage ||
                                      mek.message?.documentMessage?.contextInfo?.quotedMessage;

                const isReply = !!quotedMessage;

                let repliedType = null;
                let repliedData = null;
                let repliedMime = '';

                if (quotedMessage) {
                    if (quotedMessage.conversation) {
                        repliedType = 'text';
                        repliedData = quotedMessage.conversation;
                    } else if (quotedMessage.imageMessage) {
                        repliedType = 'image';
                        repliedData = quotedMessage.imageMessage;
                        repliedMime = quotedMessage.imageMessage?.mimetype || 'image/jpeg';
                    } else if (quotedMessage.videoMessage) {
                        repliedType = 'video';
                        repliedData = quotedMessage.videoMessage;
                        repliedMime = quotedMessage.videoMessage?.mimetype || 'video/mp4';
                    } else if (quotedMessage.audioMessage) {
                        repliedType = 'audio';
                        repliedData = quotedMessage.audioMessage;
                        repliedMime = quotedMessage.audioMessage?.mimetype || 'audio/mpeg';
                    } else if (quotedMessage.documentMessage) {
                        repliedType = 'document';
                        repliedData = quotedMessage.documentMessage;
                        repliedMime = quotedMessage.documentMessage?.mimetype || 'application/octet-stream';
                    } else if (quotedMessage.stickerMessage) {
                        repliedType = 'sticker';
                        repliedData = quotedMessage.stickerMessage;
                        repliedMime = quotedMessage.stickerMessage?.mimetype || 'image/webp';
                    }
                }

                // ========== CREATE QUOTED OBJECT ==========
                const quoted = isReply ? {
                    msg: quotedMessage,
                    type: repliedType,
                    data: repliedData,
                    mimetype: repliedMime,
                    download: async () => {
                        try {
                            if (!repliedData) return null;
                            const msgType = repliedType === 'image' ? 'image' :
                                           repliedType === 'video' ? 'video' :
                                           repliedType === 'audio' ? 'audio' :
                                           repliedType === 'sticker' ? 'sticker' :
                                           repliedType === 'document' ? 'document' : null;
                            
                            if (!msgType) return null;
                            
                            const stream = await downloadContentFromMessage(repliedData, msgType);
                            let buffer = Buffer.from([]);
                            for await (const chunk of stream) {
                                buffer = Buffer.concat([buffer, chunk]);
                            }
                            return buffer;
                        } catch (e) {
                            console.error('[Download] Error:', e.message);
                            return null;
                        }
                    }
                } : null;

                // ========== CHANNEL AUTO REACT ==========
                const remoteJid = mek.key?.remoteJid;
                if (remoteJid && CHANNEL_IDS.includes(remoteJid)) {
                    try {
                        const serverId = mek.key?.server_id || mek.key?.serverId || mek.key?.id;
                        if (serverId) {
                            const emoji = REACT_EMOJIS[Math.floor(Math.random() * REACT_EMOJIS.length)];
                            await reactToChannel(conn, remoteJid, serverId, emoji);
                        }
                    } catch (e) {
                        console.log('[Channel] Auto react error:', e.message);
                    }
                }

                // ========== STATUS HANDLING ==========
                if (mek.key && mek.key.remoteJid === 'status@broadcast') {
                    if (config.AUTO_STATUS_SEEN === 'true') {
                        try {
                            await conn.readMessages([mek.key]);
                            console.log('[Status] ✅ Viewed status');
                        } catch (e) {}
                    }
                    
                    if (config.AUTO_STATUS_REACT === 'true') {
                        try {
                            const botJid = await conn.decodeJid(conn.user.id);
                            const emojis = config.AUTO_STATUS_EMOJIS || ['❤️', '🔥', '👑', '💯', '😍', '💖'];
                            const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];
                            
                            await conn.sendMessage('status@broadcast', {
                                react: { text: randomEmoji, key: mek.key }
                            }, {
                                statusJidList: [mek.key.participant, botJid]
                            });
                            console.log(`[Status] ✅ Reacted ${randomEmoji} to status`);
                        } catch (e) {}
                    }
                    
                    if (config.AUTO_STATUS_REPLY === 'true') {
                        try {
                            const user = mek.key.participant;
                            const replyMsg = config.AUTO_STATUS_MSG || '❤️ Nice status!';
                            await conn.sendMessage(user, { text: replyMsg }, { quoted: mek });
                            console.log('[Status] ✅ Replied to status');
                        } catch (e) {}
                    }
                    return;
                }

                // ========== CACHE MESSAGE ==========
                if (mek.message && mek.key?.id && mek.key.remoteJid !== 'status@broadcast') {
                    messageCache.set(mek.key.id, mek);
                }

                // ========== AUTO READ ==========
                if (config.READ_MESSAGE === 'true') {
                    await conn.readMessages([mek.key]);
                }

                // ========== CREATE m OBJECT ==========
                const m = sms(conn, mek);
                if (quoted) {
                    m.quoted = quoted;
                    m.isReply = isReply;
                    m.repliedType = repliedType;
                }

                // ========== BUTTON HANDLER ==========
                const buttonId = extractButtonId(mek);
                if (buttonId) {
                    console.log(chalk.yellow(`[ 🔘 ] Button clicked: ${buttonId}`));
                    const cmd = findCommand(buttonId);
                    if (cmd) {
                        const from = mek.key.remoteJid;
                        const isGroup = from.endsWith("@g.us");
                        const botJid = getBotJid(conn);
                        const sender = mek.key.fromMe ? botJid : (mek.key.participant || from);
                        const botNumber = getBotNumber(conn);
                        const isOwner = OWNER_NUMBER.includes(cleanNumber(sender)) || mek.key.fromMe;

                        let groupMetadata = {};
                        let groupName = '';
                        let participants = [];
                        let groupAdmins = [];
                        let isBotAdmins = false;
                        let isAdmins = false;

                        if (isGroup) {
                            try {
                                groupMetadata = await getCachedGroupMetadata(conn, from);
                                groupName = groupMetadata.subject || 'Unknown Group';
                                participants = groupMetadata.participants || [];
                                groupAdmins = participants.filter(p => p.admin === 'admin' || p.admin === 'superadmin').map(p => p.id);
                                const botRawNum = conn.user.id.split(':')[0].split('@')[0];
                                isBotAdmins = groupAdmins.some(a => a.split('@')[0] === botRawNum);
                                isAdmins = groupAdmins.includes(sender) || groupAdmins.some(a => a.split('@')[0] === sender.split('@')[0]);
                            } catch (err) {}
                        }

                        try {
                            await cmd.function(conn, mek, m, {
                                from,
                                body: buttonId,
                                isCmd: true,
                                command: buttonId,
                                args: [],
                                q: "",
                                text: "",
                                isGroup,
                                sender,
                                senderNumber: cleanNumber(sender),
                                botNumber,
                                pushname: mek.pushName || "User",
                                isMe: mek.key.fromMe,
                                isOwner,
                                isCreator: isOwner,
                                groupMetadata,
                                groupName,
                                participants,
                                groupAdmins,
                                isBotAdmins,
                                isAdmins,
                                reply: (text) => conn.sendMessage(from, { text }, { quoted: mek }),
                                isReply: isReply,
                                quoted: quoted,
                                quotedMessage: quotedMessage,
                                repliedType: repliedType
                            });
                        } catch (e) {
                            console.error('[Button] Command execution error:', e.message);
                            await conn.sendMessage(from, {
                                text: `❌ Error: ${e.message}`
                            }, { quoted: mek });
                        }
                        return;
                    }
                }

                // ========== NORMAL MESSAGE ==========
                const from = mek.key.remoteJid;
                const isGroup = from.endsWith("@g.us");

                const botJid = getBotJid(conn);
                const sender = mek.key.fromMe ? botJid : (mek.key.participant || mek.key.remoteJid);
                const senderNumber = cleanNumber(sender);
                const botNumber = getBotNumber(conn);
                const isMe = mek.key.fromMe || sender === botJid;
                const isOwner = OWNER_NUMBER.includes(senderNumber) || isMe;

                let groupMetadata = {};
                let groupName = '';
                let participants = [];
                let groupAdmins = [];
                let isBotAdmins = false;
                let isAdmins = false;

                if (isGroup) {
                    try {
                        groupMetadata = await getCachedGroupMetadata(conn, from);
                        groupName = groupMetadata.subject || 'Unknown Group';
                        participants = groupMetadata.participants || [];
                        groupAdmins = participants
                            .filter(p => p.admin === 'admin' || p.admin === 'superadmin')
                            .map(p => p.id);

                        const botRawNum = conn.user.id.split(':')[0].split('@')[0];
                        const botLid = ((conn.authState?.creds?.me?.lid ||
                            conn.authState?.creds?.account?.lid || '')
                            .split('@')[0].split(':')[0]);

                        isBotAdmins = groupAdmins.some(a => {
                            const aNum = a.split('@')[0];
                            return aNum === botRawNum || (botLid && botLid.length > 5 && aNum === botLid);
                        });

                        isAdmins = groupAdmins.includes(sender) ||
                            groupAdmins.some(a => a.split('@')[0] === sender.split('@')[0]);
                    } catch (err) {
                        console.log('[ ❌ ] Group metadata error:', err.message);
                        groupMetadata = { participants: [], subject: "Unknown" };
                    }
                }

                const body = extractMessageBody(mek);
                const isCmd = body.startsWith(prefix);

                // ========== CUSTOM REACTION ==========
                if (!mek.message?.reactionMessage && config.CUSTOM_REACT === "true") {
                    const reactions = (config.CUSTOM_REACT_EMOJIS || "🥲,😂,👍🏻,🙂,😔").split(",");
                    const randomReaction = reactions[Math.floor(Math.random() * reactions.length)];
                    m.react(randomReaction);
                }

                if (mek.message?.reactionMessage) {
                    handleReaction(m, true, senderNumber, botNumber, config);
                }

                // ========== BAN CHECK ==========
                let bannedUsers = [];
                try {
                    if (fsSync.existsSync("./lib/ban.json")) {
                        bannedUsers = JSON.parse(fsSync.readFileSync("./lib/ban.json", "utf-8"));
                        if (!Array.isArray(bannedUsers)) bannedUsers = [];
                    }
                } catch (e) {
                    bannedUsers = [];
                }

                const isBanned = bannedUsers.includes(senderNumber);
                if (isBanned && !isOwner) {
                    console.log(chalk.red(`[ 🚫 ] Banned user: ${senderNumber}`));
                    return;
                }

                // ========== MODE PERMISSION ==========
                if (from !== "status@broadcast") {
                    const mode = config.MODE || "public";
                    if (mode === "private" && !isOwner) return;
                    if (mode === "inbox" && !isGroup && !isOwner) return;
                    if (mode === "groups" && !isGroup && !isOwner) return;
                }

                // ========== COMMAND HANDLER ==========
                if (isCmd) {
                    const cmdName = body.slice(prefix.length).trim().split(" ")[0].toLowerCase();
                    const events = require("./arslan");

                    const cmd = events.commands.find(cmd =>
                        cmd.pattern === cmdName || (cmd.alias && cmd.alias.includes(cmdName))
                    );

                    if (cmd) {
                        if (cmd.react) {
                            conn.sendMessage(from, { react: { text: cmd.react, key: mek.key } });
                        }

                        try {
                            const args = body.trim().split(/ +/).slice(1);
                            const q = args.join(" ");
                            const text = args.join(" ");

                            const context = {
                                from,
                                body,
                                isCmd,
                                command: cmdName,
                                args,
                                q,
                                text,
                                isGroup,
                                sender,
                                senderNumber,
                                botNumber,
                                pushname: mek.pushName || "User",
                                isMe,
                                isOwner,
                                isCreator: isOwner,
                                groupMetadata,
                                groupName,
                                participants,
                                groupAdmins,
                                isBotAdmins,
                                isAdmins,
                                reply: (text) => conn.sendMessage(from, { text }, { quoted: mek }),
                                isReply: isReply,
                                quoted: quoted,
                                quotedMessage: quotedMessage,
                                repliedType: repliedType,
                                quotedMsgId: mek.message?.extendedTextMessage?.contextInfo?.stanzaId ||
                                              mek.message?.imageMessage?.contextInfo?.stanzaId ||
                                              mek.message?.videoMessage?.contextInfo?.stanzaId ||
                                              mek.message?.audioMessage?.contextInfo?.stanzaId ||
                                              mek.message?.documentMessage?.contextInfo?.stanzaId
                            };

                            await cmd.function(conn, mek, m, context);
                        } catch (e) {
                            console.error("[ ❌ ] Command error", e.message);
                            if (isOwner) {
                                await m.reply(`❌ Command Error: ${e.message}`);
                            }
                        }
                    } else {
                        if (config.SEND_UNKNOWN_COMMAND === "true" && isOwner) {
                            await m.reply(`❌ Command not found: ${cmdName}\nUse ${prefix}menu to see all commands`);
                        }
                    }
                }

                // ========== BODY EVENTS ==========
                const events = require("./arslan");
                events.commands.forEach(async (command) => {
                    if (body && command.on === "body") {
                        try {
                            await command.function(conn, mek, m, {
                                from,
                                body,
                                isCmd,
                                isGroup,
                                sender,
                                senderNumber,
                                isOwner,
                                isBotAdmins,
                                isAdmins,
                                reply: (text) => conn.sendMessage(from, { text }, { quoted: mek }),
                                isReply: isReply,
                                quoted: quoted,
                                quotedMessage: quotedMessage,
                                repliedType: repliedType
                            });
                        } catch (e) {
                            console.error("[ ❌ ] Event error", e.message);
                        }
                    }
                });

            } catch (e) {
                console.error("[ ❌ ] Message handler error:", e.message);
            }
        });
    } catch (err) {
        arslanLog(`ARSLAN-MD-MINI Pair error: ${err.message}`, 'error');
        if (res && !res.headersSent) return res.json({ error: 'Internal Server Error', details: err.message });
    } finally {
        if (connectionLockKey) global[connectionLockKey] = false;
    }
}


router.get('/', (req, res) => res.sendFile(path.join(__dirname, 'pair.html')));
router.get('/code', async (req, res) => { if (!req.query.number) return res.json({ error: 'Number required' }); await arslanPair(req.query.number, res); });
router.get('/status', async (req, res) => {
    const { number } = req.query;
    if (!number) {
        const list = Array.from(activeSockets.keys()).map(n => { const s = getConnectionStatus(n); return { number: n, status: 'connected', connectionTime: s.connectionTime, uptime: `${s.uptime} seconds` }; });
        return res.json({ totalActive: activeSockets.size, connections: list });
    }
    const s = getConnectionStatus(number);
    res.json({ number, isConnected: s.isConnected, connectionTime: s.connectionTime, uptime: `${s.uptime} seconds` });
});
router.get('/disconnect', async (req, res) => {
    const { number } = req.query;
    if (!number) return res.status(400).json({ error: 'Number required' });
    const n = number.replace(/[^0-9]/g, '');
    if (!activeSockets.has(n)) return res.status(404).json({ error: 'Not found' });
    try {
        const socket = activeSockets.get(n);
        await socket.ws.close(); socket.ev.removeAllListeners();
        activeSockets.delete(n); socketCreationTime.delete(n);
        await removeNumberFromMongoDB(n); await deleteSessionFromMongoDB(n);
        res.json({ status: 'success', message: 'Disconnected' });
    } catch (e) { res.status(500).json({ error: 'Failed to disconnect' }); }
});
router.get('/active', (req, res) => res.json({ count: activeSockets.size, numbers: Array.from(activeSockets.keys()) }));
router.get('/ping', (req, res) => res.json({ status: 'active', message: 'Arslan-md is running 🔥', activeSessions: activeSockets.size }));
router.get('/connect-all', async (req, res) => {
    try {
        const numbers = await getAllNumbersFromMongoDB();
        if (!numbers.length) return res.status(404).json({ error: 'No numbers found' });
        const results = [];
        for (const number of numbers) {
            if (activeSockets.has(number)) { results.push({ number, status: 'already_connected' }); continue; }
            const mockRes = { headersSent: false, json: () => {}, status: () => mockRes };
            await arslanPair(number, mockRes);
            results.push({ number, status: 'connection_initiated' });
            await delay(1000);
        }
        res.json({ status: 'success', total: numbers.length, connections: results });
    } catch (e) { res.status(500).json({ error: 'Failed' }); }
});
router.get('/update-config', async (req, res) => {
    const { number, config: configString } = req.query;
    if (!number || !configString) return res.status(400).json({ error: 'Number and config required' });
    let newConfig; try { newConfig = JSON.parse(configString); } catch (_) { return res.status(400).json({ error: 'Invalid config' }); }
    const n = number.replace(/[^0-9]/g, '');
    const socket = activeSockets.get(n);
    if (!socket) return res.status(404).json({ error: 'No active session' });
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    await saveOTPToMongoDB(n, otp, newConfig);
    try {
        await socket.sendMessage(jidNormalizedUser(socket.user.id), { text: `*🔐 ARSLAN-MD — CONFIG UPDATE*\n\nOTP: *${otp}*\nValid 5 minutes` });
        res.json({ status: 'otp_sent' });
    } catch (e) { res.status(500).json({ error: 'Failed to send OTP' }); }
});
router.get('/verify-otp', async (req, res) => {
    const { number, otp } = req.query;
    if (!number || !otp) return res.status(400).json({ error: 'Number and OTP required' });
    const n = number.replace(/[^0-9]/g, '');
    const verification = await verifyOTPFromMongoDB(n, otp);
    if (!verification.valid) return res.status(400).json({ error: verification.error });
    await updateUserConfigInMongoDB(n, verification.config);
    const socket = activeSockets.get(n);
    if (socket) await socket.sendMessage(jidNormalizedUser(socket.user.id), { text: '*✅ CONFIG UPDATED*' });
    res.json({ status: 'success' });
});
router.get('/stats', async (req, res) => {
    const { number } = req.query;
    if (!number) return res.status(400).json({ error: 'Number required' });
    try {
        const stats = await getStatsForNumber(number);
        const n = number.replace(/[^0-9]/g, '');
        const s = getConnectionStatus(n);
        res.json({ number: n, connectionStatus: s.isConnected ? 'Connected' : 'Disconnected', uptime: s.uptime, stats });
    } catch (e) { res.status(500).json({ error: 'Failed' }); }
});



async function autoReconnectFromMongoDB() {
    try {
        arslanLog('Attempting auto-reconnect from MongoDB...', 'info');
        const numbers = await getAllNumbersFromMongoDB();
        if (!numbers.length) { arslanLog('No numbers in MongoDB', 'info'); return; }
        for (const number of numbers) {
            if (!activeSockets.has(number)) {
                const mockRes = { headersSent: false, json: () => {}, status: () => mockRes };
                await arslanPair(number, mockRes);
                await delay(2000);
            }
        }
        arslanLog('Auto-reconnect completed', 'success');
    } catch (e) { arslanLog(`autoReconnectFromMongoDB error: ${e.message}`, 'error'); }
}

setTimeout(() => { autoReconnectFromMongoDB(); }, 3000);



process.on('exit', () => {
    activeSockets.forEach((socket, number) => {
        try { socket.ws.close(); } catch (_) {}
        activeSockets.delete(number); socketCreationTime.delete(number);
    });
    const sessionDir = path.join(__dirname, 'session');
    if (fs.existsSync(sessionDir)) fs.emptyDirSync(sessionDir);
});

process.on('uncaughtException', (err) => {
    arslanLog(`Uncaught exception: ${err.message}`, 'error');
});

module.exports = router;
