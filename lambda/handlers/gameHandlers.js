const Alexa = require('ask-sdk-core');
const questions = require('../game/questions');
const voiceRoles = require('../utils/voiceRoles');
const gameStates = require('../game/gameStates');
const { sendProgressiveResponse } = require('ask-sdk-core');

// Helper functions
const normalizeString = (str) => str ? str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") : "";
const getRandomFeedback = (isCorrect, correctAnswer) => {
    if (isCorrect) {
        const positiveFeedback = ["¡Excelente!", "¡Muy bien!", "¡Correcto!", "¡Lo sabías!", "¡Perfecto!"];
        return positiveFeedback[Math.floor(Math.random() * positiveFeedback.length)];
    }
    return `Casi. La respuesta correcta era ${correctAnswer}.`;
};

const verifySessionAttributes = (attributes) => {
    if (!attributes) throw new Error('No session attributes found');
    if (!attributes.players || !Array.isArray(attributes.players)) throw new Error('Invalid players data');
    if (attributes.players.length === 0) throw new Error('No players registered');
    if (!attributes.gameState) throw new Error('Game state not defined');
};

const StartGameIntentHandler = {
    canHandle(handlerInput) {
        try {
            const attributes = handlerInput.attributesManager.getSessionAttributes();
            return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
                   Alexa.getIntentName(handlerInput.requestEnvelope) === 'StartGameIntent' &&
                   attributes.gameState === gameStates.GAME_STARTED;
        } catch (error) {
            console.error('Error in StartGameIntentHandler canHandle:', error);
            return false;
        }
    },

    handle(handlerInput) {
        try {
            const { attributesManager } = handlerInput;
            const attributes = attributesManager.getSessionAttributes();
            
            // Initialize game state
            attributes.questionCounter = attributes.questionCounter || 0;
            attributes.currentPlayerIndex = 0;
            attributes.currentPlayerName = attributes.players[0].name;
            attributes.questionsAsked = [];
            
            // Select random category
            const categories = Object.keys(questions);
            const randomCategory = categories[Math.floor(Math.random() * categories.length)];
            attributes.currentCategory = randomCategory;
            
            // Get first question
            const question = questions[randomCategory][0];
            attributes.currentQuestion = question;
            attributes.questionsAsked.push(question.question);
            attributes.gameState = gameStates.INDIVIDUAL_QUESTION;
            
            attributesManager.setSessionAttributes(attributes);
            
            const voiceConfig = voiceRoles.getVoiceConfig(voiceRoles.getRoleByTime());
            
            const speakOutput = `<voice name="${voiceConfig.voice}">` +
                `${voiceConfig.greeting || '¡Vamos a empezar!'} ` +
                `La primera pregunta es para ${attributes.currentPlayerName}. ` +
                `Categoría: ${randomCategory}. ${question.question}</voice>`;
            
            return handlerInput.responseBuilder
                .speak(speakOutput)
                .reprompt(`¿${attributes.currentPlayerName}, cuál es tu respuesta?`)
                .getResponse();
        } catch (error) {
            console.error('Error in StartGameIntentHandler handle:', error);
            return handlerInput.responseBuilder
                .speak('Hubo un problema al iniciar el juego. Por favor, inténtalo de nuevo.')
                .getResponse();
        }
    }
};

const IndividualQuestionHandler = {
    canHandle(handlerInput) {
        try {
            const attributes = handlerInput.attributesManager.getSessionAttributes();
            const intentName = Alexa.getIntentName(handlerInput.requestEnvelope);
            
            return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
                   (intentName === 'AnswerIntent' || intentName === 'AMAZON.YesIntent') &&
                   (attributes.gameState === gameStates.INDIVIDUAL_QUESTION || 
                    attributes.gameState === gameStates.TEAM_QUESTION);
        } catch (error) {
            console.error('Error in IndividualQuestionHandler canHandle:', error);
            return false;
        }
    },

    async handle(handlerInput) {
        try {
            const { requestEnvelope, attributesManager } = handlerInput;
            const intentName = Alexa.getIntentName(requestEnvelope);
            const voiceConfig = voiceRoles.getVoiceConfig(voiceRoles.getRoleByTime());
            const attributes = attributesManager.getSessionAttributes();
            
            verifySessionAttributes(attributes);
            
            if (intentName === 'AnswerIntent') {
                return handleAnswer(handlerInput, voiceConfig);
            }
            
            if (intentName === 'AMAZON.YesIntent') {
                return askNextQuestion(handlerInput, voiceConfig);
            }
            
            return handlerInput.responseBuilder
                .speak("No entendí tu respuesta. ¿Puedes repetirla?")
                .reprompt("¿Cuál es tu respuesta?")
                .getResponse();
        } catch (error) {
            console.error('Error in IndividualQuestionHandler handle:', error);
            return handlerInput.responseBuilder
                .speak('Ocurrió un error al procesar tu respuesta. Volviendo al menú principal.')
                .getResponse();
        }
    }
};

const TeamQuestionHandler = {
    canHandle(handlerInput) {
        try {
            const attributes = handlerInput.attributesManager.getSessionAttributes();
            return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
                   attributes.gameState === gameStates.TEAM_QUESTION;
        } catch (error) {
            console.error('Error in TeamQuestionHandler canHandle:', error);
            return false;
        }
    },

    async handle(handlerInput) {
        try {
            const { attributesManager, requestEnvelope } = handlerInput;
            const attributes = attributesManager.getSessionAttributes();
            const intentName = Alexa.getIntentName(requestEnvelope);
            const voiceConfig = voiceRoles.getVoiceConfig(voiceRoles.getRoleByTime());
            
            verifySessionAttributes(attributes);
            
            const teammateIndex = (attributes.currentPlayerIndex + 1) % attributes.players.length;
            const teammateName = attributes.players[teammateIndex].name;
            
            if (intentName === 'AMAZON.NoIntent') {
                attributes.gameState = gameStates.INDIVIDUAL_QUESTION;
                attributesManager.setSessionAttributes(attributes);
                
                return handlerInput.responseBuilder
                    .speak(`<voice name="${voiceConfig.voice}">Continuamos con preguntas individuales. ${attributes.currentQuestion.question}</voice>`)
                    .reprompt(`¿${attributes.currentPlayerName}, cuál es tu respuesta?`)
                    .getResponse();
            }
            
            if (intentName === 'AMAZON.YesIntent') {
                return handlerInput.responseBuilder
                    .speak(`<voice name="${voiceConfig.voice}">Perfecto. Trabajen juntos con ${teammateName}. Cuando estén listos, díganme su respuesta. La pregunta es: ${attributes.currentQuestion.question}</voice>`)
                    .reprompt("¿Cuál es su respuesta en equipo?")
                    .getResponse();
            }
            
            if (intentName === 'AnswerIntent') {
                const userAnswer = Alexa.getSlotValue(requestEnvelope, 'answer');
                const possibleAnswers = attributes.currentQuestion.answers || [attributes.currentQuestion.answer];
                const isCorrect = possibleAnswers.some(ans => normalizeString(userAnswer).includes(normalizeString(ans)));
                
                if (isCorrect) {
                    attributes.players[attributes.currentPlayerIndex].score += 1;
                    attributes.players[teammateIndex].score += 1;
                }
                
                attributes.currentPlayerIndex = (attributes.currentPlayerIndex + 1) % attributes.players.length;
                attributes.currentPlayerName = attributes.players[attributes.currentPlayerIndex].name;
                attributes.gameState = gameStates.INDIVIDUAL_QUESTION;
                attributesManager.setSessionAttributes(attributes);
                
                const speakOutput = `<voice name="${voiceConfig.voice}">` +
                    `${getRandomFeedback(isCorrect, possibleAnswers[0])} ` +
                    `¿Listos para continuar?</voice>`;
                
                return handlerInput.responseBuilder
                    .speak(speakOutput)
                    .reprompt("¿Listos para la siguiente pregunta?")
                    .getResponse();
            }
            
            return handlerInput.responseBuilder
                .speak("¿Quieres responder esta pregunta con un compañero? Responde sí o no.")
                .reprompt("¿Responden en equipo? Di sí o no.")
                .getResponse();
        } catch (error) {
            console.error('Error in TeamQuestionHandler handle:', error);
            return handlerInput.responseBuilder
                .speak('Ocurrió un error en la pregunta grupal. Volviendo a preguntas individuales.')
                .getResponse();
        }
    }
};


// Helper functions implementations
function handleAnswer(handlerInput, voiceConfig) {
    try {
        const { attributesManager, requestEnvelope } = handlerInput;
        const attributes = attributesManager.getSessionAttributes();
        
        verifySessionAttributes(attributes);
        
        const userAnswer = Alexa.getSlotValue(requestEnvelope, 'answer');
        const possibleAnswers = attributes.currentQuestion.answers || [attributes.currentQuestion.answer];
        const isCorrect = possibleAnswers.some(ans => normalizeString(userAnswer).includes(normalizeString(ans)));
        
        if (isCorrect) {
            attributes.players[attributes.currentPlayerIndex].score += 1;
        }
        
        attributes.currentPlayerIndex = (attributes.currentPlayerIndex + 1) % attributes.players.length;
        attributes.currentPlayerName = attributes.players[attributes.currentPlayerIndex].name;
        attributesManager.setSessionAttributes(attributes);
        
        const speakOutput = `<voice name="${voiceConfig.voice}">` +
            `${getRandomFeedback(isCorrect, possibleAnswers[0])} ` +
            `¿Listos para la siguiente pregunta?</voice>`;
        
        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt("¿Quieren continuar con la siguiente pregunta?")
            .getResponse();
    } catch (error) {
        console.error('Error in handleAnswer:', error);
        return handlerInput.responseBuilder
            .speak('Ocurrió un error al procesar tu respuesta. Volviendo al menú principal.')
            .getResponse();
    }
}

function askNextQuestion(handlerInput, voiceConfig) {
    try {
        const { attributesManager } = handlerInput;
        const attributes = attributesManager.getSessionAttributes();
        
        verifySessionAttributes(attributes);
        
        let questionsLeft = questions[attributes.currentCategory].filter(q => 
            !attributes.questionsAsked.includes(q.question)
        );
        
        if (questionsLeft.length === 0) {
            const remainingCategories = Object.keys(questions).filter(cat => cat !== attributes.currentCategory);
            
            if (remainingCategories.length === 0) {
                return endGame(handlerInput);
            }
            
            attributes.currentCategory = remainingCategories[Math.floor(Math.random() * remainingCategories.length)];
            attributes.questionsAsked = [];
            questionsLeft = questions[attributes.currentCategory];
        }
        
        attributes.questionCounter = (attributes.questionCounter || 0) + 1;
        
        // Pregunta en equipo cada 3 preguntas (solo si hay más de 1 jugador)
        if (attributes.questionCounter % 3 === 0 && attributes.players.length > 1) {
            return startTeamQuestion(handlerInput, voiceConfig);
        }
        
        // Pregunta individual normal
        const question = questionsLeft[0];
        attributes.currentQuestion = question;
        attributes.questionsAsked.push(question.question);
        attributes.gameState = gameStates.INDIVIDUAL_QUESTION;
        
        attributesManager.setSessionAttributes(attributes);
        
        const speakOutput = `<voice name="${voiceConfig.voice}">La siguiente pregunta es para ${attributes.currentPlayerName}. Categoría: ${attributes.currentCategory}. ${question.question}</voice>`;
        
        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(`¿${attributes.currentPlayerName}, cuál es tu respuesta?`)
            .getResponse();
    } catch (error) {
        console.error('Error in askNextQuestion:', error);
        return handlerInput.responseBuilder
            .speak('Hubo un problema al preparar la siguiente pregunta. Volviendo al inicio.')
            .getResponse();
    }
}

function startTeamQuestion(handlerInput, voiceConfig) {
    try {
        const { attributesManager } = handlerInput;
        const attributes = attributesManager.getSessionAttributes();
        
        verifySessionAttributes(attributes);
        
        attributes.gameState = gameStates.TEAM_QUESTION;
        
        const questionsLeft = questions[attributes.currentCategory].filter(q => 
            !attributes.questionsAsked.includes(q.question)
        );
        const question = questionsLeft[0];
        
        attributes.currentQuestion = question;
        attributes.questionsAsked.push(question.question);
        
        const teammateIndex = (attributes.currentPlayerIndex + 1) % attributes.players.length;
        const teammateName = attributes.players[teammateIndex].name;
        
        const speakOutput = `<voice name="${voiceConfig.voice}">¡Pregunta en equipo! ${attributes.currentPlayerName}, ¿quieres responder esta pregunta con ${teammateName}? La pregunta es: ${question.question}</voice>`;
        
        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt("¿Quieres responder esta pregunta con un compañero? Di sí o no.")
            .getResponse();
    } catch (error) {
        console.error('Error in startTeamQuestion:', error);
        return handlerInput.responseBuilder
            .speak('Hubo un problema al iniciar la pregunta grupal. Continuamos con preguntas individuales.')
            .getResponse();
    }
}

function endGame(handlerInput) {
    try {
        const { attributesManager } = handlerInput;
        const attributes = attributesManager.getSessionAttributes();
        
        verifySessionAttributes(attributes);
        
        const scores = attributes.players.map(p => `${p.name}: ${p.score} puntos`).join(', ');
        return handlerInput.responseBuilder
            .speak(`El juego ha terminado. Puntuaciones finales: ${scores}. ¡Gracias por jugar!`)
            .withShouldEndSession(true)
            .getResponse();
    } catch (error) {
        console.error('Error in endGame:', error);
        return handlerInput.responseBuilder
            .speak('El juego ha terminado. ¡Gracias por jugar!')
            .withShouldEndSession(true)
            .getResponse();
    }
}

module.exports = {
    StartGameIntentHandler,
    IndividualQuestionHandler,
    TeamQuestionHandler
};
