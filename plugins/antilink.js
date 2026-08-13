// ============================================
// 🔗 ANTI-LINK - ARSLAN-MD MINI
// 👑 Developer: ᴀʀꜱʟᴀɴ-ᴍᴅ
// 🔥 Auto delete links + Warn + Kick
// ============================================

const { arslan } = require('../arslan');
const config = require('../config');

// ─── ALLOWED DOMAINS ───
const ALLOWED_DOMAINS = [
    'whatsapp.com',
    'wa.me',
    'youtube.com',
    'youtu.be',
    'instagram.com',
    'facebook.com',
    'twitter.com',
    'x.com',
    'tiktok.com',
    'github.com',
    'google.com',
    'drive.google.com'
];

// ─── LINK PATTERNS ───
const LINK_PATTERNS = [
    /https?:\/\/[^\s]+/gi,
    /www\.[^\s]+/gi,
    /[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi
];

// ─── CHECK IF LINK IS ALLOWED ───
function isAllowedLink(url) {
    try {
        const urlObj = new URL(url);
        const hostname = urlObj.hostname.toLowerCase();
        return ALLOWED_DOMAINS.some(domain => hostname.includes(domain));
    } catch {
        return false;
    }
}

// ─── EXTRACT LINKS FROM TEXT ───
function extractLinks(text) {
    const links = [];
    for (const pattern of LINK_PATTERNS) {
        const matches = text.match(pattern);
        if (matches) {
            for (const match of matches) {
                if (!links.includes(match)) {
                    links.push(match);
                }
            }
        }
    }
    return links;
}

// ============================================
// 📌 MAIN COMMAND
// ============================================
arslan({
    pattern: "antilink",
    alias: ["al", "nolink", "linkfilter"],
    desc: "🔗 Anti-Link System for groups",
    category: "admin",
    react: "🔗",
    filename: __filename
}, async (arslan, mek, m, { from, isGroup, isAdmins, isBotAdmins, isOwner, reply, args, prefix }) => {

    // ─── CHECK GROUP ───
    if (!isGroup) {
        return reply("❌ This command only works in groups.");
    }

    // ─── CHECK ADMIN PERMISSION ───
    if (!isAdmins && !isOwner) {
        return reply("❌ You need to be an admin to use this command.");
    }

    if (!isBotAdmins) {
        return reply("❌ I need to be an admin to enable anti-link.");
    }

    // ─── INIT GLOBAL ───
    if (!global.ANTILINK_STATUS) global.ANTILINK_STATUS = {};
    if (!global.ANTILINK_ACTION) global.ANTILINK_ACTION = {};
    if (!global.ANTILINK_WARN) global.ANTILINK_WARN = {};

    // ─── GET ARGUMENT ───
    const action = args[0]?.toLowerCase() || '';
    const actionType = args[1]?.toLowerCase() || 'warn';

    // ─── SHOW STATUS ───
    if (!action || (action !== 'on' && action !== 'off')) {
        const status = global.ANTILINK_STATUS[from] ? '✅ ON' : '❌ OFF';
        const actionMode = global.ANTILINK_ACTION[from] || 'warn';
        
        return reply(`🔗 *Anti-Link System*

📌 *Status:* ${status}
⚡ *Action:* ${actionMode.toUpperCase()}

📌 *Commands:*
• ${prefix}antilink on warn - Warn on links
• ${prefix}antilink on delete - Delete links
• ${prefix}antilink on kick - Kick on links
• ${prefix}antilink off - Disable system

💖 *Powered by ARSLAN-MD*`);
    }

    // ─── TOGGLE ON ───
    if (action === 'on') {
        global.ANTILINK_STATUS[from] = true;
        global.ANTILINK_ACTION[from] = actionType || 'warn';
        
        const actionMsg = {
            'warn': '⚠️ Warn user',
            'delete': '🗑️ Delete message + Warn',
            'kick': '👢 Kick user + Warn'
        }[actionType] || '⚠️ Warn user';

        await reply(`✅ *Anti-Link Activated!*

📌 *Action:* ${actionMsg}
🔹 *Links will be filtered (except allowed domains).*

💖 Powered by ARSLAN-MD`);

        await arslan.sendMessage(from, {
            text: `╭────────────────────◇
│✦ *🔗 ANTI-LINK ACTIVATED* 🔥
│✦ Group: ${mek.pushName || 'Unknown'}
│✦ Status: ✅ ON
│✦ Action: ${actionMsg}
│✦ Admin: @${mek.key.participant?.split('@')[0] || 'Unknown'}
╰────────────────────○
*© Powered by ARSLAN-MD*`,
            mentions: [mek.key.participant]
        });

    // ─── TOGGLE OFF ───
    } else if (action === 'off') {
        global.ANTILINK_STATUS[from] = false;
        delete global.ANTILINK_ACTION[from];
        
        await reply(`❌ *Anti-Link Deactivated!*

📌 Links will no longer be filtered.

💖 Powered by ARSLAN-MD`);
    }
});

// ============================================
// 📌 ANTI-LINK HANDLER (Auto)
// ============================================

// ─── LISTEN FOR MESSAGES ───
arslan({
    pattern: "antilink_handler",
    on: "body",
    filename: __filename
}, async (arslan, mek, m, { from, isGroup, isBotAdmins, isAdmins, isOwner, sender, senderNumber, reply }) => {

    // ─── SKIP IF NOT GROUP ───
    if (!isGroup) return;

    // ─── SKIP IF ANTI-LINK OFF ───
    if (!global.ANTILINK_STATUS?.[from]) return;

    // ─── SKIP IF BOT NOT ADMIN ───
    if (!isBotAdmins) return;

    // ─── SKIP ADMINS & OWNER ───
    if (isAdmins || isOwner) return;

    // ─── GET MESSAGE BODY ───
    const body = mek.message?.conversation || 
                 mek.message?.extendedTextMessage?.text || 
                 mek.message?.imageMessage?.caption ||
                 mek.message?.videoMessage?.caption || '';
    
    if (!body) return;

    // ─── CHECK FOR LINKS ───
    const links = extractLinks(body);
    if (links.length === 0) return;

    // ─── CHECK IF ALL LINKS ARE ALLOWED ───
    const hasDisallowedLink = links.some(link => !isAllowedLink(link));
    if (!hasDisallowedLink) return;

    // ─── GET ACTION ───
    const action = global.ANTILINK_ACTION[from] || 'warn';

    // ─── INIT WARN COUNT ───
    if (!global.ANTILINK_WARN[from]) global.ANTILINK_WARN[from] = {};
    if (!global.ANTILINK_WARN[from][senderNumber]) global.ANTILINK_WARN[from][senderNumber] = 0;

    // ─── INCREMENT WARN ───
    global.ANTILINK_WARN[from][senderNumber]++;

    // ─── DELETE MESSAGE ───
    try {
        await arslan.sendMessage(from, {
            delete: mek.key
        });
        console.log(`[AntiLink] 🗑️ Deleted link message from ${senderNumber}`);
    } catch (e) {
        console.log('[AntiLink] Delete error:', e.message);
    }

    // ─── WARN USER ───
    const warnCount = global.ANTILINK_WARN[from][senderNumber];
    const maxWarns = 3;
    const linkDisplay = links.slice(0, 2).join(', ') + (links.length > 2 ? ` (+${links.length - 2} more)` : '');
    
    const warnMsg = `🔗 *Link detected!*

📌 Links: \`${linkDisplay}\`
👤 User: @${senderNumber}
📊 Warn: ${warnCount}/${maxWarns}

💖 Powered by ARSLAN-MD`;

    await arslan.sendMessage(from, {
        text: warnMsg,
        mentions: [sender]
    });

    // ─── ACTION: KICK ───
    if (action === 'kick' && warnCount >= maxWarns) {
        try {
            await arslan.groupParticipantsUpdate(from, [sender], 'remove');
            await arslan.sendMessage(from, {
                text: `👢 *User kicked!*

📌 Reason: Repeated links (${warnCount} warns)
👤 User: @${senderNumber}

💖 Powered by ARSLAN-MD`,
                mentions: [sender]
            });
            
            delete global.ANTILINK_WARN[from][senderNumber];
            console.log(`[AntiLink] 👢 Kicked ${senderNumber} for links`);
        } catch (e) {
            console.log('[AntiLink] Kick error:', e.message);
        }
    }
});

console.log('🔗 ARSLAN-MD - Anti-Link Plugin Loaded! 💖');
