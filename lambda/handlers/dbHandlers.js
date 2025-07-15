const AWS = require('aws-sdk');
const dynamodb = new AWS.DynamoDB.DocumentClient({ region: 'eu-west-1' });

const SONGS_TABLE = process.env.SONGS_TABLE || 'CancionesRegresoPasado';
const PLAYERS_TABLE = process.env.PLAYERS_TABLE || 'JugadoresRegresoPasado';

module.exports = {
    // Obtener URL de una canción
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
    },

    // Guardar datos del jugador
    async savePlayerData(sessionId, playerData) {
        const params = {
            TableName: PLAYERS_TABLE,
            Item: {
                sessionId,
                ...playerData,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            }
        };

        try {
            await dynamodb.put(params).promise();
            return true;
        } catch (error) {
            console.error('Error al guardar jugador:', error);
            return false;
        }
    },

    // Guardar toda la sesión de juego
    async saveGameSession(sessionId, gameData) {
        const params = {
            TableName: PLAYERS_TABLE,
            Item: {
                sessionId,
                ...gameData,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
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

    // Obtener sesión de juego
    async getGameSession(sessionId) {
        const params = {
            TableName: PLAYERS_TABLE,
            Key: { sessionId }
        };

        try {
            const result = await dynamodb.get(params).promise();
            return result.Item ? result.Item : null;
        } catch (error) {
            console.error('Error al obtener sesión:', error);
            return null;
        }
    }
};