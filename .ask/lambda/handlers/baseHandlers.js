const Alexa = require('ask-sdk-core');
const db = require('../db/dynamodb');
const gameStates = require('../game/gameStates');


const LaunchRequestHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'LaunchRequest';
    },
    handle(handlerInput) {
        const attributes = handlerInput.attributesManager.getSessionAttributes();
        
        // Reiniciar estado si es una nueva sesión
        attributes.gameState = gameStates.REGISTERING_PLAYER_COUNT;
        attributes.players = [];
        attributes.currentPlayer = 1;
        
        handlerInput.attributesManager.setSessionAttributes(attributes);
        
        const speakOutput = '¡Bienvenidos a Regreso al Pasado! ¿Cuántos jugadores sois hoy?';
        
        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(speakOutput)
            .getResponse();
    }
};


const HelpIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.HelpIntent';
    },
    handle(handlerInput) {
        const speakOutput = 'Puedo guardar y leer tus datos. Este es el HelpIntentHandler';

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
        const speakOutput = '¡Hasta luego!';
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
        //console.error(`Error handled: ${error.message}`);
        console.error('Error handled:', error);
        return handlerInput.responseBuilder
            .speak('Creo que no te he entendido. Por favor inténtalo de nuevo.')
            .reprompt('¿Necesitas ayuda? Prueba a decir "ayuda".')
            .getResponse();
    }
};


const FallbackIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.FallbackIntent';
    },
    handle(handlerInput) {
        const speakOutput = 'Perdona, ¿podrías repetirmelo?.';

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
        
        if (!songName) {
            const currentPlayerName = attributes.players[attributes.currentPlayer].name;
            return handlerInput.responseBuilder
                .speak("No he entendido el nombre de la canción. ¿Puedes repetirlo?")
                .reprompt(`${currentPlayerName}, ¿cuál es tu canción favorita?`)
                .getResponse();
        }
        
        // Guardar la canción favorita del jugador
        attributes.players[attributes.currentPlayer].favoriteSong = songName;
        
        // Guardar en DynamoDB
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
        
        // Obtener URL del audio
        const url = await db.getSongUrl(songName);
        
        // Seleccionar siguiente jugador aleatorio que no haya dicho su canción
        const playersWithoutSong = attributes.players
            .map((player, index) => ({...player, index}))
            .filter(player => !player.favoriteSong);
        
        if (playersWithoutSong.length > 0) {
            const nextPlayer = playersWithoutSong[Math.floor(Math.random() * playersWithoutSong.length)];
            attributes.currentPlayer = nextPlayer.index;
            handlerInput.attributesManager.setSessionAttributes(attributes);
            
            // Guardar cambio de jugador actual en DynamoDB
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
                speakOutput = `<speak>¡Buena elección! Aquí tienes un fragmento de ${songName}. <audio src="${url}"/> ${nextPlayer.name}, ¿y cuál es tu canción favorita?</speak>`;
            } else {
                speakOutput = `No conozco la cancion ${songName} pero seguro que me encantaría. Para el proximo día me la aprenderé. ${nextPlayer.name}, ¿cuál es tu canción favorita?`;
            }
            
            return handlerInput.responseBuilder
                .speak(speakOutput)
                .reprompt(`${nextPlayer.name}, ¿cuál es tu canción favorita?`)
                .getResponse();
        } else {
            // Todos han dicho su canción
            attributes.gameState = gameStates.GAME_STARTED;
            handlerInput.attributesManager.setSessionAttributes(attributes);
            
            // Guardar estado final en DynamoDB
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
                speakOutput = `<speak>¡Buena elección! Aquí tienes un fragmento de ${songName}. <audio src="${url}"/> ¡Y con esto ya tenemos todas vuestras canciones favoritas! ¿Listos para empezar el juego?</speak>`;
            } else {
                speakOutput = `No conozco la cancion ${songName}, pero seguro que esta muy chula. Para el proximo día me la aprenderé ¿Listos para empezar el juego?`;
            }
            
            return handlerInput.responseBuilder
                .speak(speakOutput)
                .reprompt("¿Queréis empezar el juego?")
                .getResponse();
        }
    }
};


const PlayerCountIntentHandler = {
    canHandle(handlerInput) {
      console.log('Verificando si PlayerCountIntentHandler puede manejar la solicitud');
      try {
        const attributes = handlerInput.attributesManager.getSessionAttributes();
        const requestType = Alexa.getRequestType(handlerInput.requestEnvelope);
        const intentName = Alexa.getIntentName(handlerInput.requestEnvelope);
        
        const canHandle = requestType === 'IntentRequest' &&
                        intentName === 'PlayerCountIntent' &&
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
        const { attributesManager } = handlerInput;
        const attributes = attributesManager.getSessionAttributes();
        
        console.log(`Número de jugadores recibido: ${playerCount}`);
        
        if (isNaN(playerCount)) {
          console.error('Número de jugadores no es un número válido');
          return handlerInput.responseBuilder
            .speak("No entendí cuántos jugadores sois. ¿Podrías repetirlo?")
            .reprompt("Por favor, dime cuántos jugadores sois hoy.")
            .getResponse();
        }
        
        if (playerCount < 1 || playerCount > 8) {
          console.error(`Número de jugadores fuera de rango: ${playerCount}`);
          return handlerInput.responseBuilder
            .speak("Por favor, dime un número entre 1 y 8 jugadores.")
            .reprompt("¿Cuántos jugadores van a jugar hoy?")
            .getResponse();
        }
        
        // Inicializar atributos de juego
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
        
        return handlerInput.responseBuilder
          .speak(`Perfecto, sois ${playerCount} jugadores. Jugador 1, ¿cómo te llamas?`)
          .reprompt("Jugador 1, por favor dime tu nombre.")
          .getResponse();
      } catch (error) {
        console.error('Error en handle:', error);
        return handlerInput.responseBuilder
          .speak("Ha ocurrido un error al procesar tu respuesta.")
          .reprompt("¿Podrías repetir cuántos jugadores sois?")
          .getResponse();
      }
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
        
        // Validar nombre
        if (!playerName || playerName.trim().length === 0) {
            return handlerInput.responseBuilder
                .speak("No he entendido tu nombre. ¿Puedes repetirlo?")
                .reprompt(`Jugador ${attributes.currentPlayer}, ¿cómo te llamas?`)
                .getResponse();
        }

        // Validar longitud del nombre
        if (playerName.length > 20) {
            return handlerInput.responseBuilder
                .speak("El nombre es demasiado largo. Por favor usa un nombre más corto.")
                .reprompt(`Jugador ${attributes.currentPlayer}, ¿cómo te llamas?`)
                .getResponse();
        }

        // Añadir jugador a la lista
        attributes.players.push({
            name: playerName.trim(),
            score: 0,
            favoriteSong: null
        });

        // Verificar si hemos registrado todos los nombres
        if (attributes.currentPlayer >= attributes.playerCount) {
            try {
                // Guardar en DynamoDB
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

                // Cambiar estado del juego
                attributes.gameState = gameStates.ASKING_FAVORITE_SONGS;
                
                // Seleccionar primer jugador aleatorio para canción
                const firstPlayerIndex = Math.floor(Math.random() * attributes.players.length);
                attributes.currentPlayer = firstPlayerIndex;
                const firstPlayerName = attributes.players[firstPlayerIndex].name;
                
                // Mensajes aleatorios para hacerlo más natural
                const welcomeMessages = [
                    `¡Perfecto ${playerName}! Ahora que nos conocemos mejor, ${firstPlayerName}, ¿qué canción te hace recordar buenos tiempos?`,
                    `¡Estupendo ${playerName}! La música une generaciones. ${firstPlayerName}, ¿cuál es esa canción que nunca te cansa?`,
                    `¡Genial ${playerName}! Vamos a animar el ambiente. ${firstPlayerName}, ¿cuál es tu tema musical favorito?`
                ];
                
                const randomMessage = welcomeMessages[Math.floor(Math.random() * welcomeMessages.length)];
                
                handlerInput.attributesManager.setSessionAttributes(attributes);
                
                return handlerInput.responseBuilder
                    .speak(randomMessage)
                    .reprompt(`${firstPlayerName}, ¿podrías decirme tu canción favorita?`)
                    .getResponse();
                    
            } catch (error) {
                console.error('Error al guardar jugadores:', error);
                return handlerInput.responseBuilder
                    .speak("Hubo un problema al guardar los datos. Vamos a intentarlo de nuevo desde el principio.")
                    .reprompt("¿Cuántos jugadores sois hoy?")
                    .getResponse();
            }
        } else {
            // Seguir registrando nombres
            attributes.currentPlayer += 1;
            handlerInput.attributesManager.setSessionAttributes(attributes);
            
            // Mensajes aleatorios para hacerlo más natural
            const responseMessages = [
                `Encantado de conocerte, ${playerName}.`,
                `¡Hola ${playerName}!`,
                `Un placer, ${playerName}.`,
                `¡Bienvenido, ${playerName}!`
            ];
            
            const randomGreeting = responseMessages[Math.floor(Math.random() * responseMessages.length)];
            
            return handlerInput.responseBuilder
                .speak(`${randomGreeting} Jugador ${attributes.currentPlayer}, ¿cómo te llamas?`)
                .reprompt(`Jugador ${attributes.currentPlayer}, ¿podrías decirme tu nombre?`)
                .getResponse();
        }
    }
};
  

// Exporta todos los handlers base
module.exports = {
    LaunchRequestHandler,
    GetPlayerNameIntentHandler,
    PlayerCountIntentHandler,
    HelpIntentHandler,
    CancelAndStopIntentHandler,
    ErrorHandler,
    GetFavoriteSongIntentHandler,
    FallbackIntentHandler
};