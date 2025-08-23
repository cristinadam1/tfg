const Alexa = require('ask-sdk-core');
const db = require('../db/dynamodb');
const gameStates = require('../game/gameStates');
const voiceRoles = require('../utils/voiceRoles');
const aplUtils = require('../utils/aplUtils');


const generateSpeech = (text, includeGreeting = false) => {
    const voiceConfig = voiceRoles.getVoiceConfig(voiceRoles.getRoleByTime());
    
    if (includeGreeting) {
        return `<voice name="${voiceConfig.voice}">${voiceConfig.greeting}<prosody rate="slow">${text}</prosody></voice>`;
    } else {
        return `<voice name="${voiceConfig.voice}"><prosody rate="slow">${text}</prosody></voice>`;
    }
};

const LaunchRequestHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'LaunchRequest';
    },
    handle(handlerInput) {
        const attributes = handlerInput.attributesManager.getSessionAttributes();
        
        attributes.gameState = gameStates.REGISTERING_PLAYER_COUNT;
        attributes.players = [];
        attributes.currentPlayer = 1;
        attributes.roundNumber = 1;
        attributes.questionsPerRound = 2; 
        attributes.currentRoundType = 'individual';
        
        handlerInput.attributesManager.setSessionAttributes(attributes);

        const speakOutput = generateSpeech('¿Cuántos jugadores sois hoy?', true);

        aplUtils.showStaticImage(handlerInput, "¡Bienvenidos/as a Regreso al Pasado!");

        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(speakOutput)
            .getResponse();
    }
};

const CancelAndStopIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && (Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.CancelIntent'
                || Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.StopIntent');
    },
    handle(handlerInput) {
        const speakOutput = generateSpeech('¡Hasta luego!');
        return handlerInput.responseBuilder
            .speak(speakOutput)
            .getResponse();
    }
};

const ErrorHandler = {
    canHandle() {
        return true;
    },
    handle(handlerInput, error) {
        console.error('Error handled:', error);
        const speakOutput = generateSpeech('Creo que no te he entendido. Por favor inténtalo de nuevo.');
        const repromptOutput = generateSpeech('Perdona, sigo sin entenderte. Pídele ayuda a alguno de mis creadores');
        
        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(repromptOutput)
            .getResponse();
    }
};

const FallbackIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.FallbackIntent';
    },
    handle(handlerInput) {
        const speakOutput = generateSpeech('Perdona, ¿podrías repetírmelo?');

        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(speakOutput)
            .getResponse();
    }
};

const GetFavoriteSongIntentHandler = {
    canHandle(handlerInput) {
        const attributes = handlerInput.attributesManager.getSessionAttributes();
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
               Alexa.getIntentName(handlerInput.requestEnvelope) === 'GetFavoriteSongIntent' &&
               attributes.gameState === gameStates.ASKING_FAVORITE_SONGS;
    },
  
    async handle(handlerInput) {
        const songName = Alexa.getSlotValue(handlerInput.requestEnvelope, 'song');
        const { attributesManager, requestEnvelope } = handlerInput;
        const attributes = attributesManager.getSessionAttributes();
        const voiceConfig = voiceRoles.getVoiceConfig(voiceRoles.getRoleByTime());
        
        if (!songName) {
            const currentPlayerName = attributes.players[attributes.currentPlayer].name;
            const speakOutput = generateSpeech('No he entendido el nombre de la canción. ¿Puedes repetirlo?');
            const repromptOutput = generateSpeech(`${currentPlayerName}, ¿cuál es tu canción favorita?`);
            
            return handlerInput.responseBuilder
                .speak(speakOutput)
                .reprompt(repromptOutput)
                .getResponse();
        }
        
        attributes.players[attributes.currentPlayer].favoriteSong = songName;
        
        try {
            const success = await db.saveGameSession(
                requestEnvelope.session.sessionId, 
                {
                    playerCount: attributes.playerCount,
                    currentPlayer: attributes.currentPlayer,
                    gameState: attributes.gameState,
                    players: attributes.players,
                    createdAt: attributes.createdAt || new Date().toISOString()
                }
            );
            
            if (!success) {
                console.error('Error al guardar canción favorita en DynamoDB');
            }
        } catch (error) {
            console.error('Error en saveGameSession:', error);
        }
        
        const url = await db.getSongUrl(songName);
        
        const playersWithoutSong = attributes.players
            .map((player, index) => ({...player, index}))
            .filter(player => !player.favoriteSong);
        
        if (playersWithoutSong.length > 0) {
            const nextPlayer = playersWithoutSong[Math.floor(Math.random() * playersWithoutSong.length)];
            attributes.currentPlayer = nextPlayer.index;
            handlerInput.attributesManager.setSessionAttributes(attributes);
            
            try {
                await db.saveGameSession(
                    requestEnvelope.session.sessionId,
                    {
                        playerCount: attributes.playerCount,
                        currentPlayer: attributes.currentPlayer,
                        players: attributes.players,
                        gameState: attributes.gameState,
                        createdAt: attributes.createdAt
                    }
                );
            } catch (error) {
                console.error('Error al actualizar jugador actual:', error);
            }
            
            let speakOutput;
            if (url) {
                speakOutput = `<speak>${generateSpeech('¡Buena elección! Aquí tienes tu canción:')} <audio src="${url}"/> <break time="2s"/> ${generateSpeech(`${nextPlayer.name}, ¿y cuál es tu canción favorita?`)}</speak>`;
            } else {
                speakOutput = generateSpeech(`No conozco la canción ${songName} pero seguro que me encantaría. ${nextPlayer.name}, ¿y cuál es tu canción favorita?`);
            }
            
            const repromptOutput = generateSpeech(`${nextPlayer.name}, ¿cuál es tu canción favorita?`);
            
            return handlerInput.responseBuilder
                .speak(speakOutput)
                .reprompt(repromptOutput)
                .getResponse();
                
        } else {
            attributes.gameState = gameStates.GAME_STARTED;
            handlerInput.attributesManager.setSessionAttributes(attributes);
            
            try {
                await db.saveGameSession(
                    requestEnvelope.session.sessionId,
                    {
                        playerCount: attributes.playerCount,
                        gameState: attributes.gameState,
                        players: attributes.players,
                        currentPlayer: attributes.currentPlayer,
                        createdAt: attributes.createdAt
                    }
                );
            } catch (error) {
                console.error('Error al guardar estado final:', error);
            }
            
            let speakOutput;
            if (url) {
                speakOutput = `<speak>${generateSpeech('¡Buena elección! Aquí tienes tu canción:')} <audio src="${url}"/> <break time="2s"/> ${generateSpeech('¡Y con esto ya tenemos todas vuestras canciones favoritas! ¿Listos para empezar el juego?')}</speak>`;
            } else {
                speakOutput = generateSpeech(`No conozco la canción ${songName}, pero seguro que está muy chula. ¡Y con esto ya tenemos todas vuestras canciones favoritas! ¿Listos para empezar el juego?`);
            }
            
            const repromptOutput = generateSpeech('¿Queréis empezar el juego?');
            
            return handlerInput.responseBuilder
                .speak(speakOutput)
                .reprompt(repromptOutput)
                .getResponse();
        }
    }
};

const PlayerCountIntentHandler = {
    canHandle(handlerInput) {
        console.log('Verificando si PlayerCountIntentHandler puede manejar la solicitud');
        try {
          const requestType = Alexa.getRequestType(handlerInput.requestEnvelope);
          
          if (requestType !== 'IntentRequest') {
            return false;
          }
          
          const attributes = handlerInput.attributesManager.getSessionAttributes();
          const intentName = Alexa.getIntentName(handlerInput.requestEnvelope);
          
          const canHandle = intentName === 'PlayerCountIntent' &&
                          (!attributes.gameState || 
                           attributes.gameState === gameStates.START || 
                           attributes.gameState === gameStates.REGISTERING_PLAYER_COUNT);
          
          console.log(`PlayerCountIntentHandler canHandle: ${canHandle}`);
          return canHandle;
        } catch (error) {
          console.error('Error en canHandle:', error);
          return false;
        }
      },
  
    async handle(handlerInput) {
      console.log('PlayerCountIntentHandler handle iniciado');
      try {
        const playerCount = parseInt(Alexa.getSlotValue(handlerInput.requestEnvelope, 'count'));
        const { attributesManager, requestEnvelope } = handlerInput;
        const attributes = attributesManager.getSessionAttributes();
        
        console.log(`Número de jugadores recibido: ${playerCount}`);
        
        if (isNaN(playerCount)) {
          console.error('Número de jugadores no es un número válido');
          const speakOutput = generateSpeech('No entendí cuántos jugadores sois. ¿Podrías repetirlo?');
          const repromptOutput = generateSpeech('Por favor, dime cuántos jugadores sois hoy.');
          
          return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(repromptOutput)
            .getResponse();
        }
        
        if (playerCount < 1 || playerCount > 8) {
          console.error(`Número de jugadores fuera de rango: ${playerCount}`);
          const speakOutput = generateSpeech('Por favor, dime un número entre 1 y 8 jugadores.');
          const repromptOutput = generateSpeech('¿Cuántos jugadores van a jugar hoy?');
          
          return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(repromptOutput)
            .getResponse();
        }
        
        attributes.playerCount = playerCount;
        attributes.currentPlayer = 1;
        attributes.players = [];
        attributes.gameState = gameStates.REGISTERING_PLAYER_NAMES;
        attributesManager.setSessionAttributes(attributes);
        
        try {
            await db.saveGameSession(requestEnvelope.session.sessionId, {
                playerCount: attributes.playerCount,
                currentPlayer: 1,
                players: [],
                gameState: gameStates.REGISTERING_PLAYER_NAMES,
                createdAt: new Date().toISOString()
            });
        } catch (error) {
            console.error('Error al guardar inicialmente:', error);
        }

        console.log('Atributos actualizados:', attributes);
        
        const speakOutput = generateSpeech(`Perfecto, sois ${playerCount} jugadores, ¡Nos lo vamos a pasar genial!. Jugador 1, ¿cómo te llamas?`);
        const repromptOutput = generateSpeech('Jugador 1, por favor dime tu nombre.');
        
        return handlerInput.responseBuilder
          .speak(speakOutput)
          .reprompt(repromptOutput)
          .getResponse();
      } catch (error) {
        console.error('Error en handle:', error);
        const speakOutput = generateSpeech('Ha habido un error al procesar tu respuesta.');
        const repromptOutput = generateSpeech('¿Podrías repetir cuántos jugadores sois?');
        
        return handlerInput.responseBuilder
          .speak(speakOutput)
          .reprompt(repromptOutput)
          .getResponse();
      }
    }
};

const SessionEndedRequestHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'SessionEndedRequest';
    },
    handle(handlerInput) {
        const { reason } = handlerInput.requestEnvelope.request;
        console.log(`Sesión terminada. Razón: ${reason}`);

        return handlerInput.responseBuilder.getResponse();
    }
};

const GetPlayerNameIntentHandler = {
    canHandle(handlerInput) {
        const attributes = handlerInput.attributesManager.getSessionAttributes();
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
               Alexa.getIntentName(handlerInput.requestEnvelope) === 'GetPlayerNameIntent' &&
               attributes.gameState === gameStates.REGISTERING_PLAYER_NAMES;
    },

    async handle(handlerInput) {
        const playerName = Alexa.getSlotValue(handlerInput.requestEnvelope, 'nombre');
        const { attributesManager, requestEnvelope } = handlerInput;
        const attributes = attributesManager.getSessionAttributes();
        
        if (!playerName || playerName.trim().length === 0) {
            const repromptMessage = generateSpeech(`Jugador ${attributes.currentPlayer}, ¿cómo te llamas?`);
            const speakOutput = generateSpeech('No he entendido tu nombre. ¿Puedes repetirlo?');

            return handlerInput.responseBuilder
                .speak(speakOutput)
                .reprompt(repromptMessage)
                .getResponse();
        }

        if (playerName.length > 20) {
            const repromptMessage = generateSpeech(`Jugador ${attributes.currentPlayer}, ¿cómo te llamas?`);
            const speakOutput = generateSpeech('El nombre es demasiado largo. Por favor usa un nombre más corto.');

            return handlerInput.responseBuilder
                .speak(speakOutput)
                .reprompt(repromptMessage)
                .getResponse();
        }

        attributes.players.push({
            name: playerName.trim(),
            score: 0,
            correctAnswers: 0,
            teamCorrectAnswers: 0,
            favoriteSong: null,
            questionsAnswered: 0
        });

        if (attributes.currentPlayer >= attributes.playerCount) {
            try {
                const success = await db.saveGameSession(requestEnvelope.session.sessionId, {
                    playerCount: attributes.playerCount,
                    currentPlayer: attributes.currentPlayer,
                    gameState: attributes.gameState,
                    players: attributes.players,
                    createdAt: new Date().toISOString()
                });

                if (!success) {
                    throw new Error('Error al guardar en DynamoDB');
                }

                attributes.gameState = gameStates.ASKING_FAVORITE_SONGS;
                
                const firstPlayerIndex = Math.floor(Math.random() * attributes.players.length);
                attributes.currentPlayer = firstPlayerIndex;
                const firstPlayerName = attributes.players[firstPlayerIndex].name;
                
                const welcomeMessages = [
                    `¡Un placer ${playerName}! Ahora que nos conocemos mejor, ${firstPlayerName}, ¿qué canción te hace recordar buenos tiempos?`,
                    `¡Estupendo ${playerName}! La música une generaciones. ${firstPlayerName}, ¿cuál es esa canción que nunca te cansa?`,
                    `¡Genial ${playerName}! Vamos a animar el ambiente. ${firstPlayerName}, ¿cuál es tu tema musical favorito?`
                ];
                
                const randomMessage = welcomeMessages[Math.floor(Math.random() * welcomeMessages.length)];
                handlerInput.attributesManager.setSessionAttributes(attributes);

                const speakOutput = generateSpeech(randomMessage);
                const repromptOutput = generateSpeech(`${firstPlayerName}, ¿podrías decirme tu canción favorita?`);
                
                return handlerInput.responseBuilder
                    .speak(speakOutput)
                    .reprompt(repromptOutput)
                    .getResponse();
                    
            } catch (error) {
                console.error('Error al guardar jugadores:', error);
                const speakOutput = generateSpeech('Ha habido un problema al guardar los datos. Vamos a intentarlo de nuevo desde el principio.');
                
                return handlerInput.responseBuilder
                    .speak(speakOutput)
                    .reprompt('¿Cuántos jugadores sois hoy?')
                    .getResponse();
            }
        } else {
            attributes.currentPlayer += 1;
            handlerInput.attributesManager.setSessionAttributes(attributes);
            
            const responseMessages = [
                `Encantada de conocerte, ${playerName}.`,
                `Nos lo vamos a pasar genial, ${playerName}.`,
                `¡Qué nombre tan bonito ${playerName}!`,
                `Es un placer conocerte, ${playerName}.`,
                `¡Es un placer tenerte hoy aquí, ${playerName}!`
            ];
            
            const randomGreeting = responseMessages[Math.floor(Math.random() * responseMessages.length)];
            
            const speakOutput = generateSpeech(`${randomGreeting} Jugador ${attributes.currentPlayer}, ¿cómo te llamas?`);
            const repromptOutput = generateSpeech(`Jugador ${attributes.currentPlayer}, ¿podrías decirme tu nombre?`);
            
            return handlerInput.responseBuilder
                .speak(speakOutput)
                .reprompt(repromptOutput)
                .getResponse();
        }
    }
};

module.exports = {
    LaunchRequestHandler,
    SessionEndedRequestHandler,
    GetPlayerNameIntentHandler,
    PlayerCountIntentHandler,
    CancelAndStopIntentHandler,
    ErrorHandler,
    GetFavoriteSongIntentHandler,
    FallbackIntentHandler
};