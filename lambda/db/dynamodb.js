const AWS = require('aws-sdk');
const dynamodb = new AWS.DynamoDB.DocumentClient({ region: 'eu-west-1' });

const TABLE_NAME = process.env.TABLE_NAME || 'CancionesRegresoPasado';

module.exports = {
    // Obtener URL de una canción por su nombre
    async getSongUrl(nombre) {
        const params = {
            TableName: TABLE_NAME,
            Key: { nombre }  // Asume que "nombre" es la clave primaria
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
