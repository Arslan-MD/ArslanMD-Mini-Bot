// ============================================
// 🚫 ANTI-BAD WORDS - ARSLAN-MD MINI
// 👑 Developer: ᴀʀꜱʟᴀɴ-ᴍᴅ
// 🔥 Auto delete bad words + Warn + Kick
// ============================================

const { arslan } = require('../arslan');
const config = require('../config');

// ─── BAD WORDS LIST ───
const BAD_WORDS = [
    // English
    'fuck', 'shit', 'bitch', 'asshole', 'damn', 'hell', 'crap',
    'dick', 'pussy', 'cock', 'whore', 'slut', 'bastard', 'motherfucker',
    'nigga', 'nigger', 'retard', 'idiot', 'stupid', 'dumb',
    
    // Urdu/Hindi
    'bhosdi', 'bhosri', 'chutiya', 'chut', 'gand', 'gaand',
    'madarchod', 'behenchod', 'bhenchod', 'lode', 'lund',
    'kutti', 'kutta', 'harami', 'nalayak', 'hijda',
    
    // Roman Urdu
    'bsdk', 'mc', 'bc', 'mkc', 'bkc', 'rndi', 'randi',
    'chutiyapa', 'bhosdike', 'bhosdiwale', 'madarchod',
    'bhenkelode', 'bhenkelund', 'teri maa ki', 'teri behan ki'
];

// ─── BAD WORD PATTERNS (Regex) ───
const BAD_PATTERNS = [
    /f[uck]+/gi,
    /s[h!]?it/gi,
    /b[i!]tch/gi,
    /a[s$]sho[l!]e/gi,
    /b[s$]dk/gi,
    /mc/gi,
    /bc/gi,
    /mkc/gi,
    /bkc/gi,
    /chutiya/gi,
    /g[a@]nd/gi,
    /l[u@]nd/gi,
    /r[a@]ndi/gi,
    /h[a@]rami/gi
];

// ============================================
// 📌 MAIN COMMAND
// ============================================
arslan({
    pattern: "antibad",
    alias: ["ab", "badword", "filterbad", "badfilter"],
    desc: "🚫 Anti-Bad Words System for groups",
    category: "admin",
    react: "🚫",
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
        return reply("❌ I need to be an admin to enable anti-bad words.");
    }

    // ─── INIT GLOBAL ───
    if (!global.ANTIBAD_STATUS) global.ANTIBAD_STATUS = {};
    if (!global.ANTIBAD_ACTION) global.ANTIBAD_ACTION = {};
    if (!global.ANTIBAD_WARN) global.ANTIBAD_WARN = {};

    // ─── GET ARGUMENT ───
    const action = args[0]?.toLowerCase() || '';
    const actionType = args[1]?.toLowerCase() || 'warn';

    // ─── SHOW STATUS ───
    if (!action || (action !== 'on' && action !== 'off')) {
        const status = global.ANTIBAD_STATUS[from] ? '✅ ON' : '❌ OFF';
        const actionMode = global.ANTIBAD_ACTION[from] || 'warn';
        
        return reply(`🚫 *Anti-Bad Words System*

📌 *Status:* ${status}
⚡ *Action:* ${actionMode.toUpperCase()}

📌 *Commands:*
• ${prefix}antibad on warn - Warn on bad words
• ${prefix}antibad on delete - Delete bad words
• ${prefix}antibad on kick - Kick on bad words
• ${prefix}antibad off - Disable system

💖 *Powered by ARSLAN-MD*`);
    }

    // ─── TOGGLE ON ───
    if (action === 'on') {
        global.ANTIBAD_STATUS[from] = true;
        global.ANTIBAD_ACTION[from] = actionType || 'warn';
        
        const actionMsg = {
            'warn': '⚠️ Warn user',
            'delete': '🗑️ Delete message + Warn',
            'kick': '👢 Kick user + Warn'
        }[actionType] || '⚠️ Warn user';

        await reply(`✅ *Anti-Bad Words Activated!*

📌 *Action:* ${actionMsg}
🔹 *Bad words will be filtered.*

💖 Powered by ARSLAN-MD`);

        await arslan.sendMessage(from, {
            text: `╭────────────────────◇
│✦ *🚫 ANTI-BAD ACTIVATED* 🔥
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
        global.ANTIBAD_STATUS[from] = false;
        delete global.ANTIBAD_ACTION[from];
        
        await reply(`❌ *Anti-Bad Words Deactivated!*

📌 Bad words will no longer be filtered.

💖 Powered by ARSLAN-MD`);
    }
});

// ============================================
// 📌 ANTI-BAD WORDS HANDLER (Auto)
// ============================================

// ─── LISTEN FOR MESSAGES ───
arslan({
    pattern: "antibad_handler",
    on: "body",
    filename: __filename
}, async (arslan, mek, m, { from, isGroup, isBotAdmins, isAdmins, isOwner, sender, senderNumber, reply }) => {

    // ─── SKIP IF NOT GROUP ───
    if (!isGroup) return;

    // ─── SKIP IF ANTI-BAD OFF ───
    if (!global.ANTIBAD_STATUS?.[from]) return;

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

    // ─── CHECK FOR BAD WORDS ───
    let foundBadWord = false;
    let badWord = '';

    // Check word list
    for (const word of BAD_WORDS) {
        if (body.toLowerCase().includes(word.toLowerCase())) {
            foundBadWord = true;
            badWord = word;
            break;
        }
    }

    // Check patterns
    if (!foundBadWord) {
        for (const pattern of BAD_PATTERNS) {
            if (pattern.test(body)) {
                foundBadWord = true;
                badWord = body.match(pattern)?.[0] || 'bad word';
                break;
            }
        }
    }

    if (!foundBadWord) return;

    // ─── GET ACTION ───
    const action = global.ANTIBAD_ACTION[from] || 'warn';

    // ─── INIT WARN COUNT ───
    if (!global.ANTIBAD_WARN[from]) global.ANTIBAD_WARN[from] = {};
    if (!global.ANTIBAD_WARN[from][senderNumber]) global.ANTIBAD_WARN[from][senderNumber] = 0;

    // ─── INCREMENT WARN ───
    global.ANTIBAD_WARN[from][senderNumber]++;

    // ─── DELETE BAD MESSAGE ───
    try {
        await arslan.sendMessage(from, {
            delete: mek.key
        });
        console.log(`[AntiBad] 🗑️ Deleted bad message from ${senderNumber}`);
    } catch (e) {
        console.log('[AntiBad] Delete error:', e.message);
    }

    // ─── WARN USER ───
    const warnCount = global.ANTIBAD_WARN[from][senderNumber];
    const maxWarns = 3;
    const warnMsg = `⚠️ *Bad word detected!*

📌 Word: \`${badWord}\`
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

📌 Reason: Repeated bad words (${warnCount} warns)
👤 User: @${senderNumber}

💖 Powered by ARSLAN-MD`,
                mentions: [sender]
            });
            
            delete global.ANTIBAD_WARN[from][senderNumber];
            console.log(`[AntiBad] 👢 Kicked ${senderNumber} for bad words`);
        } catch (e) {
            console.log('[AntiBad] Kick error:', e.message);
        }
    }
});

console.log('🚫 ARSLAN-MD - Anti-Bad Words Plugin Loaded! 💖');
