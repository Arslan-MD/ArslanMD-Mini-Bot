// ============================================
// 📁 data/presence.js - PRESENCE CONTROL
// 👑 Developer: ᴀʀꜱʟᴀɴ-ᴍᴅ
// 🔥 Auto typing, recording, online status
// ============================================

const config = require('../config');

/**
 * 🟢 Presence Control - Auto typing/recording
 * @param {Object} conn - WhatsApp socket
 * @param {Object} update - Presence update data
 */
async function PresenceControl(conn, update) {
    try {
        if (!update || !update.id) return;
        
        const { id, presences } = update;
        
        // Check if presence tracking is enabled
        if (config.PRESENCE_CONTROL !== 'true') return;
        
        // Get user config from database if available
        let userConfig = {};
        try {
            const { getUserConfigFromMongoDB } = require('../lib/database');
            userConfig = await getUserConfigFromMongoDB(id.split('@')[0]) || {};
        } catch (e) {
            // Database not available, use config
            userConfig = {
                AUTO_TYPING: config.AUTO_TYPING || 'false',
                AUTO_RECORDING: config.AUTO_RECORDING || 'false',
                AUTO_ONLINE: config.AUTO_ONLINE || 'false'
            };
        }
        
        // Auto typing
        if (userConfig.AUTO_TYPING === 'true' || config.AUTO_TYPING === 'true') {
            try {
                await conn.sendPresenceUpdate('composing', id);
            } catch (e) {}
        }
        
        // Auto recording
        if (userConfig.AUTO_RECORDING === 'true' || config.AUTO_RECORDING === 'true') {
            try {
                await conn.sendPresenceUpdate('recording', id);
            } catch (e) {}
        }
        
        // Auto online
        if (userConfig.AUTO_ONLINE === 'true' || config.AUTO_ONLINE === 'true') {
            try {
                await conn.sendPresenceUpdate('available', id);
            } catch (e) {}
        }
        
    } catch (error) {
        console.error('[PresenceControl] Error:', error.message);
    }
}

/**
 * 🟢 Bot Activity Filter - Manage bot presence
 * @param {Object} conn - WhatsApp socket
 */
async function BotActivityFilter(conn) {
    try {
        if (!conn) return;
        
        // Set bot online status
        if (config.BOT_ONLINE === 'true') {
            try {
                await conn.sendPresenceUpdate('available');
            } catch (e) {}
        }
        
        // Keep bot online with periodic updates
        if (config.KEEP_ONLINE === 'true') {
            const interval = setInterval(async () => {
                try {
                    await conn.sendPresenceUpdate('available');
                } catch (e) {
                    clearInterval(interval);
                }
            }, 30000); // Every 30 seconds
            
            // Store interval for cleanup
            if (!global._presenceIntervals) {
                global._presenceIntervals = [];
            }
            global._presenceIntervals.push(interval);
        }
        
    } catch (error) {
        console.error('[BotActivityFilter] Error:', error.message);
    }
}

/**
 * 🟢 Cleanup presence intervals
 */
function cleanupPresence() {
    if (global._presenceIntervals) {
        for (const interval of global._presenceIntervals) {
            clearInterval(interval);
        }
        global._presenceIntervals = [];
    }
}

// Export functions
module.exports = {
    PresenceControl,
    BotActivityFilter,
    cleanupPresence
};
