const axios = require('axios')
const yts = require('yt-search')
const { cmd } = require('../arslan')
const { fakevCard } = require('../lib/fakevCard')

cmd({
pattern: "song",
alias: ["music", "mp3", "audio"],
desc: "Download YouTube Audio",
category: "download",
react: "🎵",
filename: __filename
},
async (conn, mek, m, { from, reply, text }) => {

try {

if (!text) {
return reply("❌ Example:\n.song pasoori")
}

const search = await yts(text)

if (!search.videos.length) {
return reply("❌ No song found")
}

const vid = search.videos[0]

const caption = `
╔ஜ۩▒█ ᴀʀꜱʟᴀɴ X ᴍᴅ █▒۩ஜ╗
┃🎵 SONG FOUND
┃📌 Title: ${vid.title}
┃⏱️ Duration: ${vid.timestamp}
┃👤 Channel: ${vid.author.name}
┃⚡ Downloading...
╰━━━━━━━━━━━━━━⊷
`

await conn.sendMessage(from,{
image: { url: vid.thumbnail },
caption: caption
},{ quoted: fakevCard })

const api = `https://arslan-apis-v2.vercel.app/download/ytmp3?url=${encodeURIComponent(vid.url)}`

const res = await axios.get(api, { timeout: 60000 })

// Debug log
console.log('API Status:', res.data?.status)
console.log('Has Result:', !!res.data?.result)
console.log('Has Download:', !!res.data?.result?.download)
console.log('Has URL:', !!res.data?.result?.download?.url)

// Try alternative way to get URL
let audioUrl = null
let title = vid.title

if (res.data?.result?.download?.url) {
audioUrl = res.data.result.download.url
title = res.data.result.metadata?.title || vid.title
} else if (res.data?.download?.url) {
audioUrl = res.data.download.url
} else if (res.data?.url) {
audioUrl = res.data.url
} else {
// If no URL found, show full response for debugging
return reply(`❌ API Error: ${JSON.stringify(res.data, null, 2).slice(0, 200)}...`)
}

// Send audio
await conn.sendMessage(from, {
audio: { url: audioUrl },
mimetype: "audio/mpeg",
caption: `🎵 *${title}*\n\n> © ᴀʀꜱʟᴀɴ-ᴍᴅ`,
ptt: false
}, { quoted: fakevCard })

} catch (err) {
console.log('Error:', err.message)
reply(`❌ Error: ${err.message}`)
}

})
