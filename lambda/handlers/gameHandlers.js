const Alexa = require('ask-sdk-core');
const questions = require('../game/questions');
const voiceRoles = require('../utils/voiceRoles');
const gameStates = require('../game/gameStates');
const { sendProgressiveResponse } = require('ask-sdk-core');
const db = require('../db/dynamodb');
const aplUtils = require('../utils/aplUtils');

const normalizeString = (str) => str ? str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") : "";
const getRandomFeedback = (isCorrect, correctAnswer, voiceConfig) => {
    if (isCorrect) {
        const positiveFeedback = ["¡Excelente!", "¡Muy bien!", "¡Correcto!", "¡Qué bien se te da esto!", "¡Respuesta correcta!"];
        return positiveFeedback[Math.floor(Math.random() * positiveFeedback.length)];
    }
    return `<voice name="${voiceConfig.voice}"><prosody rate="slow">Casi. La respuesta correcta era ${correctAnswer}</prosody></voice>`;
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
            
            const speakOutput = `<voice name="${voiceConfig.voice}"><prosody rate="slow">` +
                `¡Vamos a empezar! La primera pregunta es para ${attributes.currentPlayerName}. ` +
                `${question.question}</prosody></voice>`;

            aplUtils.showQuestionWithImage(handlerInput, question);
            
            return handlerInput.responseBuilder
                .speak(speakOutput)
                .reprompt(`¿${attributes.currentPlayerName}, cuál es tu respuesta?`)
                .getResponse();
        } catch (error) {
            console.error('Error in StartGameIntentHandler handle:', error);
            return handlerInput.responseBuilder
                .speak('Ha habido un problema al iniciar el juego. Por favor, inténtalo de nuevo.')
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
                return await handleAnswer(handlerInput, voiceConfig);
            }
            
            if (intentName === 'AMAZON.YesIntent') {
                return await askNextQuestion(handlerInput, voiceConfig);
            }
            
            return handlerInput.responseBuilder
                .speak("Perdona, no te he entendido bien. ¿Puedes repetirlo? Debes decir creo que es")
                .reprompt("¿Cuál es tu respuesta?")
                .getResponse();
        } catch (error) {
            console.error('Error in IndividualQuestionHandler handle:', error);
            
            const attributes = handlerInput.attributesManager.getSessionAttributes();
            const voiceConfig = voiceRoles.getVoiceConfig(voiceRoles.getRoleByTime());
            
            let speakOutput = `<voice name="${voiceConfig.voice}"><prosody rate="slow">` +
                             `Ha habido un error al procesar tu respuesta. Vamos a intentarlo de nuevo. `;
            
            if (attributes.currentQuestion) {
                speakOutput += `La pregunta era: ${attributes.currentQuestion.question}`;
            } else {
                speakOutput += `Por favor, responde a la pregunta.`;
            }
            
            speakOutput += `</prosody></voice>`;
            
            return handlerInput.responseBuilder
                .speak(speakOutput)
                .reprompt("¿Cuál es tu respuesta?")
                .getResponse();
        }
    }
};

const TeamQuestionHandler = {
    canHandle(handlerInput) {
        try {
            const attributes = handlerInput.attributesManager.getSessionAttributes();
            const intentName = Alexa.getIntentName(handlerInput.requestEnvelope);
            
            console.log('[TeamQuestionHandler] Verificando canHandle. GameState:', attributes.gameState, 'Intent:', intentName);
            
            return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
                   attributes.gameState === gameStates.TEAM_QUESTION &&
                   intentName !== 'HelpIntent'; 
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
                
                const speakOutput = `<voice name="${voiceConfig.voice}"><prosody rate="slow">` +
                    `${getRandomFeedback(isCorrect, possibleAnswers[0], voiceConfig)} ` +
                    `¿Listos para continuar?</prosody></voice>`;
                
                return handlerInput.responseBuilder
                    .speak(speakOutput)
                    .reprompt("¿Listos para la siguiente pregunta?")
                    .getResponse();
            }
            
            console.log('[TeamQuestionHandler] Intent no manejado:', intentName);
            const speakOutput = `<voice name="${voiceConfig.voice}"><prosody rate="slow">` +
                `Perdona, no te he entendido. ¿Podéis decirme vuestra respuesta? ` +
                `La pregunta es: ${attributes.currentQuestion.question}</prosody></voice>`;
            
            return handlerInput.responseBuilder
                .speak(speakOutput)
                .reprompt("¿Cuál es vuestra respuesta en equipo?")
                .getResponse();
                
        } catch (error) {
            console.error('[TeamQuestionHandler] Error en handle:', error);
            const voiceConfig = voiceRoles.getVoiceConfig(voiceRoles.getRoleByTime());
            return handlerInput.responseBuilder
                .speak(`<voice name="${voiceConfig.voice}"><prosody rate="slow">Ha habido un error en la pregunta grupal. Volviendo a preguntas individuales.</prosody></voice>`)
                .getResponse();
        }
    }
};

function startTeamQuestion(handlerInput, voiceConfig) {
    try {
        const { attributesManager } = handlerInput;
        const attributes = attributesManager.getSessionAttributes();
        
        verifySessionAttributes(attributes);
        
        attributes.gameState = gameStates.TEAM_QUESTION;
        
        const questionsLeft = questions[attributes.currentCategory].filter(q => 
            !attributes.questionsAsked.includes(q.question)
        );
        
        if (questionsLeft.length === 0) {
            return handleGameEnd(handlerInput);
        }
        
        const question = questionsLeft[0];
        
        attributes.currentQuestion = question;
        attributes.questionsAsked.push(question.question);
        attributesManager.setSessionAttributes(attributes);
        
        const teammateIndex = (attributes.currentPlayerIndex + 1) % attributes.players.length;
        const teammateName = attributes.players[teammateIndex].name;
        const currentPlayerName = attributes.players[attributes.currentPlayerIndex].name;
        
        aplUtils.showQuestionWithImage(handlerInput, question);

        const speakOutput = `<voice name="${voiceConfig.voice}"><prosody rate="slow">` +
            `¡Pregunta en equipo! ${currentPlayerName}, trabaja junto con ${teammateName}. ` +
            `La pregunta es: ${question.question}</prosody></voice>`;
        
        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt("¿Cuál es vuestra respuesta en equipo? Si necesitas ayuda dime necesito ayuda")
            .getResponse();
    } catch (error) {
        console.error('Error in startTeamQuestion:', error);
        const voiceConfig = voiceRoles.getVoiceConfig(voiceRoles.getRoleByTime());
        return handlerInput.responseBuilder
            .speak(`<voice name="${voiceConfig.voice}"><prosody rate="slow">Ha habido un problema al iniciar la pregunta grupal. Continuamos con preguntas individuales.</prosody></voice>`)
            .getResponse();
    }
}

const FinalTeamQuestionHandler = {
    canHandle(handlerInput) {
        const attributes = handlerInput.attributesManager.getSessionAttributes();
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
               attributes.gameState === gameStates.FINAL_TEAM_QUESTION;
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

                const feedback = isCorrect ? 
                    `<voice name="${voiceConfig.voice}"><prosody rate="slow">¡Respuesta correcta! Todos ganáis puntos extra.</prosody></voice>` : 
                    getRandomFeedback(false, possibleAnswers[0], voiceConfig);

                const sortedPlayers = [...attributes.players].sort((a, b) => b.score - a.score);
                let rankingMessage = "";
                
                if (sortedPlayers.length === 1) {
                    rankingMessage += `¡${sortedPlayers[0].name}, has conseguido ${sortedPlayers[0].score} puntos! `;
                } else {
                    const topScore = sortedPlayers[0].score;
                    const topPlayers = sortedPlayers.filter(p => p.score === topScore);

                    if (topPlayers.length > 1) {
                        const names = topPlayers.map(p => p.name).join(' y ');
                        rankingMessage += `<voice name="${voiceConfig.voice}"><prosody rate="slow">¡${names} habéis empatado en primer lugar con ${topScore} puntos! </prosody></voice>`;
                    } else {
                        rankingMessage += `<voice name="${voiceConfig.voice}"><prosody rate="slow">¡${topPlayers[0].name} lidera con ${topScore} puntos! </prosody></voice>`;
                    }

                    const otherPlayers = sortedPlayers.filter(p => p.score < topScore);
                    if (otherPlayers.length > 0) {
                        rankingMessage += `<voice name="${voiceConfig.voice}"><prosody rate="slow">Aquí están los demás resultados: </prosody></voice>`;
                        rankingMessage += otherPlayers.map(p => `${p.name} con ${p.score} puntos`).join(', ') + '. ';
                    }
                }

                const speakOutput = feedback + `<voice name="${voiceConfig.voice}"><prosody rate="slow">Vamos a ver los recuerdos que habéis evocado hoy. </prosody></voice>` + rankingMessage + `<voice name="${voiceConfig.voice}"><prosody rate="slow">¿Queréis jugar otra partida?</prosody></voice>`;

                attributes.gameState = gameStates.ASKING_FOR_NEW_GAME;
                attributesManager.setSessionAttributes(attributes);

                return handlerInput.responseBuilder
                    .speak(speakOutput)
                    .reprompt("¿Queréis jugar otra partida?")
                    .getResponse();
            }
            
            return handlerInput.responseBuilder
                .speak("Por favor, decidme vuestra respuesta conjunta.")
                .reprompt("¿Cuál es vuestra respuesta como equipo?")
                .getResponse();
                
        } catch (error) {
            console.error('Error en FinalTeamQuestionHandler:', error);

            attributes.gameState = gameStates.SHOW_RANKING;
            attributesManager.setSessionAttributes(attributes);
            
            return handlerInput.responseBuilder
                .speak("Vamos a ver los resultados.")
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
          .speak("Lo siento, no tengo pistas para esta pregunta. Intenta adivinarlo lo mejor que puedas.")
          .reprompt(`¿${attributes.currentPlayerName}, cuál es tu respuesta?`)
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
          .speak("¡Oh vaya! parece que te he dado todas las pistas que tengo para esta pregunta. ¡Intenta adivinarlo!")
          .reprompt(`¿${attributes.currentPlayerName}, cuál es tu respuesta?`)
          .getResponse();
      }
  
      const hint = currentQuestion.hints[hintsUsedCount];
      attributes.hintsUsed[currentQuestion.question] = hintsUsedCount + 1;
      attributesManager.setSessionAttributes(attributes);
  
      let speakOutput = `<voice name="${voiceConfig.voice}"><prosody rate="slow">Aquí tienes una pista: ${hint}.</prosody></voice>`;
      
      if (hintsUsedCount + 1 < currentQuestion.hints.length) {
        speakOutput += `<voice name="${voiceConfig.voice}"><prosody rate="slow">¡Si necesitas más ayuda, no dudes en pedirmela!. </prosody></voice>`;
      }
      
      let repromptMessage;
      if (attributes.gameState === gameStates.TEAM_QUESTION) {
        const teammateIndex = (attributes.currentPlayerIndex + 1) % attributes.players.length;
        const teammateName = attributes.players[teammateIndex].name;
        speakOutput += `<voice name="${voiceConfig.voice}"><prosody rate="slow">La pregunta era: ${currentQuestion.question}. Teneis que trabajar todos juntos ${attributes.currentPlayerName} y ${teammateName} para encontrar la respuesta.</prosody></voice>`;
        repromptMessage = "¿Cuál es vuestra respuesta en equipo?";
      } else if (attributes.gameState === gameStates.FINAL_TEAM_QUESTION) {
        speakOutput += `<voice name="${voiceConfig.voice}"><prosody rate="slow">La pregunta era: ${currentQuestion.question}. Trabajad todos juntos para encontrar la respuesta final.</prosody></voice>`;
        repromptMessage = "¿Cuál es vuestra respuesta como equipo?";
      } else {
        speakOutput += `<voice name="${voiceConfig.voice}"><prosody rate="slow">La pregunta era: ${currentQuestion.question}. ¿Cuál crees que es la respuesta?</prosody></voice>`;
        repromptMessage = `¿${attributes.currentPlayerName}, cuál es tu respuesta?`;
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
                    .speak(`<voice name="${voiceConfig.voice}"><prosody rate="slow">${randomMessage}</prosody></voice>`)
                    .withShouldEndSession(true)
                    .getResponse();
            }
            
            if (intentName === 'AMAZON.YesIntent') {
                attributes.gameState = gameStates.ASKING_ABOUT_PLAYERS;
                attributesManager.setSessionAttributes(attributes);
                
                return handlerInput.responseBuilder
                    .speak(`<voice name="${voiceConfig.voice}"><prosody rate="slow">¡Genial! ¿Sois los mismos jugadores?</prosody></voice>`)
                    .reprompt("¿Sois los mismos jugadores?")
                    .getResponse();
            }
            
            return handlerInput.responseBuilder
                .speak("No he entendido tu respuesta. ¿Queréis jugar otra vez?")
                .reprompt("¿Queréis jugar otra vez?")
                .getResponse();
        } catch (error) {
            console.error('Error in NewGameDecisionHandler:', error);
            return handlerInput.responseBuilder
                .speak('Vamos a empezar una nueva partida. ¿Cuántos jugadores sois?')
                .reprompt("Por favor, dime cuántos jugadores van a jugar hoy.")
                .getResponse();
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
                    .speak(`<voice name="${voiceConfig.voice}"><prosody rate="slow">Perfecto, somos la misma pandilla. ¡Vamos a recordar más momentos! ¿Preparados?</prosody></voice>`)
                    .reprompt("¿Listos para empezar la nueva partida?")
                    .getResponse();
            }
            
            if (intentName === 'AMAZON.NoIntent') {
                attributes.gameState = gameStates.REGISTERING_PLAYER_COUNT;
                attributes.players = [];
                attributes.currentPlayer = 1;
                
                attributesManager.setSessionAttributes(attributes);
                
                return handlerInput.responseBuilder
                    .speak(`<voice name="${voiceConfig.voice}"><prosody rate="slow">Entendido. Vamos a empezar de cero. ¿Cuántos jugadores sois?</prosody></voice>`)
                    .reprompt("Por favor, dime cuántos jugadores vais a jugar.")
                    .getResponse();
            }
            
            return handlerInput.responseBuilder
                .speak("No he entendido tu respuesta. ¿Sois los mismos jugadores?")
                .reprompt("¿Son los mismos jugadores o hay nuevos participantes?")
                .getResponse();
        } catch (error) {
            console.error('Error in SamePlayersHandler:', error);
            return handlerInput.responseBuilder
                .speak('Vamos a empezar una nueva partida. ¿Cuántos jugadores sois hoy?')
                .reprompt("Por favor, dime cuántos jugadores van a jugar hoy.")
                .getResponse();
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
        
        const speakOutput = `<voice name="${voiceConfig.voice}"><prosody rate="slow">` +
            `${getRandomFeedback(isCorrect, possibleAnswers[0], voiceConfig)} ` +
            `¿Listos para la siguiente pregunta?</prosody></voice>`;
        
        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt("¿Queréis seguir con la siguiente pregunta?")
            .getResponse();
    } catch (error) {
        console.error('Error in handleAnswer:', error);
        
        const attributes = handlerInput.attributesManager.getSessionAttributes();
        const voiceConfig = voiceRoles.getVoiceConfig(voiceRoles.getRoleByTime());
        
        let speakOutput = `<voice name="${voiceConfig.voice}"><prosody rate="slow">` +
                         `Ha habido un error al procesar tu respuesta. Vamos a intentarlo de nuevo. `;
        
        if (attributes.currentQuestion) {
            speakOutput += `La pregunta era: ${attributes.currentQuestion.question}`;
        } else {
            speakOutput += `Por favor, responde a la pregunta.`;
        }
        
        speakOutput += `</prosody></voice>`;
        
        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt("¿Cuál es tu respuesta?")
            .getResponse();
    }
}

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
        
        let questionsLeft = questions[attributes.currentCategory].filter(q => 
            !attributes.questionsAsked.includes(q.question)
        );
        
        if (questionsLeft.length === 0) {
            const remainingCategories = Object.keys(questions).filter(cat => cat !== attributes.currentCategory);
            
            if (remainingCategories.length === 0) {
                return startFinalTeamQuestion(handlerInput, voiceConfig);
            }
            
            attributes.currentCategory = remainingCategories[Math.floor(Math.random() * remainingCategories.length)];
            attributes.questionsAsked = [];
            questionsLeft = questions[attributes.currentCategory];
        }
        
        attributes.questionCounter = (attributes.questionCounter || 0) + 1;
        
        if (attributes.questionCounter % 3 === 0 && attributes.players.length > 1) {
            return startTeamQuestion(handlerInput, voiceConfig);
        }
        
        const question = questionsLeft[0];
        attributes.currentQuestion = question;
        attributes.questionsAsked.push(question.question);
        attributes.gameState = gameStates.INDIVIDUAL_QUESTION;
        
        attributesManager.setSessionAttributes(attributes);
        
        const speakOutput = `<voice name="${voiceConfig.voice}"><prosody rate="slow">La siguiente pregunta es para ${attributes.currentPlayerName}. ${question.question}</prosody></voice>`;
        
        aplUtils.showQuestionWithImage(handlerInput, question);

        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(`¿${attributes.currentPlayerName}, cuál es tu respuesta?`)
            .getResponse();
    } catch (error) {
        console.error('Error in askNextQuestion:', error);
        return handlerInput.responseBuilder
            .speak('Ha habido un problema al preparar la siguiente pregunta. Volviendo al inicio.')
            .getResponse();
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
        
        const speakOutput = `<voice name="${voiceConfig.voice}"><prosody rate="slow">¡Pregunta final grupal! ${finalQuestion.question} Trabajad juntos para dar la mejor respuesta.</prosody></voice>`;
        
        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt("¿Cuál es vuestra respuesta como equipo?")
            .getResponse();
    } catch (error) {
        console.error('Error in startFinalTeamQuestion:', error);
        return handlerInput.responseBuilder
            .speak('Vamos a ver los recuerdos que habéis evocado hoy.')
            .getResponse();
    }
}

module.exports = {
    HelpIntentHandler,
    StartGameIntentHandler,
    IndividualQuestionHandler,
    TeamQuestionHandler,
    FinalTeamQuestionHandler,
    SamePlayersHandler,
    NewGameDecisionHandler,
    SessionEndedRequestHandler
};