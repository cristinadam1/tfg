const Alexa = require('ask-sdk-core');
const questions = require('../game/questions');
const voiceRoles = require('../utils/voiceRoles');
const gameStates = require('../game/gameStates');
const { sendProgressiveResponse } = require('ask-sdk-core');
const db = require('../db/dynamodb');
const aplUtils = require('../utils/aplUtils');
const questionUtils = require('../utils/questionUtils');
const rankingUtils = require('../utils/rankingUtils');
const ErrorHandler = require('../utils/errorHandler');


const normalizeString = (str) => str ? str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") : "";
const generateSpeech = (text, voiceConfig) => {
    return `<voice name="${voiceConfig.voice}"><prosody rate="slow">${text}</prosody></voice>`;
};

const getRandomFeedback = (isCorrect, correctAnswer, voiceConfig) => {
    if (isCorrect) {
        const positiveFeedback = ["¡Excelente!", "¡Muy bien!", "¡Correcto!", "¡Qué bien se te da esto!", "¡Respuesta correcta!"];
        return positiveFeedback[Math.floor(Math.random() * positiveFeedback.length)];
    }
    return  generateSpeech(`Casi. La respuesta correcta era ${correctAnswer}.`, voiceConfig);
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
                   (Alexa.getIntentName(handlerInput.requestEnvelope) === 'StartGameIntent' || Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.YesIntent') &&
                   (attributes.gameState === gameStates.GAME_STARTED || 
                    attributes.gameState === gameStates.ASKING_FAVORITE_SONGS);
        } catch (error) {
            console.error('Error in StartGameIntentHandler canHandle:', error);
            return false;
        }
    },
    handle(handlerInput) {
        try {
            const { attributesManager } = handlerInput;
            const attributes = attributesManager.getSessionAttributes();
            
            attributes.questionCounter = attributes.questionCounter || 0;
            attributes.currentPlayerIndex = 0;
            attributes.currentPlayerName = attributes.players[0].name;
            attributes.questionsAsked = [];
            
            const categories = Object.keys(questions);
            const randomCategory = categories[Math.floor(Math.random() * categories.length)];
            attributes.currentCategory = randomCategory;
            
            const question = questions[randomCategory][0];
            attributes.currentQuestion = question;
            attributes.questionsAsked.push(question.question);
            attributes.gameState = gameStates.INDIVIDUAL_QUESTION;
            
            attributesManager.setSessionAttributes(attributes);
            
            const voiceConfig = voiceRoles.getVoiceConfig(voiceRoles.getRoleByTime());
            
            const speakOutput = generateSpeech (`¡Vamos a empezar! La primera pregunta es para ${attributes.currentPlayerName}.
                                                ${question.question}`, voiceConfig);

            aplUtils.showQuestionWithImage(handlerInput, question);
            
            return handlerInput.responseBuilder
                .speak(speakOutput)
                .reprompt(generateSpeech(`¿${attributes.currentPlayerName}, cuál es tu respuesta?`, voiceConfig))
                .getResponse();
        } catch (error) {
            return ErrorHandler.handleStartGameError(handlerInput, error);
        }
    }
};

const IndividualQuestionHandler = {
    canHandle(handlerInput) {
        try {
            const attributes = handlerInput.attributesManager.getSessionAttributes();
            const intentName = Alexa.getIntentName(handlerInput.requestEnvelope);

            if (attributes.awaitingHintResponse) {
                return false;
            }
            
            if (attributes.expectingContinueConfirmation && intentName === 'AMAZON.YesIntent') {
                return true;
            }
            
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
            
            if (attributes.expectingContinueConfirmation && intentName === 'AMAZON.YesIntent') {
                attributes.expectingContinueConfirmation = false;
                attributesManager.setSessionAttributes(attributes);
                return await askNextQuestion(handlerInput, voiceConfig);
            }
            
            if (intentName === 'AnswerIntent') {
                return await handleAnswer(handlerInput, voiceConfig);
            }
            
            if (intentName === 'AMAZON.YesIntent') {
                return await askNextQuestion(handlerInput, voiceConfig);
            }
            
            return handlerInput.responseBuilder
                .speak(generateSpeech(`Perdona, no te he entendido bien. ¿Puedes repetirlo? Debes decir: La respuesta es`, voiceConfig))
                .reprompt(generateSpeech(`¿Cuál es tu respuesta?`, voiceConfig))
                .getResponse();
        } catch (error) {
            return ErrorHandler.handleIndividualQuestionError(handlerInput, error);
        }
    }
};

async function askNextQuestion(handlerInput, voiceConfig) {
    try {
        const { attributesManager } = handlerInput;
        const attributes = attributesManager.getSessionAttributes();
        
        verifySessionAttributes(attributes);
        
        if (!attributes.questionsPerPlayer) {
            attributes.questionsPerPlayer = {};
            attributes.players.forEach(player => {
                attributes.questionsPerPlayer[player.name] = 0;
            });
        }
        
        attributes.questionsPerPlayer[attributes.currentPlayerName] = 
            (attributes.questionsPerPlayer[attributes.currentPlayerName] || 0) + 1;
        
        const minQuestions = Math.min(...Object.values(attributes.questionsPerPlayer));
        if (minQuestions >= 2) {
            return startFinalTeamQuestion(handlerInput, voiceConfig);
        }
        
        const question = questionUtils.getNextAvailableQuestion(attributes);
        
        if (!question) {
            return startFinalTeamQuestion(handlerInput, voiceConfig);
        }
        
        attributes.questionCounter = (attributes.questionCounter || 0) + 1;
        
        if (attributes.questionCounter % 3 === 0 && attributes.players.length > 1) {
            return startTeamQuestion(handlerInput, voiceConfig);
        }
        
        attributes.currentQuestion = question;
        attributes.questionsAsked.push(question.question);
        attributes.gameState = gameStates.INDIVIDUAL_QUESTION;
        
        attributesManager.setSessionAttributes(attributes);
        
        const speakOutput = generateSpeech(`La siguiente pregunta es para ${attributes.currentPlayerName}. ${question.question}. Debes decirme. La respuesta es ...`, voiceConfig);

        aplUtils.showQuestionWithImage(handlerInput, question);

        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(generateSpeech(`¿${attributes.currentPlayerName}, cuál es tu respuesta?`, voiceConfig))
            .getResponse();
    } catch (error) {
        console.error('Error in askNextQuestion:', error);
        return handlerInput.responseBuilder
            .speak('Ha habido un problema al preparar la siguiente pregunta. Volviendo al inicio.')
            .getResponse();
    }
}

const TeamQuestionHandler = {
    canHandle(handlerInput) {
        try {
            const attributes = handlerInput.attributesManager.getSessionAttributes();
            const intentName = Alexa.getIntentName(handlerInput.requestEnvelope);
            
            console.log('[TeamQuestionHandler] Verificando canHandle. GameState:', attributes.gameState, 'Intent:', intentName);

            if (attributes.awaitingHintResponse) {
                console.log('[TeamQuestionHandler] awaitingHintResponse es true, no manejando');
                return false;
            }
            
            if (attributes.expectingContinueConfirmation && intentName === 'AMAZON.YesIntent') {
                return true;
            }
            
            return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
                   attributes.gameState === gameStates.TEAM_QUESTION &&
                   intentName !== 'HelpIntent' &&
                   intentName !== 'PassQuestionIntent';
        } catch (error) {
            console.error('[TeamQuestionHandler] Error en canHandle:', error);
            return false;
        }
    },
    async handle(handlerInput) {
        try {
            console.log('[TeamQuestionHandler] Iniciando manejo de pregunta grupal');
            const { attributesManager, requestEnvelope } = handlerInput;
            const attributes = attributesManager.getSessionAttributes();
            const intentName = Alexa.getIntentName(requestEnvelope);
            const voiceConfig = voiceRoles.getVoiceConfig(voiceRoles.getRoleByTime());
            
            console.log('[TeamQuestionHandler] Intent recibido:', intentName);
            
            verifySessionAttributes(attributes);
            
            const teammateIndex = (attributes.currentPlayerIndex + 1) % attributes.players.length;
            const teammateName = attributes.players[teammateIndex].name;
            const currentPlayerName = attributes.players[attributes.currentPlayerIndex].name;

            aplUtils.showQuestionWithImage(handlerInput, attributes.currentQuestion);

            console.log(`[TeamQuestionHandler] Jugador actual: ${currentPlayerName}, Compañero: ${teammateName}`);

            if (intentName === 'AnswerIntent') {
                const userAnswer = Alexa.getSlotValue(requestEnvelope, 'answer');
                const possibleAnswers = attributes.currentQuestion.answers || [attributes.currentQuestion.answer];
                const isCorrect = possibleAnswers.some(ans => normalizeString(userAnswer).includes(normalizeString(ans)));
                
                console.log(`[TeamQuestionHandler] Respuesta recibida: "${userAnswer}". Correcta?: ${isCorrect}`);
                
                if (isCorrect) {
                    console.log('[TeamQuestionHandler] Respuesta correcta. Actualizando puntuaciones...');
                    attributes.players[attributes.currentPlayerIndex].score += 1;
                    attributes.players[teammateIndex].score += 1;

                    try {
                        console.log('[TeamQuestionHandler] Guardando puntuación grupal en DynamoDB...');
                        await db.saveGameSession(requestEnvelope.session.sessionId, {
                            playerCount: attributes.playerCount,
                            players: attributes.players,
                            gameState: attributes.gameState,
                            currentPlayerIndex: attributes.currentPlayerIndex,
                            createdAt: attributes.createdAt
                        });
                        console.log('[TeamQuestionHandler] Puntuación guardada exitosamente');
                    } catch (error) {
                        console.error('[TeamQuestionHandler] Error al guardar puntuación grupal:', error);
                    }
                }
                
                attributes.currentPlayerIndex = (attributes.currentPlayerIndex + 1) % attributes.players.length;
                attributes.currentPlayerName = attributes.players[attributes.currentPlayerIndex].name;
                attributes.gameState = gameStates.INDIVIDUAL_QUESTION;
                attributesManager.setSessionAttributes(attributes);
                
                console.log('[TeamQuestionHandler] Nuevo jugador actual:', attributes.currentPlayerName);
                
                const speakOutput = generateSpeech(
                                    `${getRandomFeedback(isCorrect, possibleAnswers[0], voiceConfig)} ¿Listos para continuar?`,
                                    voiceConfig);
                
                return handlerInput.responseBuilder
                    .speak(speakOutput)
                    .reprompt("¿Listos para la siguiente pregunta?")
                    .getResponse();
            }
            
            console.log('[TeamQuestionHandler] Intent no manejado:', intentName);
            const speakOutput = generateSpeech(
                `Perdonad, no os he entendido. Debeis decir La respuesta es, seguido de la respuesta. Por ejemplo, la respuesta es Francia. La pregunta es: ${attributes.currentQuestion.question}`,
                voiceConfig);
            
            return handlerInput.responseBuilder
                .speak(speakOutput)
                .reprompt(generateSpeech(`¿Cuál es vuestra respuesta en equipo? Debeis decir La respuesta es, seguido de la respuesta. Por ejemplo, la respuesta es Francia.`, voiceConfig))
                .getResponse();
                
        } catch (error) {
            return ErrorHandler.handleTeamQuestionError(handlerInput, error);
        }
    }
};

function startTeamQuestion(handlerInput, voiceConfig) {
    try {
        const { attributesManager } = handlerInput;
        const attributes = attributesManager.getSessionAttributes();
        
        verifySessionAttributes(attributes);
        
        const question = questionUtils.getNextAvailableQuestion(attributes);
        
        if (!question) {
            return startFinalTeamQuestion(handlerInput, voiceConfig);
        }
        
        attributes.currentQuestion = question;
        attributes.questionsAsked.push(question.question);
        attributes.gameState = gameStates.TEAM_QUESTION;
        attributesManager.setSessionAttributes(attributes);
        
        const teammateIndex = (attributes.currentPlayerIndex + 1) % attributes.players.length;
        const teammateName = attributes.players[teammateIndex].name;
        const currentPlayerName = attributes.players[attributes.currentPlayerIndex].name;
        
        aplUtils.showQuestionWithImage(handlerInput, question);

        const speakOutput = generateSpeech(`¡Pregunta en equipo! ${currentPlayerName}, trabaja junto con ${teammateName}. La pregunta es: ${question.question}`,voiceConfig);
        
        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt("¿Cuál es vuestra respuesta en equipo? Si necesitas ayuda dime necesito ayuda")
            .getResponse();
    } catch (error) {
        return ErrorHandler.handleStartTeamQuestionError(handlerInput, error);
    }
}

const FinalTeamQuestionHandler = {
    canHandle(handlerInput) {
        const attributes = handlerInput.attributesManager.getSessionAttributes();

        if (attributes.awaitingHintResponse) {
            return false;
        }

        const intentName = Alexa.getIntentName(handlerInput.requestEnvelope);
        
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
               attributes.gameState === gameStates.FINAL_TEAM_QUESTION &&
               intentName !== 'PassQuestionIntent';
    },
    async handle(handlerInput) {
        try {
            const { attributesManager, requestEnvelope } = handlerInput;
            const attributes = attributesManager.getSessionAttributes();
            
            aplUtils.showQuestionWithImage(handlerInput, attributes.currentQuestion);

            const intentName = Alexa.getIntentName(requestEnvelope);
            const voiceConfig = voiceRoles.getVoiceConfig(voiceRoles.getRoleByTime());
            
            if (intentName === 'AnswerIntent') {
                const userAnswer = Alexa.getSlotValue(requestEnvelope, 'answer');
                const possibleAnswers = attributes.currentQuestion.answers || [attributes.currentQuestion.answer];
                const isCorrect = possibleAnswers.some(ans => normalizeString(userAnswer).includes(normalizeString(ans)));

                if (isCorrect) {
                    attributes.players.forEach(player => {
                        player.score += 2;
                    });
                    
                    try {
                        await db.saveGameSession(requestEnvelope.session.sessionId, {
                            playerCount: attributes.playerCount,
                            players: attributes.players,
                            gameState: gameStates.SHOW_RANKING,
                            createdAt: attributes.createdAt
                        });
                    } catch (error) {
                        console.error('Error al guardar puntuación final:', error);
                    }
                }

                aplUtils.showRanking(handlerInput, attributes.players);

                const feedback = isCorrect ? 
                                generateSpeech("¡Respuesta correcta! Todos ganáis recuerdos extra.", voiceConfig) : 
                                getRandomFeedback(false, possibleAnswers[0], voiceConfig);

                const speakOutput = feedback + rankingUtils.getFullRankingAnnouncement(attributes.players);

                attributes.gameState = gameStates.ASKING_FOR_NEW_GAME;
                attributesManager.setSessionAttributes(attributes);

                return handlerInput.responseBuilder
                    .speak(speakOutput)
                    .reprompt("¿Queréis jugar otra partida?")
                    .getResponse();
            }
            
            return handlerInput.responseBuilder
                .speak(generateSpeech(`Por favor, decidme vuestra respuesta conjunta. Debeis empezar diciendo "La respuesta es".`, voiceConfig))
                .reprompt(generateSpeech(`¿Cuál es vuestra respuesta como equipo?`, voiceConfig))
                .getResponse();
                
        } catch (error) {
            console.error('Error en FinalTeamQuestionHandler:', error);

            attributes.gameState = gameStates.SHOW_RANKING;
            attributesManager.setSessionAttributes(attributes);
            
            return handlerInput.responseBuilder
                .speak(generateSpeech(`Vamos a ver los resultados.`, voiceConfig))
                .withShouldEndSession(false)
                .getResponse();
        }
    }
};

const HelpIntentHandler = {
    canHandle(handlerInput) {
      const attributes = handlerInput.attributesManager.getSessionAttributes();
      return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
             Alexa.getIntentName(handlerInput.requestEnvelope) === 'HelpIntent' &&
             (attributes.gameState === gameStates.INDIVIDUAL_QUESTION || 
              attributes.gameState === gameStates.TEAM_QUESTION ||
              attributes.gameState === gameStates.FINAL_TEAM_QUESTION);
    },
  
    handle(handlerInput) {
      const { attributesManager } = handlerInput;
      const attributes = attributesManager.getSessionAttributes();
      const voiceConfig = voiceRoles.getVoiceConfig(voiceRoles.getRoleByTime());
  
      const currentQuestion = attributes.currentQuestion;
      if (!currentQuestion || !currentQuestion.hints || currentQuestion.hints.length === 0) {
        return handlerInput.responseBuilder
          .speak(generateSpeech(`Lo siento, no tengo pistas para esta pregunta. Intenta adivinarlo lo mejor que puedas.`, voiceConfig))
          .reprompt(generateSpeech(`¿${attributes.currentPlayerName}, cuál es tu respuesta?`, voiceConfig))
          .getResponse();
      }
  
      if (!attributes.hintsUsed) {
        attributes.hintsUsed = {};
      }
      
      if (!attributes.hintsUsed[currentQuestion.question]) {
        attributes.hintsUsed[currentQuestion.question] = 0;
      }
  
      const hintsUsedCount = attributes.hintsUsed[currentQuestion.question];
      
      if (hintsUsedCount >= currentQuestion.hints.length) {
        return handlerInput.responseBuilder
          .speak(generateSpeech(`¡Oh vaya! parece que te he dado todas las pistas que tengo para esta pregunta. ¡Intenta adivinarlo!`, voiceConfig))
          .reprompt(generateSpeech(`¿${attributes.currentPlayerName}, cuál es tu respuesta?`, voiceConfig))
          .getResponse();
      }
  
      const hint = currentQuestion.hints[hintsUsedCount];
      attributes.hintsUsed[currentQuestion.question] = hintsUsedCount + 1;
      attributesManager.setSessionAttributes(attributes);
  
      let speakOutput = generateSpeech(`Aquí tienes una pista: ${hint}.`, voiceConfig);
      
      if (hintsUsedCount + 1 < currentQuestion.hints.length) {
        speakOutput += generateSpeech(`¡Si necesitas más ayuda, no dudes en pedirmela!.`, voiceConfig);
      }
      
      let repromptMessage;
      if (attributes.gameState === gameStates.TEAM_QUESTION) {
        const teammateIndex = (attributes.currentPlayerIndex + 1) % attributes.players.length;
        const teammateName = attributes.players[teammateIndex].name;
        speakOutput += generateSpeech(`La pregunta era: ${currentQuestion.question}. ${attributes.currentPlayerName} y ${teammateName} teneis que trabajar juntos para encontrar la respuesta.`, voiceConfig);
        repromptMessage = generateSpeech(`¿Cuál es vuestra respuesta en equipo?`, voiceConfig);
      } else if (attributes.gameState === gameStates.FINAL_TEAM_QUESTION) {
        speakOutput += generateSpeech(`La pregunta era: ${currentQuestion.question}.`, voiceConfig);
        repromptMessage = generateSpeech(`¿Cuál es vuestra respuesta en equipo?`, voiceConfig);
      } else {
        speakOutput += generateSpeech(`La pregunta era: ${currentQuestion.question}. ¿Cuál crees que es la respuesta?`, voiceConfig);
        repromptMessage = generateSpeech(`¿${attributes.currentPlayerName}, cuál es tu respuesta?`, voiceConfig);
      }
  
      return handlerInput.responseBuilder
        .speak(speakOutput)
        .reprompt(repromptMessage)
        .getResponse();
    }
};

const NewGameDecisionHandler = {
    canHandle(handlerInput) {
        const attributes = handlerInput.attributesManager.getSessionAttributes();
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
               (Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.YesIntent' ||
                Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.NoIntent') &&
               attributes.gameState === gameStates.ASKING_FOR_NEW_GAME;
    },

    async handle(handlerInput) {
        try {
            const { attributesManager, requestEnvelope } = handlerInput;
            const attributes = attributesManager.getSessionAttributes();
            const intentName = Alexa.getIntentName(requestEnvelope);
            const voiceConfig = voiceRoles.getVoiceConfig(voiceRoles.getRoleByTime());

            if (intentName === 'AMAZON.NoIntent') {
                const farewellMessages = [
                    "¡Ha sido un placer jugar con vosotros! Espero que hayáis recordado buenos momentos, hasta la próxima.",
                    "¡Hasta la próxima! Me ha encantado jugar con vosotros.",
                    "¡Gracias por jugar! No olvidéis seguir creando buenos recuerdos."
                ];
                
                const randomMessage = farewellMessages[Math.floor(Math.random() * farewellMessages.length)];
                attributes.gameState = gameStates.ENDED;
                try {
                    await db.saveGameSession(requestEnvelope.session.sessionId, {
                        playerCount: attributes.playerCount,
                        players: attributes.players,
                        gameState: attributes.gameState,
                        currentPlayerIndex: attributes.currentPlayerIndex,
                        createdAt: attributes.createdAt
                    });
                } catch (error) {
                    console.error('Error al guardar puntuación grupal:', error);
                }
                
                return handlerInput.responseBuilder
                    .speak(generateSpeech(`${randomMessage}`, voiceConfig))
                    .withShouldEndSession(true)
                    .getResponse();
            }
            
            if (intentName === 'AMAZON.YesIntent') {
                attributes.gameState = gameStates.ASKING_ABOUT_PLAYERS;
                attributesManager.setSessionAttributes(attributes);
                
                return handlerInput.responseBuilder
                    .speak(generateSpeech(`¡Genial! ¿Sois los mismos jugadores?`, voiceConfig))
                    .reprompt(generateSpeech(`¿Sois los mismos jugadores?`, voiceConfig))
                    .getResponse();
            }
            
            return handlerInput.responseBuilder
                .speak(generateSpeech(`No he entendido tu respuesta. ¿Queréis jugar otra vez?`, voiceConfig))
                .reprompt(generateSpeech(`¿Queréis jugar otra vez?`, voiceConfig))
                .getResponse();
        } catch (error) {
            return ErrorHandler.handleNewGameDecisionError(handlerInput, error);
        }
    }
};

const SamePlayersHandler = {
    canHandle(handlerInput) {
        const attributes = handlerInput.attributesManager.getSessionAttributes();
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
               (Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.YesIntent' ||
                Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.NoIntent') &&
               attributes.gameState === gameStates.ASKING_ABOUT_PLAYERS;
    },

    async handle(handlerInput) {
        try {
            const { attributesManager, requestEnvelope } = handlerInput;
            const attributes = attributesManager.getSessionAttributes();
            const intentName = Alexa.getIntentName(requestEnvelope);
            const voiceConfig = voiceRoles.getVoiceConfig(voiceRoles.getRoleByTime());

            if (intentName === 'AMAZON.YesIntent') {
                attributes.gameState = gameStates.GAME_STARTED;
                attributes.questionCounter = 0;
                attributes.questionsAsked = [];
                attributes.questionsPerPlayer = {};
                attributes.players.forEach(player => {
                    player.score = 0;
                });
                attributes.currentPlayerIndex = 0;
                attributes.currentPlayerName = attributes.players[0].name;

                try {
                    await db.saveGameSession(requestEnvelope.session.sessionId, {
                        playerCount: attributes.playerCount,
                        players: attributes.players,
                        gameState: attributes.gameState,
                        currentPlayerIndex: 0,
                        createdAt: new Date().toISOString()
                    });
                } catch (error) {
                    console.error('Error al reiniciar el score:', error);
                }
                
                attributesManager.setSessionAttributes(attributes);
                
                return handlerInput.responseBuilder
                    .speak(generateSpeech(`Perfecto, ¡somos la misma pandilla! ¡Vamos a recordar más momentos! ¿Preparados?`, voiceConfig))
                    .reprompt(generateSpeech(`¿Listos para empezar la nueva partida?`, voiceConfig))
                    .getResponse();
            }
            
            if (intentName === 'AMAZON.NoIntent') {
                attributes.gameState = gameStates.REGISTERING_PLAYER_COUNT;
                attributes.players = [];
                attributes.currentPlayer = 1;
                
                attributesManager.setSessionAttributes(attributes);
                
                return handlerInput.responseBuilder
                    .speak(generateSpeech(`Entendido. Vamos a empezar de cero. ¿Cuántos jugadores sois?`, voiceConfig))
                    .reprompt(generateSpeech(`Por favor, dime cuántos jugadores vais a jugar.`, voiceConfig))
                    .getResponse();
            }
            
            return handlerInput.responseBuilder
                .speak(generateSpeech(`No he entendido tu respuesta. ¿Sois los mismos jugadores?`, voiceConfig))
                .reprompt(generateSpeech(`¿Sois los mismos jugadores o hay nuevos participantes?`, voiceConfig))
                .getResponse();
        } catch (error) {
            return ErrorHandler.handleSamePlayersError(handlerInput, error);
        }
    }
};

const SessionEndedRequestHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'SessionEndedRequest';
    },
    async handle(handlerInput) {
        const { requestEnvelope } = handlerInput;
        const { reason } = requestEnvelope.request;
        const { attributesManager } = handlerInput;
        const attributes = attributesManager.getSessionAttributes();
        attributes.gameState = gameStates.ENDED;
        
        console.log(`Sesión terminada. Razón: ${reason}`);
        
        if (reason === 'ERROR' || reason === 'EXCEEDED_MAX_REPROMPTS') {
            try {
                console.log('Intentando guardar estado de sesión antes de terminar...');
                
                if (attributes.players && attributes.players.length > 0) {
                    await db.saveGameSession(requestEnvelope.session.sessionId, {
                        playerCount: attributes.playerCount,
                        currentPlayer: attributes.currentPlayer || 0,
                        gameState: attributes.gameState || gameStates.START,
                        players: attributes.players,
                        createdAt: new Date().toISOString(),
                        endedAt: new Date().toISOString(),
                        endReason: reason
                    });
                    console.log('Estado de sesión guardado antes de terminar');
                }
            } catch (error) {
                console.error('Error al guardar estado de sesión terminada:', error);
            }
        }
        
        return handlerInput.responseBuilder.getResponse();
    }
};

async function handleAnswer(handlerInput, voiceConfig) {
    try {
        const { attributesManager, requestEnvelope } = handlerInput;
        const attributes = attributesManager.getSessionAttributes();
        
        verifySessionAttributes(attributes);
        
        const userAnswer = Alexa.getSlotValue(requestEnvelope, 'answer');
        const possibleAnswers = attributes.currentQuestion.answers || [attributes.currentQuestion.answer];
        const isCorrect = possibleAnswers.some(ans => normalizeString(userAnswer).includes(normalizeString(ans)));
        
        if (isCorrect) {
            attributes.players[attributes.currentPlayerIndex].score += 1;
        
            try {
                await db.saveGameSession(requestEnvelope.session.sessionId, {
                    playerCount: attributes.playerCount,
                    players: attributes.players,
                    currentPlayerIndex: attributes.currentPlayerIndex,
                    gameState: attributes.gameState,
                    createdAt: attributes.createdAt
                });
            } catch (error) {
                console.error('Error al guardar puntuación:', error);
            }
        }
        
        attributes.currentPlayerIndex = (attributes.currentPlayerIndex + 1) % attributes.players.length;
        attributes.currentPlayerName = attributes.players[attributes.currentPlayerIndex].name;
        attributesManager.setSessionAttributes(attributes);
        
        const speakOutput = generateSpeech(`${getRandomFeedback(isCorrect, possibleAnswers[0], voiceConfig)} ¿Listos para la siguiente pregunta?`, voiceConfig);
        
        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(generateSpeech(`¿Queréis seguir con la siguiente pregunta?`, voiceConfig))
            .getResponse();
    } catch (error) {
        return ErrorHandler.handleAnswerError(handlerInput, error);
    }
}

function startFinalTeamQuestion(handlerInput, voiceConfig) {
    try {
        const { attributesManager } = handlerInput;
        const attributes = attributesManager.getSessionAttributes();
        
        verifySessionAttributes(attributes);
        
        if (!questions.FINAL || questions.FINAL.length === 0) {
            throw new Error('No hay preguntas FINAL definidas');
        }
        
        const finalQuestion = questions.FINAL[Math.floor(Math.random() * questions.FINAL.length)];
        
        attributes.currentQuestion = finalQuestion; 
        attributes.isFinalQuestion = true;  
        attributes.gameState = gameStates.FINAL_TEAM_QUESTION;
        attributesManager.setSessionAttributes(attributes);

        aplUtils.showQuestionWithImage(handlerInput, finalQuestion);
        
        const speakOutput = generateSpeech(`¡Pregunta final grupal! Elegid entre todos la respuesta. ${finalQuestion.question} Debeis decirme: "La respuesta es ..."`, voiceConfig);
        
        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(generateSpeech(`¿Cuál es vuestra respuesta como equipo?`, voiceConfig))
            .getResponse();
    } catch (error) {
        return ErrorHandler.handleStartFinalTeamQuestionError(handlerInput, error);
    }
}

const PassQuestionIntentHandler = {
    canHandle(handlerInput) {
        const attributes = handlerInput.attributesManager.getSessionAttributes();
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
               Alexa.getIntentName(handlerInput.requestEnvelope) === 'PassQuestionIntent' &&
               (attributes.gameState === gameStates.INDIVIDUAL_QUESTION || 
                attributes.gameState === gameStates.TEAM_QUESTION ||
                attributes.gameState === gameStates.FINAL_TEAM_QUESTION) &&
               !attributes.awaitingHintResponse;
    },

    handle(handlerInput) {
        const { attributesManager } = handlerInput;
        const attributes = attributesManager.getSessionAttributes();
        const voiceConfig = voiceRoles.getVoiceConfig(voiceRoles.getRoleByTime());

        attributes.awaitingHintResponse = true;
        attributesManager.setSessionAttributes(attributes);

        let speakOutput = generateSpeech(`¿Quieres que te dé una pista para ayudarte?`, voiceConfig);
        
        let repromptMessage;
        
        if (attributes.gameState === gameStates.TEAM_QUESTION) {
            const teammateIndex = (attributes.currentPlayerIndex + 1) % attributes.players.length;
            const teammateName = attributes.players[teammateIndex].name;
            repromptMessage = `¿${attributes.currentPlayerName} y ${teammateName}, queréis una pista para la pregunta en equipo?`;
        } else if (attributes.gameState === gameStates.FINAL_TEAM_QUESTION) {
            repromptMessage = "¿Queréis una pista para la pregunta final? Trabajad juntos.";
        } else {
            repromptMessage = `¿${attributes.currentPlayerName}, quieres una pista?`;
        }

        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(generateSpeech(repromptMessage, voiceConfig))
            .getResponse();
    }
};

const HintOfferResponseHandler = {
    canHandle(handlerInput) {
        const attributes = handlerInput.attributesManager.getSessionAttributes();
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
               (Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.YesIntent' ||
                Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.NoIntent') &&
               attributes.awaitingHintResponse === true;
    },

    async handle(handlerInput) {
        const { attributesManager, requestEnvelope } = handlerInput;
        const attributes = attributesManager.getSessionAttributes();
        const intentName = Alexa.getIntentName(requestEnvelope);
        const voiceConfig = voiceRoles.getVoiceConfig(voiceRoles.getRoleByTime());
        
        attributes.awaitingHintResponse = false;
        attributesManager.setSessionAttributes(attributes);

        if (intentName === 'AMAZON.YesIntent') {
            return HelpIntentHandler.handle(handlerInput);
        } else {
            const possibleAnswers = attributes.currentQuestion.answers || [attributes.currentQuestion.answer];
            const correctAnswer = possibleAnswers[0];
            
            let speakOutput = generateSpeech(`No pasa nada. La respuesta correcta era: ${correctAnswer}.¡A la siguiente!`, voiceConfig);

            if (attributes.gameState === gameStates.INDIVIDUAL_QUESTION) {
                attributes.currentPlayerIndex = (attributes.currentPlayerIndex + 1) % attributes.players.length;
                attributes.currentPlayerName = attributes.players[attributes.currentPlayerIndex].name;
                
                speakOutput += generateSpeech(`¿Listos para la siguiente pregunta?`, voiceConfig);
                
                attributes.expectingContinueConfirmation = true;
                attributesManager.setSessionAttributes(attributes);
                
                return handlerInput.responseBuilder
                    .speak(speakOutput)
                    .reprompt("¿Listos para continuar con la siguiente pregunta?")
                    .getResponse();
                
            } else if (attributes.gameState === gameStates.TEAM_QUESTION) {
                attributes.currentPlayerIndex = (attributes.currentPlayerIndex + 1) % attributes.players.length;
                attributes.currentPlayerName = attributes.players[attributes.currentPlayerIndex].name;
                attributes.gameState = gameStates.INDIVIDUAL_QUESTION; 
                
                speakOutput += generateSpeech(`¿Listos para continuar?`, voiceConfig);
                
                attributes.expectingContinueConfirmation = true;
                attributesManager.setSessionAttributes(attributes);
                
                return handlerInput.responseBuilder
                    .speak(speakOutput)
                    .reprompt(generateSpeech(`¿Listos para continuar?`, voiceConfig))
                    .getResponse();
                
            } else if (attributes.gameState === gameStates.FINAL_TEAM_QUESTION) {
                attributes.gameState = gameStates.SHOW_RANKING;
                attributesManager.setSessionAttributes(attributes);
                
                aplUtils.showRanking(handlerInput, attributes.players);
                
                const speakOutput = generateSpeech(`No pasa nada. La respuesta correcta era: ${correctAnswer}.`, voiceConfig) + 
                                  rankingUtils.getFullRankingAnnouncement(attributes.players);
                
                attributes.gameState = gameStates.ASKING_FOR_NEW_GAME;
                attributesManager.setSessionAttributes(attributes);
                
                return handlerInput.responseBuilder
                    .speak(speakOutput)
                    .reprompt(generateSpeech(`¿Queréis jugar otra partida?`, voiceConfig))
                    .getResponse();
            }
        }
    }
};

module.exports = {
    HelpIntentHandler,
    StartGameIntentHandler,
    IndividualQuestionHandler,
    TeamQuestionHandler,
    FinalTeamQuestionHandler,
    SamePlayersHandler,
    NewGameDecisionHandler,
    SessionEndedRequestHandler,
    PassQuestionIntentHandler,      
    HintOfferResponseHandler
};