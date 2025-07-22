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
                playerCount: gameData.playerCount || 0,
                currentPlayer: gameData.currentPlayer || 0,
                gameState: gameData.gameState || 'START',
                players: gameData.players.map(player => ({
                    name: player.name,
                    score: player.score || 0,
                    favoriteSong: player.favoriteSong || null
                })),
                createdAt: gameData.createdAt || new Date().toISOString(),
                updatedAt: new Date().toISOString()
            }
        };

        try {
            console.log('Guardando sesión en DynamoDB:', params.Item);
            await dynamodb.put(params).promise();
            return true;
        } catch (error) {
            console.error('Error al guardar la sesión:', error);
            return false;
        }
    },

    async updatePlayerData(sessionId, updates) {
        const updateExpression = [];
        const expressionValues = {};
        
        Object.keys(updates).forEach(key => {
            updateExpression.push(`${key} = :${key}`);
            expressionValues[`:${key}`] = updates[key];
        });
        
        const params = {
            TableName: PLAYERS_TABLE,
            Key: { sessionId },
            UpdateExpression: 'SET ' + updateExpression.join(', '),
            ExpressionAttributeValues: expressionValues,
            ReturnValues: 'UPDATED_NEW'
        };
        
        try {
            console.log('Actualizando jugador en DynamoDB:', params);
            await dynamodb.update(params).promise();
            return true;
        } catch (error) {
            console.error('Error al actualizar el jugador:', error);
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