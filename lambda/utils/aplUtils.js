const Alexa = require('ask-sdk-core');
const staticImageDocument = require('../apl/staticImage.json');
const welcomeLogoDocument = require('../apl/welcomeLogo.json');
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
function showWelcomeLogo(handlerInput, message = "¡Bienvenidos a Regreso al Pasado!") {
    if (supportsAPL(handlerInput)) {
        handlerInput.responseBuilder.addDirective({
            type: 'Alexa.Presentation.APL.RenderDocument',
            version: '2023.3',
            document: welcomeLogoDocument,
            datasources: {
                "data": {
                    "message": message
                }
            }
        });
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
        
        let currentRank = 1;
        const playersWithRanking = sortedPlayers.map((player, index) => {
            if (index > 0 && player.score < sortedPlayers[index - 1].score) {
                currentRank = index + 1;
            }
            
            let medal;
            if (currentRank === 1) medal = '🥇';
            else if (currentRank === 2) medal = '🥈';
            else if (currentRank === 3) medal = '🥉';
            else medal = currentRank.toString();
            
            return {
                name: String(player.name || "Jugador").toUpperCase(),
                score: player.score || 0,
                position: currentRank,
                medal: medal
            };
        });
        
        console.log('Ranking calculado:', JSON.stringify(playersWithRanking, null, 2));
        
        handlerInput.responseBuilder.addDirective({
            type: 'Alexa.Presentation.APL.RenderDocument',
            version: '2023.3',
            document: rankingScreenDocument,
            datasources: {
                "data": {
                    "players": playersWithRanking
                }
            }
        });
    }
}

module.exports = {
    supportsAPL,
    showWelcomeLogo,
    showStaticImage,
    showQuestionWithImage,
    showRanking  
};
