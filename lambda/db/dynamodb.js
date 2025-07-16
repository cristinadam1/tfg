const AWS = require('aws-sdk');
const dynamodb = new AWS.DynamoDB.DocumentClient({ region: 'eu-west-1' });

const PLAYERS_TABLE = 'JuegoRegresoPasado'; 
const SONGS_TABLE = process.env.SONGS_TABLE || 'CancionesRegresoPasado';

module.exports = {
    async saveGameSession(sessionId, gameData) {
        const params = {
            TableName: PLAYERS_TABLE,
            Item: {
                sessionId,
                currentPlayer: gameData.currentPlayer,
                gameState: gameData.gameState,
                players: gameData.players,
                createdAt: new Date().toISOString()
            }
        };

        try {
            await dynamodb.put(params).promise();
            return true;
        } catch (error) {
            console.error('Error al guardar sesión:', error);
            return false;
        }
    },

    async getSongUrl(nombre) {
        const params = {
            TableName: SONGS_TABLE,
            Key: { nombre }
        };

        try {
            const result = await dynamodb.get(params).promise();
            return result.Item ? result.Item.url : null;
        } catch (error) {
            console.error('Error al consultar la canción:', error);
            return null;
        }
    }
};