const Alexa = require('ask-sdk-core');
const staticImageDocument = require('../apl/staticImage.json');
const questionScreenDocument = require('../apl/questionScreen.json');
const rankingScreenDocument = require('../apl/rankingScreen.json');

function supportsAPL(handlerInput) {
    try {
        const supportedInterfaces = Alexa.getSupportedInterfaces(handlerInput.requestEnvelope);
        return supportedInterfaces['Alexa.Presentation.APL'] !== undefined;
    } catch (error) {
        console.error('Error verificando soporte APL:', error);
        return false;
    }
}

function showStaticImage(handlerInput, message = "¡Bienvenidos/as a Regreso al Pasado!") {
    if (supportsAPL(handlerInput)) {
        handlerInput.responseBuilder.addDirective({
            type: 'Alexa.Presentation.APL.RenderDocument',
            version: '2023.3',
            document: staticImageDocument,
            datasources: {
                "data": {
                    "message": message
                }
            }
        });
    }
}

function showQuestionWithImage(handlerInput, questionData) {
    if (supportsAPL(handlerInput)) {
        let imageUrl;
        
        if (questionData.photo) {
            if (questionData.photo.startsWith('http')) {
                imageUrl = questionData.photo;
            } else {
                imageUrl = `https://imagenesregresopasado.s3.eu-west-1.amazonaws.com/${questionData.photo}`;
            }
        } else {
            imageUrl = 'https://imagenesregresopasado.s3.eu-west-1.amazonaws.com/robot_sin_fondo.png';
        }
        
        console.log('URL de imagen:', imageUrl); 
        
        handlerInput.responseBuilder.addDirective({
            type: 'Alexa.Presentation.APL.RenderDocument',
            version: '2023.3',
            document: questionScreenDocument,
            datasources: {
                "data": {
                    "question": questionData.question,
                    "imageUrl": imageUrl
                }
            }
        });
    }
}

function showRanking(handlerInput, players) {
    if (supportsAPL(handlerInput)) {
        const sortedPlayers = [...players].sort((a, b) => b.score - a.score);
        
        console.log('Mostrando ranking con jugadores:', JSON.stringify(sortedPlayers, null, 2));
        
        const playersForDisplay = sortedPlayers.map(player => ({
            name: String(player.name || "Jugador").toUpperCase(),
            score: player.score || 0
        }));
        
        handlerInput.responseBuilder.addDirective({
            type: 'Alexa.Presentation.APL.RenderDocument',
            version: '2023.3',
            document: rankingScreenDocument,
            datasources: {
                "data": {
                    "players": playersForDisplay
                }
            }
        });
    }
}

module.exports = {
    supportsAPL,
    showStaticImage,
    showQuestionWithImage,
    showRanking  
};
