// lib/antidelete.js
const { getContentType } = require('@whiskeysockets/baileys');
const config = require('../config');

async function handleAntidelete(conn, updates, store, botNumber) {
    try {
        // Get bot owner numbers from config
        const ownerNumbers = config.OWNER_NUMBER || [];
        if (!ownerNumbers.length) {
            console.log('[ANTIDELETE] No owner numbers configured');
            return;
        }

        // Convert owner numbers to JIDs
        const ownerJids = ownerNumbers.map(num => {
            const cleanNum = num.replace(/[^0-9]/g, '');
            return cleanNum + '@s.whatsapp.net';
        });

        for (const update of updates) {
            // Check if message is deleted
            if (update.update && update.update.message) {
                const message = update.update.message;
                const key = update.key;
                
                // Check if it's a protocol message (delete)
                if (message.protocolMessage && message.protocolMessage.type === 0) {
                    const deletedMessageKey = message.protocolMessage.key;
                    
                    // Get the deleted message from store
                    const deletedMsg = await store.loadMessage(
                        deletedMessageKey.remoteJid,
                        deletedMessageKey.id
                    );
                    
                    if (deletedMsg && deletedMsg.message) {
                        // Get sender info
                        const sender = deletedMsg.key.participant || deletedMsg.key.remoteJid;
                        const from = deletedMsg.key.remoteJid;
                        const isGroup = from.endsWith('@g.us');
                        
                        // Get message content
                        let content = '';
                        let msgType = getContentType(deletedMsg.message);
                        
                        // Handle ephemeral messages
                        if (msgType === 'ephemeralMessage') {
                            deletedMsg.message = deletedMsg.message.ephemeralMessage.message;
                            msgType = getContentType(deletedMsg.message);
                        }
                        
                        if (msgType === 'conversation') {
                            content = deletedMsg.message.conversation;
                        } else if (msgType === 'extendedTextMessage') {
                            content = deletedMsg.message.extendedTextMessage.text;
                        } else if (msgType === 'imageMessage') {
                            content = '🖼️ Image' + (deletedMsg.message.imageMessage.caption ? `\n📝 Caption: ${deletedMsg.message.imageMessage.caption}` : '');
                        } else if (msgType === 'videoMessage') {
                            content = '🎥 Video' + (deletedMsg.message.videoMessage.caption ? `\n📝 Caption: ${deletedMsg.message.videoMessage.caption}` : '');
                        } else if (msgType === 'audioMessage') {
                            content = '🎵 Audio';
                        } else if (msgType === 'stickerMessage') {
                            content = '🎨 Sticker';
                        } else if (msgType === 'documentMessage') {
                            content = '📄 Document' + (deletedMsg.message.documentMessage.fileName ? `\n📁 File: ${deletedMsg.message.documentMessage.fileName}` : '');
                        } else if (msgType === 'locationMessage') {
                            content = '📍 Location';
                        } else if (msgType === 'contactMessage') {
                            content = '👤 Contact';
                        } else if (msgType === 'buttonsMessage') {
                            content = '🔘 Buttons';
                        } else if (msgType === 'listMessage') {
                            content = '📋 List';
                        } else {
                            content = '📨 Media/Message';
                        }
                        
                        // Get chat name
                        let chatName = isGroup ? await getGroupName(conn, from) : 'Private Chat';
                        let senderName = deletedMsg.pushName || sender.split('@')[0];
                        
                        // Prepare antidelete message
                        const antidelMsg = `⚠️ *MESSAGE DELETED DETECTED!*\n\n` +
                                          `📱 *From:* ${senderName}\n` +
                                          `👤 *Number:* @${sender.split('@')[0]}\n` +
                                          `💬 *Chat:* ${chatName}\n` +
                                          `📝 *Message:* ${content}\n` +
                                          `🕐 *Time:* ${new Date().toLocaleString()}\n` +
                                          `📌 *Type:* ${isGroup ? 'Group' : 'Private'}`;
                        
                        // Send to ALL owners
                        for (const ownerJid of ownerJids) {
                            try {
                                await conn.sendMessage(ownerJid, {
                                    text: antidelMsg,
                                    mentions: [sender]
                                });
                                console.log(`[ANTIDELETE] Sent to owner: ${ownerJid}`);
                            } catch (err) {
                                console.error(`[ANTIDELETE] Failed to send to ${ownerJid}:`, err);
                            }
                        }
                        
                        console.log(`[ANTIDELETE] Deleted message from ${sender} in ${from}: ${content}`);
                    }
                }
            }
        }
    } catch (error) {
        console.error('[ANTIDELETE ERROR]', error);
    }
}

// Helper function to get group name
async function getGroupName(conn, jid) {
    try {
        const metadata = await conn.groupMetadata(jid);
        return metadata.subject || 'Unknown Group';
    } catch (error) {
        return 'Unknown Group';
    }
}

module.exports = { handleAntidelete };
