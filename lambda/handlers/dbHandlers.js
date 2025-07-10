const db = require('../db/dynamodb');

module.exports = {
    SaveDataIntentHandler: {
        canHandle(handlerInput) {
            return handlerInput.requestEnvelope.request.type === 'IntentRequest'
                && handlerInput.requestEnvelope.request.intent.name === 'SaveDataIntent';
        },
        async handle(handlerInput) {
            const userId = handlerInput.requestEnvelope.session.user.userId;
            
            try {
                await db.saveUserData(userId, {
                    favoriteColor: handlerInput.requestEnvelope.request.intent.slots.color.value
                });
                return handlerInput.responseBuilder
                    .speak('¡Datos guardados correctamente!')
                    .getResponse();
            } catch (error) {
                console.error('Error saving to DynamoDB:', error);
                return handlerInput.responseBuilder
                    .speak('Hubo un error al guardar tus datos')
                    .getResponse();
            }
        }
    }
};