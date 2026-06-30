const { cmd } = require("../arslan");
const fetch = require("node-fetch");
const yts = require("yt-search");
const axios = require("axios");
const { fakevCard } = require('../lib/fakevCard');

cmd({
pattern: "song",
alias: ["ytmp3", "play", "mp3", "gana", "music", "audio"],
react: "🎵",
desc: "YouTube search & MP3 play",
category: "download",
use: ".play ",
filename: __filename
},
async (conn, mek, m, { from, args, reply }) => {

try {

const query = args.join(" ");
if (!query) return reply("❌ Please Provide Me A song Query or Link");

await conn.sendMessage(from, { react: { text: "⏳", key: m.key } });

/* 🔍 YouTube Search */
const search = await yts(query);

if (!search.videos || !search.videos.length) {
return reply("❌ No result Found");
}

const video = search.videos[0];

/* 🎧 MP3 API */
const apiUrl = `https://arslan-apis-v2.vercel.app/download/ytmp3?url=${video.url}`;

const res = await axios.get(apiUrl, { timeout: 60000 });

if (
 !res.data ||
 !res.data.status ||
 !res.data.result ||
 !res.data.result.download ||
 !res.data.result.download.url
) {
 return reply("❌ Audio Not Generated");
}

const dlUrl = res.data.result.download.url;
const meta = res.data.result.metadata;
const quality = res.data.result.download.quality || "128kbps";

/* 🎵 SEND AUDIO */
await conn.sendMessage(from, {
audio: { url: dlUrl },
mimetype: "audio/mpeg",
ptt: false,
fileName: `${meta.title || "song"}.mp3`,
caption:
`🎵 *${meta.title || "Unknown Title"}*\n` +
`🎚️ Quality: ${quality}\n\n` +
`> © Arslan-MD`,
contextInfo: {
externalAdReply: {
title: meta.title
? meta.title.substring(0, 40)
: "YouTube Song",
body: "▶︎ •၊၊||၊|။||||။‌‌‌‌‌၊|• ★彡ᴀʀꜱʟᴀɴ-ᴍᴅ-ʙᴇᴀᴛꜱ彡★",
thumbnailUrl: video.thumbnail,
sourceUrl: video.url,
mediaType: 1,
renderLargerThumbnail: true
}
}
}, { quoted: fakevCard });

await conn.sendMessage(from, { react: { text: "✅", key: m.key } });

} catch (err) {

console.error("PLAY ERROR:", err);

reply("❌ Error Found Please Try Later");

await conn.sendMessage(from, { react: { text: "❌", key: m.key } });

}

});


cmd({
  'pattern': 'video1',
  'alias': ["vid", "ytv"],
  'desc': "Download YouTube Video",
  'category': 'downloader',
  'react': '🪄',
  'filename': __filename
}, async (_0x291138, _0x40711d, _0x320efe, {
  from: _0x3764b7,
  q: _0x247990,
  reply: _0x5286ec
}) => {
  try {
    if (!_0x247990) {
      return _0x5286ec("Please provide a YouTube link or search query.\n\nExample: .video Pasoori");
    }
    let _0x3460a4;
    if (_0x247990.includes("youtube.com") || _0x247990.includes('youtu.be')) {
      _0x3460a4 = _0x247990;
    } else {
      let _0x145978 = await yts(_0x247990);
      if (!_0x145978 || !_0x145978.videos || _0x145978.videos.length === 0x0) {
        return _0x5286ec("No results found.");
      }
      _0x3460a4 = _0x145978.videos[0x0].url;
    }
    let _0x32732f = await fetch("https://gtech-api-xtp1.onrender.com/api/video/yt?apikey=APIKEY&url=" + encodeURIComponent(_0x3460a4));
    let _0x207ba6 = await _0x32732f.json();
    if (!_0x207ba6.status) {
      return _0x5286ec("Failed to fetch video.");
    }
    let {
      video_url_hd: _0x2500e4,
      video_url_sd: _0x1f2e71
    } = _0x207ba6.result.media;
    let _0x5f2691 = _0x2500e4 !== "No HD video URL available" ? _0x2500e4 : _0x1f2e71;
    if (!_0x5f2691 || _0x5f2691.includes('No')) {
      return _0x5286ec("No downloadable video found.");
    }
    await _0x291138.sendMessage(_0x3764b7, {
      'video': {
        'url': _0x5f2691
      },
      'caption': "*❀༒★[ᴀʀꜱʟᴀɴ-ᴍᴅ]★༒❀*"
    }, {
      'quoted': fakevCard
    });
  } catch (_0x4a5abf) {
    _0x5286ec("Error while fetching video.");
    console.log(_0x4a5abf);
  }
});
