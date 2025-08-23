module.exports = {
    calculateAccuracyBonus(player) {
        if (player.questionsAnswered > 2) {
            const accuracy = player.correctAnswers / player.questionsAnswered;
            return accuracy > 0.7 ? 3 : 0;
        }
        return 0;
    },
    
    calculateParticipationBonus(players) {
        const avgQuestions = players.reduce((sum, p) => sum + p.questionsAnswered, 0) / players.length;
        return players.map(player => ({
            ...player,
            participationBonus: player.questionsAnswered >= avgQuestions ? 2 : 0
        }));
    }
};