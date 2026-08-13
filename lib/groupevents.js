// ============================================
// 📁 lib/groupevents.js - FIXED
// ============================================

// ========== FIX: Check if config exists ==========
const config = require('../config');
const { sms } = require('./msg');

// ========== FIX: Safely require ==========
let GroupEvents = {};

try {
    // Your group events logic here
    GroupEvents = async (conn, update) => {
        try {
            const { id, participants, action } = update;
            
            if (!id || !participants) return;
            
            // Get group metadata
            let groupMetadata;
            try {
                groupMetadata = await conn.groupMetadata(id);
            } catch (e) {
                return;
            }
            
            // Get group admins
            const admins = groupMetadata.participants
                .filter(p => p.admin === 'admin' || p.admin === 'superadmin')
                .map(p => p.id);
            
            // Bot JID
            const botJid = conn.user.id.split(':')[0] + '@s.whatsapp.net';
            
            // Check if bot is admin
            const isBotAdmin = admins.includes(botJid);
            
            // Process each participant
            for (const participant of participants) {
                const userJid = participant.id || participant;
                
                if (action === 'add') {
                    // New member added
                    if (config.GROUP_WELCOME === 'true') {
                        const welcomeMsg = config.WELCOME_MESSAGE || '👋 Welcome to the group!';
                        await conn.sendMessage(id, {
                            text: `@${userJid.split('@')[0]} ${welcomeMsg}`,
                            mentions: [userJid]
                        });
                    }
                } else if (action === 'remove') {
                    // Member removed
                    if (config.GROUP_GOODBYE === 'true') {
                        const goodbyeMsg = config.GOODBYE_MESSAGE || '👋 Goodbye!';
                        await conn.sendMessage(id, {
                            text: `@${userJid.split('@')[0]} ${goodbyeMsg}`,
                            mentions: [userJid]
                        });
                    }
                } else if (action === 'promote') {
                    // Member promoted to admin
                    if (isBotAdmin) {
                        await conn.sendMessage(id, {
                            text: `@${userJid.split('@')[0]} is now an admin! 👑`,
                            mentions: [userJid]
                        });
                    }
                } else if (action === 'demote') {
                    // Member demoted from admin
                    if (isBotAdmin) {
                        await conn.sendMessage(id, {
                            text: `@${userJid.split('@')[0]} is no longer an admin.`,
                            mentions: [userJid]
                        });
                    }
                }
            }
            
        } catch (error) {
            console.error('[GroupEvents] Error:', error.message);
        }
    };
    
} catch (error) {
    console.error('[GroupEvents] Load error:', error.message);
    GroupEvents = async () => {};
}

module.exports = GroupEvents;
