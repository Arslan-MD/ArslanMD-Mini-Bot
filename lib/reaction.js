// ./lib/reaction.js

// Consolidated reaction list (merged public and owner reactions, deduplicated)
const reactions = [
    '🌼', '❤️', '💐', '🔥', '🏵️', '❄️', '🧊', '🐳', '💥', '🥀', '❤‍🔥', '🥹', '😩', '🫣',
    '🤭', '👻', '👾', '🫶', '😻', '🙌', '🫂', '🫀', '👩‍🦰', '🧑‍🦰', '👩‍⚕️', '🧑‍⚕️', '🧕',
    '👩‍🏫', '👨‍💻', '👰‍♀', '🦹🏻‍♀️', '🧟‍♀️', '🧟', '🧞‍♀️', '🧞', '🙅‍♀️', '💁‍♂️', '💁‍♀️', '🙆‍♀️',
    '🙋‍♀️', '🤷', '🤷‍♀️', '🤦', '🤦‍♀️', '💇‍♀️', '💇', '💃', '🚶‍♀️', '🚶', '🧶', '🧤', '👑',
    '💍', '👝', '💼', '🎒', '🥽', '🐻', '🐼', '🐭', '🐣', '🪿', '🦆', '🦊', '🦋', '🦄',
    '🪼', '🐋', '🦈', '🐍', '🕊️', '🦦', '🦚', '🌱', '🍃', '🎍', '🌿', '☘️', '🍀',
    '🍁', '🪺', '🍄', '🍄‍🟫', '🪸', '🪨', '🌺', '🪷', '🪻', '🌹', '🌷', '🌾',
    '🌸', '🌻', '🌝', '🌚', '🌕', '🌎', '💫', '☃️', '🌨️', '🫧', '🍟', '🍫', '🧃',
    '🪀', '🤿', '🏆', '🥇', '🥈', '🥉', '🎗️', '🤹', '🤹‍♀️', '🎧', '🎤', '🥁', '🧩',
    '🎯', '🚀', '🚁', '🗿', '🎙️', '⌛', '⏳', '💸', '💎', '⚙️', '⛓️', '🔪', '🧸',
    '🎀', '🪄', '🎈', '🎁', '🎉', '🏮', '🪩', '📩', '💌', '📤', '📦', '📊', '📈',
    '📑', '📉', '📂', '🔖', '🧷', '📌', '📝', '🔏', '🔐', '🩷', '🧡', '💛', '💚',
    '🩵', '💙', '💜', '🖤', '🩶', '🤍', '🤎', '❤‍🩹', '💗', '💖', '💘', '💝', '❌',
    '✅', '🔰', '〽️', '🌐', '🌀', '⤴️', '⤵️', '🔴', '🟢', '🟡', '🟠', '🔵', '🟣',
    '⚫', '⚪', '🟤', '🔇', '🔊', '📢', '🔕', '♥️', '🕐', '🚩', '🇵🇰', '😇', '💯',
    '👀', '🥰', '😎', '🎎', '🎏', '🎐', '⚽', '🧣', '⛈️', '🌦️', '🙈', '🙉', '🦖',
    '🐤', '🔫', '🐝', '🍓', '🍭', '🧁', '🍿', '🍻', '🛬', '🫠', '💒', '🏩', '🏗️',
    '🏰', '🏪', '🏟️', '⛳', '📟', '📍', '🔮', '🧿', '♻️', '⛵', '🚍', '🚔', '🛳️',
    '🚆', '🚤', '🚕', '🛺', '🚝', '🚈', '🏎️', '🏍️', '🛵', '🥂', '🍾', '🍮', '🍰',
    '🍦', '🍨', '🥠', '🍡', '🧂', '🍯', '🍪', '🍩', '🥮', '🧳', '🌉', '🌁', '🛤️',
    '🛣️', '🏚️', '🏠', '🏡', '🧀'
];

// Remove duplicates and empty strings
const uniqueReactions = [...new Set(reactions.filter(emoji => emoji !== ''))];

// Function to handle public and owner reactions
function handleReaction(m, isReact, senderNumber, botNumber, config) {
    if (!isReact) {
        // Owner-specific reactions
        if (senderNumber === botNumber && config.OWNER_REACT === 'true') {
            const randomReaction = uniqueReactions[Math.floor(Math.random() * uniqueReactions.length)];
            m.react(randomReaction);
            return;
        }
        // Public reactions
        if (config.AUTO_REACT === 'true') {
            const randomReaction = uniqueReactions[Math.floor(Math.random() * uniqueReactions.length)];
            m.react(randomReaction);
        }
    }
}

// Export the function
module.exports = { handleReaction };
