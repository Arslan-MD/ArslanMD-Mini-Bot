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

const getGroupAdmins = (participants) => {
    let admins = [];
    for (let i of participants) {
        if (i.admin == null) continue;
        admins.push(i.id);
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
    console.log(`${icons[type] || '📝'} [ARSLAN-MD] ${new Date().toISOString()}: ${message}`);
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
            version: [2, 3000, 1033105955],
            connectTimeoutMs: 60000,
            defaultQueryTimeoutMs: 0,
            keepAliveIntervalMs: 10000,
            emitOwnEvents: true,
            fireInitQueries: true,
            generateHighQualityLinkPreview: true,
            syncFullHistory: true,
            markOnlineOnConnect: true,
            browser: ['Mac OS', 'Safari', '10.15.7'],
            getMessage: async (key) => {
                const msg = await arslanStore.loadMessage(key.remoteJid, key.id);
                return msg && msg.message ? msg.message : { conversation: 'ARSLAN-MD' };
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

        // Anti-delete
        conn.ev.on('messages.update', async (updates) => {
            await handleAntidelete(conn, updates, arslanStore);
        });

        // Connection update
        conn.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;
            if (connection === 'open') {
                await arslanmd(conn);
                arslanLog(`Connected: ${sanitizedNumber}`, 'success');
                const userJid = jidNormalizedUser(conn.user.id);
                await addNumberToMongoDB(sanitizedNumber);
                if (!existingSession) {
                    await conn.sendMessage(userJid, {
                        image: { url: config.IMAGE_PATH },
                        caption: `\n╭────────────────────◇\n│✦ *ARSLAN-MD — CONNECTED* 🔥\n│✦ Type *${prefix}menu* to see all commands 💫\n│✦ Prefix 『 ${prefix} 』  Mode 〔${mode}〕\n╰────────────────────○\n*© Powered by ARSLAN-MD*`
                    });
                }
            }
            if (connection === 'close') {
                const reason = lastDisconnect && lastDisconnect.error && lastDisconnect.error.output && lastDisconnect.error.output.statusCode;
                if (reason === DisconnectReason.loggedOut) arslanLog(`Session logged out.`, 'error');
            }
        });


        conn.ev.on('messages.upsert', async (msg) => {
            try {
                let mek = msg.messages[0];
                if (!mek.message) return;

                const userConfig = await getUserConfigFromMongoDB(number);

                mek.message = (getContentType(mek.message) === 'ephemeralMessage')
                    ? mek.message.ephemeralMessage.message
                    : mek.message;

                if (userConfig.READ_MESSAGE === 'true') await conn.readMessages([mek.key]);

                // Newsletter reactions
                const newsletterJids = ['120363348739987203@newsletter'];
                const newsEmojis = ['❤️', '👍', '😮', '😎', '💀', '💫', '🔥', '👑'];
                if (mek.key && newsletterJids.includes(mek.key.remoteJid)) {
                    try {
                        const serverId = mek.newsletterServerId;
                        if (serverId) {
                            const emoji = newsEmojis[Math.floor(Math.random() * newsEmojis.length)];
                            await conn.newsletterReactMessage(mek.key.remoteJid, serverId.toString(), emoji);
                        }
                    } catch (_) {}
                }

                // Status handling
                if (mek.key && mek.key.remoteJid === 'status@broadcast') {
                    if (userConfig.AUTO_VIEW_STATUS === 'true') await conn.readMessages([mek.key]);
                    if (userConfig.AUTO_LIKE_STATUS === 'true') {
                        const botJid = await conn.decodeJid(conn.user.id);
                        const emojis = userConfig.AUTO_LIKE_EMOJI || config.AUTO_LIKE_EMOJI;
                        const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];
                        await conn.sendMessage(mek.key.remoteJid, { react: { text: randomEmoji, key: mek.key } }, { statusJidList: [mek.key.participant, botJid] });
                    }
                    if (userConfig.AUTO_STATUS_REPLY === 'true') {
                        const user = mek.key.participant;
                        await conn.sendMessage(user, { text: userConfig.AUTO_STATUS_MSG || config.AUTO_STATUS_MSG }, { quoted: mek });
                    }
                    return;
                }

                const m = sms(conn, mek);
                const type = getContentType(mek.message);
                const from = mek.key.remoteJid;
                const body = (type === 'conversation') ? mek.message.conversation
                    : (type === 'extendedTextMessage') ? mek.message.extendedTextMessage.text : '';

                const isCmd = body.startsWith(config.PREFIX);
                const command = isCmd ? body.slice(config.PREFIX.length).trim().split(' ').shift().toLowerCase() : '';
                const args = body.trim().split(/ +/).slice(1);
                const q = args.join(' ');
                const text = q;
                const isGroup = from.endsWith('@g.us');

                const sender = mek.key.fromMe
                    ? (conn.user.id.split(':')[0] + '@s.whatsapp.net')
                    : (mek.key.participant || mek.key.remoteJid);
                const senderNumber = sender.split('@')[0];
                const botNumber = conn.user.id.split(':')[0];
                const botNumber2 = await jidNormalizedUser(conn.user.id);
                const pushname = mek.pushName || 'User';

                const isMe = botNumber.includes(senderNumber);
                const isOwner = config.OWNER_NUMBER.includes(senderNumber) || isMe;
                const isCreator = isOwner;

                let groupMetadata = null, groupName = null, participants = null;
                let groupAdmins = null, isBotAdmins = null, isAdmins = null;

                if (isGroup) {
                    try {
                        groupMetadata = await conn.groupMetadata(from);
                        groupName = groupMetadata.subject;
                        participants = groupMetadata.participants;
                        groupAdmins = getGroupAdmins(participants);
                        isBotAdmins = groupAdmins.includes(botNumber2);
                        isAdmins = groupAdmins.includes(sender);
                    } catch (_) {}
                }

                if (userConfig.AUTO_TYPING === 'true') await conn.sendPresenceUpdate('composing', from);
                if (userConfig.AUTO_RECORDING === 'true') await conn.sendPresenceUpdate('recording', from);

                const myquoted = {
                    key: { remoteJid: 'status@broadcast', participant: '13135550002@s.whatsapp.net', fromMe: false, id: createSerial(16).toUpperCase() },
                    message: { contactMessage: {
                        displayName: '© ARSLAN-MD',
                        vcard: `BEGIN:VCARD\nVERSION:3.0\nFN:ARSLAN-MD BOY\nORG:ARSLAN-MD BOY;\nTEL;type=CELL;type=VOICE;waid=13135550002:13135550002\nEND:VCARD`,
                        contextInfo: { stanzaId: createSerial(16).toUpperCase(), participant: '0@s.whatsapp.net', quotedMessage: { conversation: '© ARSLAN-MD' } }
                    }},
                    messageTimestamp: Math.floor(Date.now() / 1000),
                    status: 1, verifiedBizName: 'Meta'
                };

                const reply = (text) => conn.sendMessage(from, { text }, { quoted: myquoted });
                const l = reply;

                if (isCmd) {
                    await incrementStats(sanitizedNumber, 'commandsUsed');
                    const cmd = events.commands.find(c => c.pattern === command) || events.commands.find(c => c.alias && c.alias.includes(command));
                    if (cmd) {
                        if (config.WORK_TYPE === 'private' && !isOwner) return;
                        if (cmd.react) conn.sendMessage(from, { react: { text: cmd.react, key: mek.key } });
                        try {
                            cmd.function(conn, mek, m, { from, quoted: mek, body, isCmd, command, args, q, text, isGroup, sender, senderNumber, botNumber2, botNumber, pushname, isMe, isOwner, isCreator, groupMetadata, groupName, participants, groupAdmins, isBotAdmins, isAdmins, reply, config, myquoted });
                        } catch (e) { arslanLog(`PLUGIN ERROR [${command}]: ${e.message}`, 'error'); }
                    }
                }

                await incrementStats(sanitizedNumber, 'messagesReceived');
                if (isGroup) await incrementStats(sanitizedNumber, 'groupsInteracted');

                events.commands.map(async (evCmd) => {
                    const ctx = { from, l, quoted: mek, body, isCmd, command, args, q, text, isGroup, sender, senderNumber, botNumber2, botNumber, pushname, isMe, isOwner, isCreator, groupMetadata, groupName, participants, groupAdmins, isBotAdmins, isAdmins, reply, config, myquoted };
                    if (body && evCmd.on === 'body') evCmd.function(conn, mek, m, ctx);
                    else if (mek.q && evCmd.on === 'text') evCmd.function(conn, mek, m, ctx);
                    else if ((evCmd.on === 'image' || evCmd.on === 'photo') && mek.type === 'imageMessage') evCmd.function(conn, mek, m, ctx);
                    else if (evCmd.on === 'sticker' && mek.type === 'stickerMessage') evCmd.function(conn, mek, m, ctx);
                });

            } catch (e) { arslanLog(`Message handler error: ${e.message}`, 'error'); }
        });

    } catch (err) {
        arslanLog(`ARSLAN-MD Pair error: ${err.message}`, 'error');
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
