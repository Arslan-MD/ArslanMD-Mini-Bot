// plugins/antidelete.js
const { cmd } = require("../arslan");
const { updateUserConfigInMongoDB } = require('../lib/database');

cmd({
    pattern: "antidelete",
    alias: ["ad", "antidel"],
    desc: "Enable/Disable antidelete feature",
    category: "owner",
    react: "🛡️",
    filename: __filename
}, async (conn, mek, m, {
    from,
    reply,
    args,
    sender,
    isCreator
}) => {
    try {
        if (!isCreator) return reply("❌ Only bot owner can use this command.");
        
        const action = args[0]?.toLowerCase();
        if (!action || !['on', 'off', 'enable', 'disable'].includes(action)) {
            return reply(`📋 *Antidelete Settings*\n\n` +
                        `Usage: .antidelete <on/off>\n` +
                        `Example: .antidelete on\n\n` +
                        `Current Status: ${global.antideleteStatus || 'ON'}\n\n` +
                        `⚠️ Deleted messages will be sent to owner's inbox only.`);
        }
        
        const status = action === 'on' || action === 'enable' ? 'true' : 'false';
        
        // Update in database for current user
        const userNumber = sender.split('@')[0];
        await updateUserConfigInMongoDB(userNumber, { ANTIDELETE: status });
        
        global.antideleteStatus = status === 'true' ? 'ON' : 'OFF';
        
        reply(`✅ Antidelete ${status === 'true' ? 'enabled' : 'disabled'} successfully!\n\n` +
              `📩 Deleted messages will be sent to owner's inbox only.`);
        
    } catch (error) {
        console.error("Antidelete command error:", error);
        reply("❌ Failed to update antidelete settings.");
    }
});

// Command to check antidelete status
cmd({
    pattern: "antidelstatus",
    alias: ["adstatus", "checkad"],
    desc: "Check antidelete status",
    category: "owner",
    react: "📊",
    filename: __filename
}, async (conn, mek, m, {
    from,
    reply,
    sender,
    isCreator
}) => {
    try {
        if (!isCreator) return reply("❌ Only bot owner can use this command.");
        
        const userNumber = sender.split('@')[0];
        const config = await getUserConfigFromMongoDB(userNumber);
        const status = config.ANTIDELETE || 'true';
        
        reply(`📊 *Antidelete Status*\n\n` +
              `🔹 Status: ${status === 'true' ? '✅ ENABLED' : '❌ DISABLED'}\n` +
              `📩 Delivery: Owner's Inbox Only\n` +
              `👤 Owner: @${sender.split('@')[0]}\n\n` +
              `To change: .antidelete on/off`);
              
    } catch (error) {
        console.error("Status check error:", error);
        reply("❌ Failed to check status.");
    }
});
