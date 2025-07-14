const Alexa = require('ask-sdk-core');
const db = require('../db/dynamodb');


const LaunchRequestHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'LaunchRequest';
    },
    handle(handlerInput) {
        const speakOutput = '¡Bienvenidos a regreso al pasado!';
        
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

/* const SaveColorHandler = {
    canHandle(handlerInput) {
      return handlerInput.requestEnvelope.request.type === 'IntentRequest'
        && handlerInput.requestEnvelope.request.intent.name === 'SaveColorIntent';
    },
    async handle(handlerInput) {
      const userId = handlerInput.requestEnvelope.session.user.userId;
      const slots = handlerInput.requestEnvelope.request.intent.slots;
      
      const color = slots.color?.value || slots.colorPersonalizado?.value;
      
      if (!color) {
        return handlerInput.responseBuilder
          .speak("No capté el color. Por favor, di algo como 'guarda que mi color es turquesa'")
          .reprompt("¿Qué color te gustaría guardar?")
          .getResponse();
      }
      
      // Guarda en DynamoDB
      await db.saveUserData(userId, { 
        favoriteColor: color.toLowerCase()  // Normaliza el texto
      });
      
      return handlerInput.responseBuilder
        .speak(`¡Listo! Guardé que tu color favorito es ${color}.`)
        .getResponse();
    }
  }; */

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
  

// Exporta todos los handlers base
module.exports = {
    LaunchRequestHandler,
    //SaveColorHandler,
    HelpIntentHandler,
    CancelAndStopIntentHandler,
    ErrorHandler,
    GetFavoriteSongIntentHandler,
    FallbackIntentHandler
};