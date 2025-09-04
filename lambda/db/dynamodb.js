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
            Key: { nombre },
            ProjectionExpression: 'nombre, #urlField',
            ExpressionAttributeNames: {
                '#urlField': 'url'
            }
        };
    
        try {
            const result = await dynamodb.get(params).promise();
            return result.Item ? result.Item.url : null;
        } catch (error) {
            console.error('Error al consultar la canción:', error);
            return null;
        }
    },
    async getRandomSong() {
        try {
            console.log('Buscando canción aleatoria...');
            const params = {
                TableName: SONGS_TABLE,
                ProjectionExpression: 'nombre, #urlField',
                ExpressionAttributeNames: {
                    '#urlField': 'url'  
                }
            };
            
            console.log('Params para scan:', params);
            const result = await dynamodb.scan(params).promise();
            console.log('Resultado del scan:', JSON.stringify(result, null, 2));
            
            if (result.Items && result.Items.length > 0) {
                console.log(`Se han encontrado ${result.Items.length} canciones`);
                const randomIndex = Math.floor(Math.random() * result.Items.length);
                const randomSong = result.Items[randomIndex];
                console.log(`Canción aleatoria seleccionada: ${JSON.stringify(randomSong)}`);
                
                return {
                    name: randomSong.nombre,
                    url: randomSong.url  
                };
            }
            
            console.log('No se han encontrado canciones en la tabla');
            return null;
            
        } catch (error) {
            console.error('Error al obtener canción aleatoria:', error);
            return null;
        }
    }

};