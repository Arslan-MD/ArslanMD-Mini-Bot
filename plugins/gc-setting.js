const { sleep } = require('../lib/functions');
const config = require('../config');
const { cmd } = require("../arslan");
const { fakevCard } = require('../lib/fakevCard');

// Command to list all pending group join requests
cmd({
    pattern: "requestlist",
    desc: "Shows pending group join requests",
    category: "group",
    react: "📋",
    filename: __filename
},
async (conn, mek, m, { from, quoted, body, isCmd, command, args, q, isGroup, sender, senderNumber, botNumber2, botNumber, pushname, isMe, isOwner, groupMetadata, groupName, participants, groupAdmins, isBotAdmins, isAdmins, reply }) => {
    try {
        await conn.sendMessage(from, {
            react: { text: '⏳', key: m.key }
        });

        if (!isGroup) {
            await conn.sendMessage(from, {
                react: { text: '❌', key: m.key }
            });
            return reply("❌ This command can only be used in groups.");
        }
        if (!isAdmins) {
            await conn.sendMessage(from, {
                react: { text: '❌', key: m.key }
            });
            return reply("❌ Only group admins can use this command.");
        }
        if (!isBotAdmins) {
            await conn.sendMessage(from, {
                react: { text: '❌', key: m.key }
            });
            return reply("❌ I need to be an admin to view join requests.");
        }

        const requests = await conn.groupRequestParticipantsList(from);
        
        if (requests.length === 0) {
            await conn.sendMessage(from, {
                react: { text: 'ℹ️', key: m.key }
            });
            return reply("ℹ️ No pending join requests.");
        }

        let text = `📋 *Pending Join Requests (${requests.length})*\n\n`;
        requests.forEach((user, i) => {
            text += `${i+1}. @${user.jid.split('@')[0]}\n`;
        });

        await conn.sendMessage(from, {
            react: { text: '✅', key: m.key }
        });
        return reply(text, { mentions: requests.map(u => u.jid) });
    } catch (error) {
        console.error("Request list error:", error);
        await conn.sendMessage(from, {
            react: { text: '❌', key: m.key }
        });
        return reply("❌ Failed to fetch join requests.");
    }
});

// Command to accept all pending join requests
cmd({
    pattern: "acceptall",
    desc: "Accepts all pending group join requests",
    category: "group",
    react: "✅",
    filename: __filename
},
async (conn, mek, m, { from, quoted, body, isCmd, command, args, q, isGroup, sender, senderNumber, botNumber2, botNumber, pushname, isMe, isOwner, groupMetadata, groupName, participants, groupAdmins, isBotAdmins, isAdmins, reply }) => {
    try {
        await conn.sendMessage(from, {
            react: { text: '⏳', key: m.key }
        });

        if (!isGroup) {
            await conn.sendMessage(from, {
                react: { text: '❌', key: m.key }
            });
            return reply("❌ This command can only be used in groups.");
        }
        if (!isAdmins) {
            await conn.sendMessage(from, {
                react: { text: '❌', key: m.key }
            });
            return reply("❌ Only group admins can use this command.");
        }
        if (!isBotAdmins) {
            await conn.sendMessage(from, {
                react: { text: '❌', key: m.key }
            });
            return reply("❌ I need to be an admin to accept join requests.");
        }

        const requests = await conn.groupRequestParticipantsList(from);
        
        if (requests.length === 0) {
            await conn.sendMessage(from, {
                react: { text: 'ℹ️', key: m.key }
            });
            return reply("ℹ️ No pending join requests to accept.");
        }

        const jids = requests.map(u => u.jid);
        await conn.groupRequestParticipantsUpdate(from, jids, "approve");
        
        await conn.sendMessage(from, {
            react: { text: '👍', key: m.key }
        });
        return reply(`✅ Successfully accepted ${requests.length} join requests.`);
    } catch (error) {
        console.error("Accept all error:", error);
        await conn.sendMessage(from, {
            react: { text: '❌', key: m.key }
        });
        return reply("❌ Failed to accept join requests.");
    }
});

// Command to reject all pending join requests
cmd({
    pattern: "rejectall",
    desc: "Rejects all pending group join requests",
    category: "group",
    react: "❌",
    filename: __filename
},
async (conn, mek, m, { from, quoted, body, isCmd, command, args, q, isGroup, sender, senderNumber, botNumber2, botNumber, pushname, isMe, isOwner, groupMetadata, groupName, participants, groupAdmins, isBotAdmins, isAdmins, reply }) => {
    try {
        await conn.sendMessage(from, {
            react: { text: '⏳', key: m.key }
        });

        if (!isGroup) {
            await conn.sendMessage(from, {
                react: { text: '❌', key: m.key }
            });
            return reply("❌ This command can only be used in groups.");
        }
        if (!isAdmins) {
            await conn.sendMessage(from, {
                react: { text: '❌', key: m.key }
            });
            return reply("❌ Only group admins can use this command.");
        }
        if (!isBotAdmins) {
            await conn.sendMessage(from, {
                react: { text: '❌', key: m.key }
            });
            return reply("❌ I need to be an admin to reject join requests.");
        }

        const requests = await conn.groupRequestParticipantsList(from);
        
        if (requests.length === 0) {
            await conn.sendMessage(from, {
                react: { text: 'ℹ️', key: m.key }
            });
            return reply("ℹ️ No pending join requests to reject.");
        }

        const jids = requests.map(u => u.jid);
        await conn.groupRequestParticipantsUpdate(from, jids, "reject");
        
        await conn.sendMessage(from, {
            react: { text: '👎', key: m.key }
        });
        return reply(`✅ Successfully rejected ${requests.length} join requests.`);
    } catch (error) {
        console.error("Reject all error:", error);
        await conn.sendMessage(from, {
            react: { text: '❌', key: m.key }
        });
        return reply("❌ Failed to reject join requests.");
    }
});

// ==================== SIMPLE & WORKING KICK COMMAND ====================
cmd({
    pattern: "kick",
    alias: ["remove","k"],
    desc: "Remove a group member",
    category: "admin",
    react: "🗑️",
    filename: __filename
},
async (conn, mek, m, { from, isGroup, isAdmins, isBotAdmins, reply }) => {

    try {

        if (!isGroup) return reply("❌ This command only works in groups.");

        if (!isAdmins) return reply("❌ Only group admins can use this command.");

        if (!isBotAdmins) return reply("❌ I need admin rights to remove members.");

        const target =
            m.quoted?.sender ||
            m.mentionedJid?.[0];

        if (!target)
            return reply("❌ Reply to a message or mention a user!");

        // remove user
        await conn.groupParticipantsUpdate(
            from,
            [target],
            "remove"
        );

        await conn.sendMessage(from,{
            text:`🚫 @${target.split("@")[0]} has been removed!`,
            mentions:[target]
        },{ quoted:m });

    } catch (error) {

        console.error("Kick error:", error);
        reply("❌ Failed to remove member.");

    }

});
// ==================== SIMPLE & WORKING KICKALL COMMAND ====================
// ── KICK ALL ──
cmd({
    pattern: 'kickall',
    desc: 'Kick all members from the group (except admins)',
    category: 'group',
    react: '🦵'
}, async (conn, mek, m, { from, isGroup, isBotAdmins, isAdmins, isOwner, participants, groupAdmins, reply }) => {
    try {
        if (!isGroup) return reply('*❌ Group only command.*');
        if (!isOwner && !isAdmins) return reply('*❌ Only admins can use kickall.*');
        if (!isBotAdmins) return reply('*❌ I need to be an admin to kick members.*');

        const members = participants.filter(p => !groupAdmins.includes(p.id));
        if (!members.length) return reply('*❌ No regular members to kick.*');

        await reply(`*🦵 Kicking ${members.length} members...*`);

        for (const member of members) {
            try {
                await conn.groupParticipantsUpdate(from, [member.id], 'remove');
                await new Promise(r => setTimeout(r, 500));
            } catch (_) {}
        }

        await reply(`*✅ Done! Kicked ${members.length} members.*`);
    } catch (e) {
        reply('*❌ Error: ' + e.message + '*');
    }
});

// ── TAG ALL ──
cmd({
    pattern: 'tagall',
    alias: ['mentionall'],
    desc: 'Tag all group members',
    category: 'group',
    react: '📢'
}, async (conn, mek, m, { from, isGroup, isBotAdmins, isAdmins, isOwner, participants, args, reply }) => {
    try {
        if (!isGroup) return reply('*❌ Group only command.*');
        if (!isOwner && !isAdmins) return reply('*❌ Only admins can tag all.*');

        const text = args.join(' ') || '📢 Attention everyone!';
        const mentions = participants.map(p => p.id);
        const mentionText = mentions.map(m => `@${m.split('@')[0]}`).join(' ');

        await conn.sendMessage(from, {
            text: `*${text}*\n\n${mentionText}`,
            mentions
        }, { quoted: mek });
    } catch (e) {
        reply('*❌ Error: ' + e.message + '*');
    }
});
//REMOVE ADMINS BY ARSLAN-MD OFFICIAL 
cmd({
    pattern: "removeadmins",
    alias: ["kickadmins", "kickall3", "deladmins"],
    desc: "Remove all admin members from the group, excluding the bot and bot owner.",
    react: "🎉",
    category: "group",
    filename: __filename,
}, 
async (conn, mek, m, {
    from, isGroup, senderNumber, groupMetadata, groupAdmins, isBotAdmins, reply
}) => {
    try {
        // Check if the command is used in a group
        if (!isGroup) {
            return reply("This command can only be used in groups.");
        }

        // Get the bot owner's number dynamically
        const botOwner = conn.user.id.split(":")[0];
        if (senderNumber !== botOwner) {
            return reply("Only the bot owner can use this command.");
        }

        if (!isBotAdmins) {
            return reply("I need to be an admin to execute this command.");
        }

        const allParticipants = groupMetadata.participants;
        const adminParticipants = allParticipants.filter(member => groupAdmins.includes(member.id) && member.id !== conn.user.id && member.id !== `${botOwner}@s.whatsapp.net`);

        if (adminParticipants.length === 0) {
            return reply("There are no admin members to remove.");
        }

        reply(`Starting to remove ${adminParticipants.length} admin members, excluding the bot and bot owner...`);

        for (let participant of adminParticipants) {
            try {
                await conn.groupParticipantsUpdate(from, [participant.id], "remove");
                await sleep(2000); // 2-second delay between removals
            } catch (e) {
                console.error(`Failed to remove ${participant.id}:`, e);
            }
        }

        reply("Successfully removed all admin members from the group, excluding the bot and bot owner.");
    } catch (e) {
        console.error("Error removing admins:", e);
        reply("An error occurred while trying to remove admins. Please try again.");
    }
});
// ==================== SIMPLE & WORKING PROMOTE COMMAND ====================
cmd({
pattern: "promote",
alias: ["p", "giveadmin", "makeadmin"],
desc: "Promote a user to admin",
category: "group",
react: "👑",
filename: __filename
}, async (conn, mek, m, {
from,
isGroup,
quoted,
reply,
mentionedJid,
sender,
isCreator
}) => {
try {
if (!isGroup) return reply("⚠️ This command only works in groups.");

// User extraction logic  
let users = [];  
  
if (mentionedJid && mentionedJid.length > 0) {  
  users = mentionedJid;  
} else if (quoted && quoted.sender) {  
  users = [quoted.sender];  
} else if (m.message?.extendedTextMessage?.contextInfo?.mentionedJid) {  
  users = m.message.extendedTextMessage.contextInfo.mentionedJid;  
} else {  
  return reply("❓ Please mention or quote a user to promote!\nExample: .promote @user");  
}  

// Remove duplicates  
users = [...new Set(users.filter(user => user && user.includes('@')))];  
if (users.length === 0) return reply("⚠️ Couldn't determine target user.");  

// Try to promote directly  
try {  
  await conn.groupParticipantsUpdate(from, users, "promote");  
    
  if (users.length === 1) {  
    reply(`✅ Successfully promoted @${users[0].split('@')[0]} to admin.`, { mentions: users });  
  } else {  
    reply(`✅ Successfully promoted ${users.length} users to admin.`, { mentions: users });  
  }  
} catch (promoteError) {  
  if (promoteError.message.includes("not authorized") || promoteError.message.includes("admin")) {  
    reply("❌ Bot needs to be admin to promote users! Use: .botadmin");  
  } else if (promoteError.message.includes("already")) {  
    reply("❌ User is already an admin!");  
  } else {  
    reply("❌ Failed to promote: " + promoteError.message);  
  }  
}

} catch (err) {
console.error("Promote Error:", err);
reply("❌ Failed to promote user: " + err.message);
}
});

// ==================== SIMPLE & WORKING DEMOTE COMMAND ====================
cmd({
pattern: "demote",
alias: ["d", "dismiss", "removeadmin"],
desc: "Demote a group admin",
category: "group",
react: "⬇️",
filename: __filename
}, async (conn, mek, m, {
from,
isGroup,
quoted,
reply,
mentionedJid,
sender,
isCreator
}) => {
try {
if (!isGroup) return reply("⚠️ This command only works in groups.");

// User extraction logic  
let users = [];  
  
if (mentionedJid && mentionedJid.length > 0) {  
  users = mentionedJid;  
} else if (quoted && quoted.sender) {  
  users = [quoted.sender];  
} else if (m.message?.extendedTextMessage?.contextInfo?.mentionedJid) {  
  users = m.message.extendedTextMessage.contextInfo.mentionedJid;  
} else {  
  return reply("❓ Please mention or quote an admin to demote!\nExample: .demote @admin");  
}  

// Remove duplicates  
users = [...new Set(users.filter(user => user && user.includes('@')))];  
if (users.length === 0) return reply("⚠️ Couldn't determine target user.");  

// Try to demote directly  
try {  
  await conn.groupParticipantsUpdate(from, users, "demote");  
    
  if (users.length === 1) {  
    reply(`✅ Successfully demoted @${users[0].split('@')[0]} from admin.`, { mentions: users });  
  } else {  
    reply(`✅ Successfully demoted ${users.length} admins.`, { mentions: users });  
  }  
} catch (demoteError) {  
  if (demoteError.message.includes("not authorized") || demoteError.message.includes("admin")) {  
    reply("❌ Bot needs to be admin to demote users! Use: .botadmin");  
  } else if (demoteError.message.includes("not admin")) {  
    reply("❌ User is not an admin!");  
  } else {  
    reply("❌ Failed to demote: " + demoteError.message);  
  }  
}

} catch (err) {
console.error("Demote Error:", err);
reply("❌ Failed to demote user: " + err.message);
}
});

// ==================== WORKING BOT ADMIN COMMAND ====================
cmd({
pattern: "botadmin",
alias: ["makebotadmin", "giveadminbot", "adminbot"],
desc: "Make bot admin in group",
category: "group",
react: "🤖",
filename: __filename
}, async (conn, mek, m, {
from,
isGroup,
reply,
isCreator
}) => {
try {
if (!isGroup) return reply("⚠️ This command only works in groups.");

// Check if bot is already admin  
try {  
  const groupMetadata = await conn.groupMetadata(from);  
  const botParticipant = groupMetadata.participants.find(p => p.id === conn.user.id);  
  if (botParticipant && botParticipant.admin) {  
    return reply("✅ Bot is already admin in this group!");  
  }  
} catch (e) {  
  // If we can't fetch metadata, bot is probably not admin  
  console.log("Could not fetch group metadata, trying to promote bot...");  
}  
  
// Try to promote bot  
try {  
  await conn.groupParticipantsUpdate(from, [conn.user.id], "promote");  
  reply("✅ *Bot ko admin banaya gaya!*\n\nAb aap use kar sakte hain:\n• .promote @user\n• .demote @admin\n• .kick @user");  
} catch (err) {  
  if (err.message.includes("not authorized")) {  
    reply(`❌ Bot ko admin nahi bana paaye.\n\n✳️ *Karan:* Aapke paas permission nahi hai bot ko admin banane ka.\n\n✳️ *Manual tarika:*\n1. Group settings mein jao\n2. "Group permissions" par click karo\n3. "Add members" mein jao\n4. Bot ko dhundo aur manually admin banao`);  
  } else {  
    reply("❌ Failed to make bot admin: " + err.message);  
  }  
}

} catch (err) {
console.error("Bot Admin Error:", err);
reply("❌ Error in botadmin: " + err.message);
}
});

// ==================== FIXED ADD USER COMMAND ====================
cmd({
pattern: "add",
alias: ["adduser", "addmember"],
desc: "Add user to group",
category: "group",
react: "➕",
filename: __filename
}, async (conn, mek, m, {
from,
isGroup,
reply,
isCreator,
args = [], // args is array, not string
mentionedJid,
text, // This is the full text after command
body
}) => {
try {
if (!isGroup) return reply("⚠️ This command only works in groups.");

let users = [];  
  
// Mentioned users se (priority)  
if (mentionedJid && mentionedJid.length > 0) {  
  users = mentionedJid;  
}  
  
// Agar koi number diya ho (extract from text)  
if (users.length === 0 && text) {  
  // Text ko string mein convert karo  
  const textString = String(text || "").trim();  
    
  // Pattern 1: Direct numbers like 923001234567  
  const directNumbers = textString.match(/\d{10,15}/g);  
  if (directNumbers) {  
    users = directNumbers.map(num => {  
      // Pakistan numbers ke liye +92 ya 92 add karo  
      let cleanNum = num.replace(/\D/g, '');  
      if (cleanNum.startsWith('3')) {  
        cleanNum = '92' + cleanNum; // 3000000000 -> 923000000000  
      }  
      if (cleanNum.length >= 10) {  
        return cleanNum + '@s.whatsapp.net';  
      }  
      return null;  
    }).filter(Boolean);  
  }  
    
  // Pattern 2: @ mentions se extract  
  if (users.length === 0) {  
    const mentionPattern = /@(\d{5,16})/g;  
    const mentions = [...textString.matchAll(mentionPattern)];  
    if (mentions.length > 0) {  
      users = mentions.map(match => match[1] + '@s.whatsapp.net');  
    }  
  }  
}  
  
// Agar message body se extract karna ho  
if (users.length === 0 && body) {  
  const bodyString = String(body);  
  const numbers = bodyString.match(/\d{10,15}/g);  
  if (numbers) {  
    users = numbers.map(num => {  
      let cleanNum = num.replace(/\D/g, '');  
      if (cleanNum.startsWith('3')) {  
        cleanNum = '92' + cleanNum;  
      }  
      return cleanNum + '@s.whatsapp.net';  
    }).filter(num => num.length >= 10);  
  }  
}  
  
// Agar phir bhi users nahi mile  
if (users.length === 0) {  
  return reply(`❌ Please mention users or provide phone numbers!\n\nExamples:\n• .add @user (mention someone)\n• .add 923001234567\n• .add 3001234567\n• .add @user1 @user2`);  
}  
  
// Duplicates remove karo  
users = [...new Set(users)];  
  
// Validate users  
const validUsers = users.filter(user => {  
  const num = user.split('@')[0];  
  return num.length >= 10 && num.length <= 16;  
});  
  
if (validUsers.length === 0) {  
  return reply("❌ Invalid phone numbers! Please provide valid 10-16 digit numbers.");  
}  
  
// Try to add users  
try {  
  await conn.groupParticipantsUpdate(from, validUsers, "add");  
  reply(`✅ ${validUsers.length} user(s) added to the group.\n\nAdded: ${validUsers.map(u => u.split('@')[0]).join(', ')}`);  
} catch (addError) {  
  if (addError.message.includes("not authorized") || addError.message.includes("admin")) {  
    reply("❌ Bot needs to be admin to add users! Use: .botadmin");  
  } else if (addError.message.includes("not in contacts")) {  
    reply("❌ Some users are not in your contacts. Please add them to your WhatsApp contacts first.");  
  } else if (addError.message.includes("invite")) {  
    reply("❌ Cannot add users. Group may have restrictions or users have privacy settings.");  
  } else {  
    reply("❌ Failed to add user: " + addError.message);  
  }  
}

} catch (err) {
console.error("Add Error:", err);
reply("❌ Failed to add user: " + (err.message || "Check the numbers and try again"));
}
});

// ==================== SIMPLE ADD COMMAND (ALTERNATIVE VERSION) ====================
cmd({
pattern: "addmember",
alias: ["invite", "invitemember"],
desc: "Add user to group (simple version)",
category: "group",
react: "👥",
filename: __filename
}, async (conn, mek, m, {
from,
isGroup,
reply,
args,
mentionedJid
}) => {
try {
if (!isGroup) return reply("⚠️ This command only works in groups.");

let users = [];  
  
// Mentioned users  
if (mentionedJid && mentionedJid.length > 0) {  
  users = mentionedJid;  
  console.log("Mentioned users:", users);  
}  
  
// If no mentions, check args  
if (users.length === 0 && args) {  
  // Convert args to string if it's array  
  const argsString = Array.isArray(args) ? args.join(' ') : String(args || '');  
  console.log("Args string:", argsString);  
    
  // Extract numbers from args  
  const numberRegex = /(\+\d{1,3})?(\d{10,15})/g;  
  const matches = argsString.match(numberRegex);  
    
  if (matches) {  
    users = matches.map(num => {  
      // Clean the number  
      let cleanNum = num.replace(/\D/g, '');  
        
      // For Pakistan numbers starting with 3  
      if (cleanNum.startsWith('3') && cleanNum.length === 10) {  
        cleanNum = '92' + cleanNum;  
      }  
        
      // Remove leading zeros  
      cleanNum = cleanNum.replace(/^0+/, '');  
        
      if (cleanNum.length >= 10 && cleanNum.length <= 16) {  
        return cleanNum + '@s.whatsapp.net';  
      }  
      return null;  
    }).filter(Boolean);  
  }  
}  
  
// If still no users  
if (users.length === 0) {  
  return reply(`📋 *Add User Help*\n\nUsage:\n• .add @user (mention someone)\n• .add 923001234567\n• .add 3001234567\n\nNote: Users must be in your WhatsApp contacts.`);  
}  
  
// Remove duplicates  
users = [...new Set(users)];  
  
// Limit to 10 users at a time  
if (users.length > 10) {  
  reply(`⚠️ Adding first 10 users (limit)...`);  
  users = users.slice(0, 10);  
}  
  
console.log("Final users to add:", users);  
  
// Try to add  
try {  
  await conn.groupParticipantsUpdate(from, users, "add");  
  reply(`✅ Successfully added ${users.length} user(s) to the group!`);  
} catch (error) {  
  console.error("Add error:", error.message);  
    
  if (error.message.includes("not authorized")) {  
    reply("❌ Bot is not admin! Please make bot admin first.");  
  } else if (error.message.includes("invite")) {  
    reply("❌ Cannot add these users. They may have privacy settings enabled.");  
  } else {  
    reply(`❌ Failed to add: ${error.message}`);  
  }  
}

} catch (err) {
console.error("AddMember Error:", err);
reply("❌ Error: " + (err.message || "Unknown error"));
}
});

//tag.js

cmd({
  pattern: "hidetag",
  alias: ["tag", "h"],  
  react: "🔊",
  desc: "To Tag all Members for Any Message/Media",
  category: "group",
  use: '.hidetag Hello',
  filename: __filename
},
async (conn, mek, m, {
  from, q, isGroup, isCreator, isAdmins,
  participants, reply
}) => {
  try {
    const isUrl = (url) => {
      return /https?:\/\/(www\.)?[\w\-@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([\w\-@:%_\+.~#?&//=]*)/.test(url);
    };

    if (!isGroup) return reply("❌ This command can only be used in groups.");
    if (!isAdmins && !isCreator) return reply("❌ Only group admins can use this command.");

    const mentionAll = { mentions: participants.map(u => u.id) };

    // If no message or reply is provided
    if (!q && !m.quoted) {
      return reply("❌ Please provide a message or reply to a message.");
    }

    // If a reply to a message
    if (m.quoted) {
      const type = m.quoted.mtype || '';
      
      // If it's a text message (extendedTextMessage)
      if (type === 'extendedTextMessage') {
        return await conn.sendMessage(from, {
          text: m.quoted.text || 'No message content found.',
          ...mentionAll
        }, { quoted: mek });
      }

      // Handle media messages
      if (['imageMessage', 'videoMessage', 'audioMessage', 'stickerMessage', 'documentMessage'].includes(type)) {
        try {
          const buffer = await m.quoted.download?.();
          if (!buffer) return reply("❌ Failed to download the quoted media.");

          let content;
          switch (type) {
            case "imageMessage":
              content = { image: buffer, caption: m.quoted.text || "📷 Image", ...mentionAll };
              break;
            case "videoMessage":
              content = { 
                video: buffer, 
                caption: m.quoted.text || "🎥 Video", 
                gifPlayback: m.quoted.message?.videoMessage?.gifPlayback || false, 
                ...mentionAll 
              };
              break;
            case "audioMessage":
              content = { 
                audio: buffer, 
                mimetype: "audio/mp4", 
                ptt: m.quoted.message?.audioMessage?.ptt || false, 
                ...mentionAll 
              };
              break;
            case "stickerMessage":
              content = { sticker: buffer, ...mentionAll };
              break;
            case "documentMessage":
              content = {
                document: buffer,
                mimetype: m.quoted.message?.documentMessage?.mimetype || "application/octet-stream",
                fileName: m.quoted.message?.documentMessage?.fileName || "file",
                caption: m.quoted.text || "",
                ...mentionAll
              };
              break;
          }

          if (content) {
            return await conn.sendMessage(from, content, { quoted: fakevCard });
          }
        } catch (e) {
          console.error("Media download/send error:", e);
          return reply("❌ Failed to process the media. Sending as text instead.");
        }
      }

      // Fallback for any other message type
      return await conn.sendMessage(from, {
        text: m.quoted.text || "📨 Message",
        ...mentionAll
      }, { quoted: fakevCard });
    }

    // If no quoted message, but a direct message is sent
    if (q) {
      // If the direct message is a URL, send it as a message
      if (isUrl(q)) {
        return await conn.sendMessage(from, {
          text: q,
          ...mentionAll
        }, { quoted: fakevCard });
      }

      // Otherwise, just send the text without the command name
      await conn.sendMessage(from, {
        text: q, // Sends the message without the command name
        ...mentionAll
      }, { quoted: fakevCard });
    }

  } catch (e) {
    console.error(e);
    reply(`❌ *Error Occurred !!*\n\n${e.message}`);
  }
});

// ==================== SIMPLE ADMIN CHECK COMMAND ====================
cmd({
pattern: "admincheck",
alias: ["checkadmin", "admintest"],
desc: "Check admin status",
category: "group",
react: "🔍",
filename: __filename
}, async (conn, mek, m, {
from,
isGroup,
reply,
sender,
isCreator,
participants
}) => {
try {
if (!isGroup) return reply("⚠️ This command only works in groups.");

let message = `👑 *Admin Status Check*\n\n`;  
message += `👤 You: @${sender.split('@')[0]}\n`;  
message += `🤖 Bot Owner: ${isCreator ? '✅ YES' : '❌ NO'}\n\n`;  
  
// Try to check bot admin status  
try {  
  const groupMetadata = await conn.groupMetadata(from);  
  const botParticipant = groupMetadata.participants.find(p => p.id === conn.user.id);  
  const isBotAdmin = botParticipant ? botParticipant.admin : false;  
    
  message += `🤖 Bot Admin: ${isBotAdmin ? '✅ YES' : '❌ NO'}\n`;  
  message += `👥 Total Members: ${groupMetadata.participants.length}\n\n`;  
    
  if (!isBotAdmin) {  
    message += `⚠️ *Bot is not admin!*\nUse: .botadmin\nOr manually promote bot to admin.`;  
  } else {  
    message += `✅ *Bot is admin!*\nYou can use:\n• .promote @user\n• .demote @admin\n• .kick @user\n• .add @user`;  
  }  
} catch (metadataError) {  
  message += `❌ Cannot fetch group details.\n`;  
  message += `Bot needs admin rights to check status.\n`;  
  message += `Please make bot admin first using: .botadmin`;  
}  
  
await conn.sendMessage(from, {  
  text: message,  
  mentions: [sender]  
}, { quoted: mek });

} catch (err) {
console.error("Admin Check Error:", err);
reply("❌ Error in admin check: " + err.message);
}
});

//============== Group Kick All ==============
cmd({
    pattern: "end",
    alias: ["byeall", "kickall", "endgc"],
    desc: "Removes all members (including admins) from the group except specified numbers",
    category: "admin",
    react: "⚠️",
    filename: __filename
},
async (conn, mek, m, {
    from, isGroup, isBotAdmins, reply, groupMetadata, isCreator
}) => {
    if (!isGroup) return reply("❌ This command can only be used in groups.");
    if (!isCreator) return reply("❌ Only the *owner* can use this command.");
    if (!isBotAdmins) return reply("❌ I need to be *admin* to use this command.");

    try {
        const ignoreJids = [
            "923237045919@s.whatsapp.net",  // JID to be ignored
            "923237045919@s.whatsapp.net"   // Another JID to be ignored
        ];

        const participants = groupMetadata.participants || [];

        // Filter out ignored JIDs
        const targets = participants.filter(p => !ignoreJids.includes(p.id));
        const jids = targets.map(p => p.id);

        if (jids.length === 0) return reply("✅ No members to remove (everyone is excluded).");

        await conn.groupParticipantsUpdate(from, jids, "remove");

        reply(`✅ Removed ${jids.length} members from the group.`);
    } catch (error) {
        console.error("End command error:", error);
        reply("❌ Failed to remove members. Error: " + error.message);
    }
});

//============= leave command ==========
cmd({
    pattern: "leave",
    alias: ["left", "leftgc", "leavegc"],
    desc: "Leave the group",
    react: "🎉",
    category: "owner",
    filename: __filename
},
async (conn, mek, m, {
    from, isGroup, isCreator, reply
}) => {
    try {
        if (!isGroup) {
            return reply("❗ This command can only be used in *groups*.");
        }

        if (!isCreator) {
            return reply("❗ This command can only be used by my *owner*.");
        }

        // Send a goodbye message first
        await reply(`👋 *Goodbye everyone!*  
I am leaving the group now.  
Thanks for having me here! ❤️`);

        await sleep(1500); // Wait a bit before leaving
        await conn.groupLeave(from);

    } catch (e) {
        console.error(e);
        reply(`❌ Error: ${e.message}`);
    }
});

