const Alexa = require('ask-sdk-core');
const welcomeDocument = require('../apl/welcomeScreen.json');

// Verificar si el dispositivo soporta APL
function supportsAPL(handlerInput) {
    try {
        const supportedInterfaces = Alexa.getSupportedInterfaces(handlerInput.requestEnvelope);
        const hasAPL = supportedInterfaces['Alexa.Presentation.APL'] !== undefined;
        console.log(`Dispositivo soporta APL: ${hasAPL}`);
        return hasAPL;
    } catch (error) {
        console.error('Error verificando soporte APL:', error);
        return false;
    }
}

// Mostrar solo la pantalla de bienvenida con la cara
function showWelcomeScreen(handlerInput) {
    if (supportsAPL(handlerInput)) {
        console.log('Mostrando pantalla de bienvenida APL');
        
        handlerInput.responseBuilder.addDirective({
            type: 'Alexa.Presentation.APL.RenderDocument',
            version: '2024.1',
            document: welcomeDocument,
            datasources: {
                "data": {
                    // Puedes añadir datos dinámicos aquí si necesitas
                    "welcomeMessage": "¡Bienvenidos/as a Regreso al Pasado!"
                }
            }
        });
    } else {
        console.log('Dispositivo no soporta APL, omitiendo pantalla de bienvenida');
    }
}

module.exports = {
    supportsAPL,
    showWelcomeScreen
};