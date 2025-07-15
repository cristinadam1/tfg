const Alexa = require('ask-sdk-core');
const db = require('../db/dynamodb');
const gameStates = require('./gameStates');


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
            .speak('Lo siento, ha ocurrido un error. Por favor inténtalo de nuevo.')
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
        const speakOutput = 'No he entendido eso. Prueba diciendo "ayuda".';

        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(speakOutput)
            .getResponse();
    }
};

const GetFavoriteSongIntentHandler = {
    canHandle(handlerInput) {
      return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
             Alexa.getIntentName(handlerInput.requestEnvelope) === 'GetFavoriteSongIntent';
    },
  
    async handle(handlerInput) {
      const songName = Alexa.getSlotValue(handlerInput.requestEnvelope, 'song');
  
      if (!songName) {
        return handlerInput.responseBuilder
          .speak("No entendí el nombre de la canción. ¿Puedes repetirlo?")
          .reprompt("¿Cuál es tu canción favorita?")
          .getResponse();
      }
  
      const url = await db.getSongUrl(songName);
  
      if (url) {
        const speakOutput = `<speak>¡Buena elección! Aquí tienes un fragmento de ${songName}. <audio src="${url}"/></speak>`;
        return handlerInput.responseBuilder
          .speak(speakOutput)
          .getResponse();
      } else {
        return handlerInput.responseBuilder
          .speak(`No encontré la canción ${songName} en mi base de datos.`)
          .reprompt("¿Quieres probar con otra canción?")
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
  
    handle(handlerInput) {
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
        
        if (!playerName) {
            return handlerInput.responseBuilder
                .speak("No he entendido tu nombre. ¿Puedes repetirlo?")
                .reprompt(`Jugador ${attributes.currentPlayer}, ¿cómo te llamas?`)
                .getResponse();
        }
        
        // Añadir jugador a la lista temporal en sesión
        attributes.players.push({
            name: playerName,
            score: 0
        });
        
        // Verificar si hemos registrado todos los nombres
        if (attributes.currentPlayer >= attributes.playerCount) {
            // Guardar en DynamoDB - estructura actualizada para JuegoRegresoPasado
            const success = await db.saveGameSession(requestEnvelope.session.sessionId, {
                currentPlayer: attributes.currentPlayer,
                gameState: attributes.gameState,
                players: attributes.players
            });
            
            if (!success) {
                return handlerInput.responseBuilder
                    .speak("Hubo un problema al guardar los jugadores. Vamos a intentarlo de nuevo.")
                    .reprompt("Jugador 1, ¿cómo te llamas?")
                    .getResponse();
            }
            
            // Todos los nombres registrados
            attributes.gameState = gameStates.ASKING_FAVORITE_SONGS;
            attributes.currentPlayer = 1; // Resetear para canciones
            handlerInput.attributesManager.setSessionAttributes(attributes);
            
            return handlerInput.responseBuilder
                .speak(`¡Perfecto ${playerName}! Todos registrados. ${attributes.players[0].name}, ¿cuál es tu canción favorita?`)
                .reprompt(`${attributes.players[0].name}, por favor dime tu canción favorita.`)
                .getResponse();
        } else {
            // Seguir registrando nombres
            attributes.currentPlayer += 1;
            handlerInput.attributesManager.setSessionAttributes(attributes);
            
            return handlerInput.responseBuilder
                .speak(`Encantado de conocerte, ${playerName}. Jugador ${attributes.currentPlayer}, ¿cómo te llamas?`)
                .reprompt(`Jugador ${attributes.currentPlayer}, ¿cómo te llamas?`)
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