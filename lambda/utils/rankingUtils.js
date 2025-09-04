const voiceRoles = require('./voiceRoles');

const generateSpeech = (text, voiceConfig) => {
    return `<voice name="${voiceConfig.voice}"><prosody rate="slow">${text}</prosody></voice>`;
};

const getRankingMessage = (players) => {
    const voiceConfig = voiceRoles.getVoiceConfig(voiceRoles.getRoleByTime());
    const sortedPlayers = [...players].sort((a, b) => b.score - a.score);
    let rankingMessage = "";

    if (sortedPlayers.length === 1) {
        rankingMessage += generateSpeech(`¡${sortedPlayers[0].name}, has conseguido ${sortedPlayers[0].score} recuerdos! `, voiceConfig);
    } else {
        const topScore = sortedPlayers[0].score;
        const topPlayers = sortedPlayers.filter(p => p.score === topScore);

        if (topPlayers.length > 1) {
            const names = topPlayers.map(p => p.name).join(' y ');
            rankingMessage += generateSpeech(`¡${names} habéis empatado en primer lugar con ${topScore} recuerdos! `, voiceConfig);
        } else {
            rankingMessage += generateSpeech(`¡${topPlayers[0].name} lidera con ${topScore} recuerdos! `, voiceConfig);
        }

        const otherPlayers = sortedPlayers.filter(p => p.score < topScore);
        if (otherPlayers.length > 0) {
            rankingMessage += generateSpeech("Aquí están los demás resultados: ", voiceConfig);
            rankingMessage += otherPlayers.map(p => generateSpeech(`${p.name} con ${p.score} recuerdos`, voiceConfig)).join(', ') + '. ';
        }
    }

    return rankingMessage;
};

const getFullRankingAnnouncement = (players) => {
    const voiceConfig = voiceRoles.getVoiceConfig(voiceRoles.getRoleByTime());
    return generateSpeech("Vamos a ver los recuerdos que habéis evocado hoy. ", voiceConfig) + 
           getRankingMessage(players) + 
           generateSpeech("¿Queréis jugar otra partida?", voiceConfig);
};

module.exports = {
    getRankingMessage,
    getFullRankingAnnouncement
};