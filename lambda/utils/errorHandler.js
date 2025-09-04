const voiceRoles = require('./voiceRoles');
const gameStates = require('../game/gameStates');

const generateSpeech = (text, voiceConfig) => {
    return `<voice name="${voiceConfig.voice}"><prosody rate="slow">${text}</prosody></voice>`;
};

const ErrorHandler = {
    handleStartGameError(handlerInput, error) {
        console.error('Error in StartGameIntentHandler handle:', error);
        const voiceConfig = voiceRoles.getVoiceConfig(voiceRoles.getRoleByTime());
        return handlerInput.responseBuilder
            .speak(generateSpeech('Ha habido un problema al iniciar el juego. Por favor, inténtalo de nuevo.', voiceConfig))
            .getResponse();
    },

    handleIndividualQuestionError(handlerInput, error) {
        console.error('Error in IndividualQuestionHandler handle:', error);
        const attributes = handlerInput.attributesManager.getSessionAttributes();
        const voiceConfig = voiceRoles.getVoiceConfig(voiceRoles.getRoleByTime());
        
        let speakOutput = generateSpeech('Ha habido un error al procesar tu respuesta. Vamos a intentarlo de nuevo. ', voiceConfig);
        
        if (attributes.currentQuestion) {
            speakOutput += generateSpeech(`La pregunta era: ${attributes.currentQuestion.question}`, voiceConfig);
        } else {
            speakOutput += generateSpeech('Por favor, responde a la pregunta.', voiceConfig);
        }
        
        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(generateSpeech(`¿Cuál es tu respuesta?`, voiceConfig))
            .getResponse();
    },

    handleTeamQuestionError(handlerInput, error) {
        console.error('[TeamQuestionHandler] Error en handle:', error);
        const voiceConfig = voiceRoles.getVoiceConfig(voiceRoles.getRoleByTime());
        return handlerInput.responseBuilder
            .speak(generateSpeech('Ha habido un error en la pregunta grupal. Volviendo a preguntas individuales.', voiceConfig))
            .getResponse();
    },

    handleFinalTeamQuestionError(handlerInput, error) {
        console.error('Error en FinalTeamQuestionHandler:', error);
        const attributes = handlerInput.attributesManager.getSessionAttributes();
        const voiceConfig = voiceRoles.getVoiceConfig(voiceRoles.getRoleByTime());
        
        attributes.gameState = gameStates.SHOW_RANKING;
        handlerInput.attributesManager.setSessionAttributes(attributes);
        
        return handlerInput.responseBuilder
            .speak(generateSpeech('Vamos a ver los resultados.', voiceConfig))
            .withShouldEndSession(false)
            .getResponse();
    },

    handleAskNextQuestionError(handlerInput, error) {
        console.error('Error in askNextQuestion:', error);
        return handlerInput.responseBuilder
            .speak('Ha habido un problema al preparar la siguiente pregunta. Volviendo al inicio.')
            .getResponse();
    },

    handleStartTeamQuestionError(handlerInput, error) {
        console.error('Error in startTeamQuestion:', error);
        const voiceConfig = voiceRoles.getVoiceConfig(voiceRoles.getRoleByTime());
        return handlerInput.responseBuilder
            .speak(generateSpeech('Ha habido un problema al iniciar la pregunta grupal. Continuamos con preguntas individuales.', voiceConfig))
            .getResponse();
    },

    handleStartFinalTeamQuestionError(handlerInput, error) {
        console.error('Error in startFinalTeamQuestion:', error);
        return handlerInput.responseBuilder
            .speak('Vamos a ver los recuerdos que habéis evocado hoy.')
            .getResponse();
    },

    handleAnswerError(handlerInput, error) {
        console.error('Error in handleAnswer:', error);
        const attributes = handlerInput.attributesManager.getSessionAttributes();
        const voiceConfig = voiceRoles.getVoiceConfig(voiceRoles.getRoleByTime());
        
        let speakOutput = generateSpeech('Ha habido un error al procesar tu respuesta. Vamos a intentarlo de nuevo.', voiceConfig);
        
        if (attributes.currentQuestion) {
            speakOutput += `La pregunta era: ${attributes.currentQuestion.question}`;
        } else {
            speakOutput += `Por favor, responde a la pregunta.`;
        }
        
        speakOutput += `</prosody></voice>`;
        
        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(generateSpeech(`¿Cuál es tu respuesta?`, voiceConfig))
            .getResponse();
    },

    handleNewGameDecisionError(handlerInput, error) {
        console.error('Error in NewGameDecisionHandler:', error);
        const voiceConfig = voiceRoles.getVoiceConfig(voiceRoles.getRoleByTime());
        return handlerInput.responseBuilder
            .speak(generateSpeech('Vamos a empezar una nueva partida. ¿Cuántos jugadores sois?', voiceConfig))
            .reprompt(generateSpeech('Por favor, dime cuántos jugadores van a jugar hoy.', voiceConfig))
            .getResponse();
    },

    handleSamePlayersError(handlerInput, error) {
        console.error('Error in SamePlayersHandler:', error);
        const voiceConfig = voiceRoles.getVoiceConfig(voiceRoles.getRoleByTime());
        return handlerInput.responseBuilder
            .speak(generateSpeech('Vamos a empezar una nueva partida. ¿Cuántos jugadores sois hoy?', voiceConfig))
            .reprompt(generateSpeech('Por favor, dime cuántos jugadores vais a jugar hoy.', voiceConfig))
            .getResponse();
    }
};

module.exports = ErrorHandler;