const Alexa = require('ask-sdk-core');
const questions = require('../game/questions');
const voiceRoles = require('../utils/voiceRoles');
const gameStates = require('../game/gameStates');
const { sendProgressiveResponse } = require('ask-sdk-core');
const db = require('../db/dynamodb');

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
                return await handleAnswer(handlerInput, voiceConfig);
            }
            
            if (intentName === 'AMAZON.YesIntent') {
                return await askNextQuestion(handlerInput, voiceConfig);
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
            const intentName = Alexa.getIntentName(requestEnvelope);
            const voiceConfig = voiceRoles.getVoiceConfig(voiceRoles.getRoleByTime());
            
            verifySessionAttributes(attributes);

            if (intentName === 'AnswerIntent') {
                const userAnswer = Alexa.getSlotValue(requestEnvelope, 'answer');
                const possibleAnswers = attributes.finalQuestion.answers || [attributes.finalQuestion.answer];
                const isCorrect = possibleAnswers.some(ans => normalizeString(userAnswer).includes(normalizeString(ans)));
                
                // Todos los jugadores ganan puntos en la pregunta final
                if (isCorrect) {
                    attributes.players.forEach(player => {
                        player.score += 2; // Doble puntos para la pregunta final
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

                // Preparar para mostrar ranking
                attributes.gameState = gameStates.SHOW_RANKING;
                attributesManager.setSessionAttributes(attributes);

                const feedback = isCorrect 
                    ? "¡Respuesta correcta! Todos ganáis puntos extra. " 
                    : `Casi. La respuesta correcta era ${possibleAnswers[0]}. `;
                
                return handlerInput.responseBuilder
                    .speak(feedback + "Vamos a ver los recuerdos que habéis evocado hoy.")
                    .withShouldEndSession(false)
                    .getResponse();
            }
            
            return handlerInput.responseBuilder
                .speak("Por favor, decidme vuestra respuesta conjunta.")
                .reprompt("¿Cuál es vuestra respuesta como equipo?")
                .getResponse();
        } catch (error) {
            console.error('Error in FinalTeamQuestionHandler:', error);
            return handlerInput.responseBuilder
                .speak('Ocurrió un error en la pregunta final. Vamos a ver los resultados.')
                .getResponse();
        }
    }
};

const ShowRankingHandler = {
    canHandle(handlerInput) {
        const attributes = handlerInput.attributesManager.getSessionAttributes();
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
               attributes.gameState === gameStates.SHOW_RANKING;
    },

    async handle(handlerInput) {
        try {
            const { attributesManager } = handlerInput;
            const attributes = attributesManager.getSessionAttributes();
            const voiceConfig = voiceRoles.getVoiceConfig(voiceRoles.getRoleByTime());

            // Mostrar ranking de forma positiva
            const sortedPlayers = [...attributes.players].sort((a, b) => b.score - a.score);
            
            let rankingMessage = `<voice name="${voiceConfig.voice}">¡Todos habéis jugado genial! `;
            
            if (sortedPlayers.length === 1) {
                rankingMessage += `¡${sortedPlayers[0].name}, has conseguido ${sortedPlayers[0].score} puntos! `;
            } else {
                // Mensaje especial para empates
                const topScore = sortedPlayers[0].score;
                const topPlayers = sortedPlayers.filter(p => p.score === topScore);
                
                if (topPlayers.length > 1) {
                    const names = topPlayers.map(p => p.name).join(' y ');
                    rankingMessage += `¡${names} habéis empatado en primer lugar con ${topScore} puntos! `;
                } else {
                    rankingMessage += `¡${sortedPlayers[0].name} lidera con ${sortedPlayers[0].score} puntos! `;
                }
                
                // Mencionar a todos los jugadores positivamente
                rankingMessage += `Pero todos lo habéis hecho fenomenal: `;
                rankingMessage += sortedPlayers.map(p => `${p.name} con ${p.score} puntos`).join(', ') + '. ';
            }
            
            rankingMessage += `¿Queréis jugar otra partida?</voice>`;
            
            // Actualizar estado para manejar la respuesta
            attributes.gameState = gameStates.ASKING_FOR_NEW_GAME;
            attributesManager.setSessionAttributes(attributes);
            
            return handlerInput.responseBuilder
                .speak(rankingMessage)
                .reprompt("¿Queréis jugar otra partida?")
                .getResponse();
        } catch (error) {
            console.error('Error in ShowRankingHandler:', error);
            return handlerInput.responseBuilder
                .speak('Gracias por jugar a Regreso al Pasado. ¡Hasta la próxima!')
                .withShouldEndSession(true)
                .getResponse();
        }
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
                // Despedida simpática
                const farewellMessages = [
                    "¡Ha sido un placer jugar con vosotros! Espero que hayáis recordado buenos momentos.",
                    "¡Hasta la próxima! Seguro que la próxima vez recordáis aún más canciones.",
                    "¡Gracias por jugar! No olvidéis seguir creando buenos recuerdos.",
                    "¡Adiós! Espero volver a veros pronto para más diversión musical."
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
                    .speak(`<voice name="${voiceConfig.voice}">${randomMessage}</voice>`)
                    .withShouldEndSession(true)
                    .getResponse();
            }
            
            if (intentName === 'AMAZON.YesIntent') {
                // Preguntar si son los mismos jugadores
                attributes.gameState = gameStates.ASKING_ABOUT_PLAYERS;
                attributesManager.setSessionAttributes(attributes);
                
                return handlerInput.responseBuilder
                    .speak(`<voice name="${voiceConfig.voice}">¡Genial! ¿Sois los mismos jugadores?</voice>`)
                    .reprompt("¿Son los mismos jugadores?")
                    .getResponse();
            }
            
            return handlerInput.responseBuilder
                .speak("No he entendido tu respuesta. ¿Queréis jugar otra vez?")
                .reprompt("¿Queréis jugar otra vez?")
                .getResponse();
        } catch (error) {
            console.error('Error in NewGameDecisionHandler:', error);
            return handlerInput.responseBuilder
                .speak('Vamos a empezar una nueva partida. ¿Cuántos jugadores sois hoy?')
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
                // Reiniciar juego con mismos jugadores
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
                    console.error('Error al reiniciar puntajes:', error);
                }
                
                attributesManager.setSessionAttributes(attributes);
                
                return handlerInput.responseBuilder
                    .speak(`<voice name="${voiceConfig.voice}">Perfecto, misma pandilla. ¡Vamos a recordar más momentos! ¿Preparados?</voice>`)
                    .reprompt("¿Listos para empezar la nueva partida?")
                    .getResponse();
            }
            
            if (intentName === 'AMAZON.NoIntent') {
                // Empezar desde cero con nuevos jugadores
                attributes.gameState = gameStates.REGISTERING_PLAYER_COUNT;
                attributes.players = [];
                attributes.currentPlayer = 1;
                
                attributesManager.setSessionAttributes(attributes);
                
                return handlerInput.responseBuilder
                    .speak(`<voice name="${voiceConfig.voice}">Entendido. Vamos a empezar de cero. ¿Cuántos jugadores sois?</voice>`)
                    .reprompt("Por favor, dime cuántos jugadores van a jugar hoy.")
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
        
        // Guardar estado actual si la sesión termina inesperadamente
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
        
        // No se puede enviar respuesta con SessionEndedRequest
        return handlerInput.responseBuilder.getResponse();
    }
};


// Helper functions implementations
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

async function askNextQuestion(handlerInput, voiceConfig) {
    try {
        const { attributesManager } = handlerInput;
        const attributes = attributesManager.getSessionAttributes();
        
        verifySessionAttributes(attributes);
        
        // Contador de preguntas por jugador
        if (!attributes.questionsPerPlayer) {
            attributes.questionsPerPlayer = {};
            attributes.players.forEach(player => {
                attributes.questionsPerPlayer[player.name] = 0;
            });
        }
        
        // Incrementar contador para el jugador actual
        attributes.questionsPerPlayer[attributes.currentPlayerName] = 
            (attributes.questionsPerPlayer[attributes.currentPlayerName] || 0) + 1;
        
        // Verificar si es momento de la pregunta final
        const minQuestions = Math.min(...Object.values(attributes.questionsPerPlayer));
        if (minQuestions >= 2) {
            return startFinalTeamQuestion(handlerInput, voiceConfig);
        }
        
        // Resto de la lógica normal para preguntas individuales/equipo
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

function startFinalTeamQuestion(handlerInput, voiceConfig) {
    try {
        const { attributesManager } = handlerInput;
        const attributes = attributesManager.getSessionAttributes();
        
        verifySessionAttributes(attributes);
        
        // Seleccionar pregunta final especial
        const finalQuestions = questions.FINAL || [
            {
                question: "Como equipo, ¿cuál es el recuerdo más emotivo que habéis compartido hoy?",
                answers: ["recuerdo emotivo", "momento especial", "buen recuerdo"]
            }
        ];
        
        const finalQuestion = finalQuestions[Math.floor(Math.random() * finalQuestions.length)];
        attributes.finalQuestion = finalQuestion;
        attributes.gameState = gameStates.FINAL_TEAM_QUESTION;
        attributesManager.setSessionAttributes(attributes);
        
        const speakOutput = `<voice name="${voiceConfig.voice}">¡Pregunta final grupal! ${finalQuestion.question} Trabajad juntos para dar la mejor respuesta.</voice>`;
        
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
    StartGameIntentHandler,
    IndividualQuestionHandler,
    TeamQuestionHandler,
    FinalTeamQuestionHandler,
    ShowRankingHandler,
    SamePlayersHandler,
    NewGameDecisionHandler,
    SessionEndedRequestHandler
};
