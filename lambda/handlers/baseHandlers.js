const Alexa = require('ask-sdk-core');
const db = require('../db/dynamodb');
const gameStates = require('../game/gameStates');
const voiceRoles = require('../utils/voiceRoles');
const aplUtils = require('../utils/aplUtils');


const WELCOME_MESSAGES = [
    `¡Un placer {playerName}! Ahora que nos conocemos mejor, {firstPlayerName}, ¿qué canción te hace recordar buenos tiempos? Por ejemplo: "antes escuchaba mucho, libre"`,
    `¡Estupendo {playerName}! La música une generaciones. {firstPlayerName}, ¿cuál es esa canción que nunca te cansa? Por ejemplo: "mi cancion favorita es, libre"`,
    `¡Genial {playerName}! Vamos a animar el ambiente. {firstPlayerName}, ¿cuál es tu tema musical favorito? Por ejemplo: "me gusta, libre"`
];

const GREETING_MESSAGES = [
    `Encantada de conocerte, {playerName}.`,
    `Un gusto conocerte, {playerName}.`,
    `¡Qué nombre tan bonito tienes, {playerName}!`,
    `¡Me alegro de tenerte hoy aquí, {playerName}!`
];

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
        aplUtils.showWelcomeLogo(handlerInput, "¡Bienvenidos a Regreso al Pasado!");

        attributes.gameState = gameStates.REGISTERING_PLAYER_COUNT;
        attributes.players = [];
        attributes.currentPlayer = 1;
        attributes.roundNumber = 1;
        attributes.questionsPerRound = 2; 
        attributes.currentRoundType = 'individual';
        
        handlerInput.attributesManager.setSessionAttributes(attributes);
        const speakOutput = generateSpeech('¿Queréis que os explique cómo funciona el juego?', true);

        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt('Por favor, decid "sí" si queréis que explique el juego o "no" para empezar directamente.')
            .getResponse();
    }
};

const GameExplanationHandler = {
    canHandle(handlerInput) {
        const attributes = handlerInput.attributesManager.getSessionAttributes();
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
               (Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.YesIntent' ||
                Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.NoIntent') &&
               attributes.gameState === gameStates.REGISTERING_PLAYER_COUNT;
    },
    handle(handlerInput) {
        const attributes = handlerInput.attributesManager.getSessionAttributes();
        const intentName = Alexa.getIntentName(handlerInput.requestEnvelope);
        
        if (intentName === 'AMAZON.YesIntent') {
            const explanation = generateSpeech(
                '¡Perfecto! Encantada de conoceros, mi nombre es Alexa. ' +
                'Os explico cómo jugar a "Regreso al Pasado". ' +
                'Es un juego de preguntas, para que recordemos tiempos pasados, y nos divirtamos un rato todos juntos. ' +
                'Primero, me diréis cuántos sois y vuestros nombres. ' +
                'Luego, cada uno me dirá su canción favorita para conoceros un poco mejor. ' +
                'Después comenzarán las preguntas: algunas individuales y otras en equipo. ' +
                'Para responder, debéis decir "la respuesta es", seguido de vuestra respuesta. ' +
                'Si no sabéis una respuesta, podéis pedir ayuda diciendo "ayuda" o "necesito ayuda". ' +
                'Pero recordad que solo pueden hablar los jugadores a los que les toque. ' +
                'Al final, veremos quién ha recordado más momentos del pasado. ' +
                'Y muy importante, si me quedo dormida, debeis llamarme por mi nombre, que es Alexa, para que os escuche. ' +
                '¡Vamos a empezar.! ¿Cuántos jugadores sois hoy?'
            );

            aplUtils.showWelcomeLogo(handlerInput, "Guía explicativa");
            
            return handlerInput.responseBuilder
                .speak(explanation)
                .reprompt('¿Cuántos jugadores sois hoy? Por ejemplo: "somos 3 jugadores"')
                .getResponse();
        } else if (intentName === 'AMAZON.NoIntent') {
            const speakOutput = generateSpeech('¡De acuerdo! Vamos directos a la partida. ¿Cuántos jugadores sois hoy?', false);
            
            return handlerInput.responseBuilder
                .speak(speakOutput)
                .reprompt('Por favor, decidme cuántos jugadores sois. Por ejemplo: "somos 4 jugadores"')
                .getResponse();
        }
    }
};

const CancelAndStopIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
               (Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.StopIntent');
    },
    
    handle(handlerInput) {
        const voiceConfig = voiceRoles.getVoiceConfig(voiceRoles.getRoleByTime());
        const speakOutput = `<voice name="${voiceConfig.voice}"><prosody rate="slow">¡Gracias por jugar a Regreso al Pasado! ¡Hasta la próxima!</prosody></voice>`;
        
        return handlerInput.responseBuilder
            .speak(speakOutput)
            .withShouldEndSession(true)
            .getResponse();
    }
};

const ErrorHandler = {
    canHandle() {
        return true;
    },
    handle(handlerInput, error) {
        console.error('Error handled:', error);
        
        const attributes = handlerInput.attributesManager.getSessionAttributes();
        let speakOutput;
        let repromptOutput;

        if (attributes.gameState === gameStates.REGISTERING_PLAYER_COUNT) {
            speakOutput = generateSpeech('Creo que no te he entendido. Tienes que decirme "somos", seguido del número de jugadores que seáis. Por ejemplo: "somos 3 jugadores".');
            repromptOutput = generateSpeech('¿Cuántos jugadores van a participar hoy? Por ejemplo: "somos 2 jugadores"');
        } 
        else if (attributes.gameState === gameStates.REGISTERING_PLAYER_NAMES) {
            const currentPlayer = attributes.players[attributes.currentPlayer - 1] || { name: `Jugador ${attributes.currentPlayer}` };
            speakOutput = generateSpeech(`Perdona, no he entendido tu nombre. ${currentPlayer.name}, ¿Podrías repetírmelo diciendome "me llamo", seguido de tu nombre. Por ejemplo: "Me llamo Isa"?`);
            repromptOutput = generateSpeech(`Jugador ${attributes.currentPlayer}, ¿cómo te llamas?`);
        }
        else {
            speakOutput = generateSpeech('Creo que no te he entendido. Por favor inténtalo de nuevo.');
            repromptOutput = generateSpeech('Perdona, sigo sin entenderte. Pídele ayuda a alguno de mis creadores');
        }
        
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
        const attributes = handlerInput.attributesManager.getSessionAttributes();
        let speakOutput;
        let repromptOutput;
        
        if (attributes.gameState === gameStates.ASKING_FAVORITE_SONGS) {
            const currentPlayer = attributes.players[attributes.currentPlayer];
            speakOutput = generateSpeech(`Creo que no te he entendido. Tienes que decir "mi canción favorita es" seguido del nombre de la canción. Por ejemplo: "mi canción favorita es libre".`);
            repromptOutput = generateSpeech(`${currentPlayer.name}, ¿cuál es tu canción favorita? Di algo como: "mi canción favorita es libre"`);
        }
        else {
            speakOutput = generateSpeech('Perdona, ¿podrías repetírmelo?');
            repromptOutput = speakOutput;
        }

        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(repromptOutput)
            .getResponse();
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

// Registro del numero de jugadores
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
          
          const canHandle = intentName === 'PlayerCountIntent' && (!attributes.gameState || attributes.gameState === gameStates.START || attributes.gameState === gameStates.REGISTERING_PLAYER_COUNT);
          
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

        aplUtils.showStaticImage(handlerInput, `Registrando ${playerCount} jugadores`);
        console.log(`Número de jugadores recibido: ${playerCount}`);
        
        if (isNaN(playerCount)) {
          console.error('Número de jugadores no es un número válido');
          const speakOutput = generateSpeech('No he entendido cuántos jugadores sois. ¿Podrías repetirlo?');
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

// Registro del nombre de los jugadores
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

        const trimmedPlayerName = playerName.trim();
        attributes.players.push({
            name: trimmedPlayerName,
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
                
                const randomWelcome = WELCOME_MESSAGES[Math.floor(Math.random() * WELCOME_MESSAGES.length)]
                    .replace('{playerName}', trimmedPlayerName)
                    .replace('{firstPlayerName}', firstPlayerName);
                
                handlerInput.attributesManager.setSessionAttributes(attributes);

                const speakOutput = generateSpeech(randomWelcome);
                const repromptOutput = generateSpeech(`${firstPlayerName}, ¿podrías decirme tu canción favorita?. Por ejemplo: "me gusta, libre"`);
                
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
            
            const randomGreeting = GREETING_MESSAGES[Math.floor(Math.random() * GREETING_MESSAGES.length)]
                .replace('{playerName}', trimmedPlayerName);
            
            const speakOutput = generateSpeech(`${randomGreeting} Jugador ${attributes.currentPlayer}, ¿cómo te llamas?`);
            const repromptOutput = generateSpeech(`Jugador ${attributes.currentPlayer}, ¿podrías decirme tu nombre?`);
            
            return handlerInput.responseBuilder
                .speak(speakOutput)
                .reprompt(repromptOutput)
                .getResponse();
        }
    }
};

// Registro de los gustos musicales
const GetFavoriteSongIntentHandler = {
    canHandle(handlerInput) {
        const attributes = handlerInput.attributesManager.getSessionAttributes();
        const requestType = Alexa.getRequestType(handlerInput.requestEnvelope);
        
        return requestType === 'IntentRequest' &&
               attributes.gameState === gameStates.ASKING_FAVORITE_SONGS;
    },
  
    async handle(handlerInput) {
        const { attributesManager, requestEnvelope } = handlerInput;
        const attributes = attributesManager.getSessionAttributes();
        const intentName = Alexa.getIntentName(handlerInput.requestEnvelope);
        const currentPlayerName = attributes.players[attributes.currentPlayer].name;
        
        if (intentName !== 'GetFavoriteSongIntent') {
            const speakOutput = generateSpeech('Tienes que decirme el nombre de una canción, empezando diciendo "mi cancion favorita es", seguido del nombre de la canción.');
            const repromptOutput = generateSpeech(`${currentPlayerName}, ¿cuál es tu canción favorita? Por ejemplo: "mi canción es quisiera volverme hiedra"`);
            
            return handlerInput.responseBuilder
                .speak(speakOutput)
                .reprompt(repromptOutput)
                .getResponse();
        }
        
        const songName = Alexa.getSlotValue(handlerInput.requestEnvelope, 'song');
        
        if (!songName || songName.trim().length < 2) {
            const speakOutput = generateSpeech('No he entendido el nombre de la canción. ¿Puedes repetirlo de forma más clara? Por ejemplo: "mi canción favorita es Libre"');
            const repromptOutput = generateSpeech(`${currentPlayerName}, ¿cuál es tu canción favorita? Por ejemplo: "me gusta Libre"`);
            
            return handlerInput.responseBuilder
                .speak(speakOutput)
                .reprompt(repromptOutput)
                .getResponse();
        }
        
        if (songName.length > 50) {
            const speakOutput = generateSpeech('El nombre de la canción es demasiado largo. Por favor, usa un nombre más corto o el título principal.');
            const repromptOutput = generateSpeech(`${currentPlayerName}, ¿podrías decirme solo el título principal de tu canción favorita?`);
            
            return handlerInput.responseBuilder
                .speak(speakOutput)
                .reprompt(repromptOutput)
                .getResponse();
        }
        
        const trimmedSongName = songName.trim();
        attributes.players[attributes.currentPlayer].favoriteSong = trimmedSongName;
        
        let url = await db.getSongUrl(trimmedSongName);
        let randomSongName = trimmedSongName;
        let usedRandomSong = false;
        
        if (!url) {
            console.log(`Canción "${trimmedSongName}" no encontrada, buscando canción aleatoria...`);
            const randomSong = await db.getRandomSong();
            if (randomSong && randomSong.url) {
                url = randomSong.url;
                randomSongName = randomSong.name;
                usedRandomSong = true;
                console.log(`Reproduciendo canción aleatoria: ${randomSongName}`);
            } else {
                console.log('No se pudo obtener una canción aleatoria');
            }
        }
        
        const playersWithoutSong = attributes.players
            .map((player, index) => ({...player, index}))
            .filter(player => !player.favoriteSong);

        if (playersWithoutSong.length > 0) {
            const nextPlayer = playersWithoutSong[Math.floor(Math.random() * playersWithoutSong.length)];
            attributes.currentPlayer = nextPlayer.index;
        } else {
            attributes.gameState = gameStates.GAME_STARTED;
        }
        
        handlerInput.attributesManager.setSessionAttributes(attributes);
        
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
                console.error('Error al guardar en DynamoDB');
            }
        } catch (error) {
            console.error('Error en saveGameSession:', error);
        }
        
        if (playersWithoutSong.length > 0) {
            const nextPlayer = attributes.players[attributes.currentPlayer];
            
            let speakOutput;
            if (url) {
                if (usedRandomSong) {
                    speakOutput = `<speak>${generateSpeech(`No conozco la canción ${trimmedSongName}, pero aquí tienes "${randomSongName}" para ambientar. ¡Disfrútala!`)} <audio src="${url}"/> <break time="2s"/> ${generateSpeech(`${nextPlayer.name}, ¿y cuál es tu canción favorita?`)}</speak>`;
                } else {
                    speakOutput = `<speak>${generateSpeech('¡Buena elección! Aquí tienes tu canción:')} <audio src="${url}"/> <break time="2s"/> ${generateSpeech(`${nextPlayer.name}, ¿y cuál es tu canción favorita?`)}</speak>`;
                }
            } else {
                speakOutput = generateSpeech(`No conozco la canción ${trimmedSongName} y no tengo otras canciones disponibles. ${nextPlayer.name}, ¿y cuál es tu canción favorita?`);
            }
            
            const repromptOutput = generateSpeech(`${nextPlayer.name}, ¿cuál es tu canción favorita?`);
            
            return handlerInput.responseBuilder
                .speak(speakOutput)
                .reprompt(repromptOutput)
                .getResponse();
                
        } else {
            let speakOutput;
            if (url) {
                if (usedRandomSong) {
                    speakOutput = `<speak>${generateSpeech(`No conozco la canción ${trimmedSongName}, pero aquí tienes "${randomSongName}" para ambientar. ¡Disfrútala!`)} <audio src="${url}"/> <break time="2s"/> ${generateSpeech('Ahora que nos conocemos un poco mejor, ¿estais Listos para empezar el juego?')}</speak>`;
                } else {
                    speakOutput = `<speak>${generateSpeech('¡Buena elección! Aquí tienes tu canción:')} <audio src="${url}"/> <break time="2s"/> ${generateSpeech('Ahora que nos conocemos un poco mejor, ¿estais listos para empezar el juego?')}</speak>`;
                }
            } else {
                speakOutput = generateSpeech(`No conozco la canción ${trimmedSongName} y no tengo otras canciones disponibles. ¡Pero con esto ya tenemos todas vuestras canciones favoritas! ¿Listos para empezar el juego?`);
            }
            
            const repromptOutput = generateSpeech('¿Queréis empezar el juego?');
            
            return handlerInput.responseBuilder
                .speak(speakOutput)
                .reprompt(repromptOutput)
                .getResponse();
        }
    }
};

module.exports = {
    LaunchRequestHandler,
    GameExplanationHandler,
    SessionEndedRequestHandler,
    GetPlayerNameIntentHandler,
    PlayerCountIntentHandler,
    CancelAndStopIntentHandler,
    ErrorHandler,
    GetFavoriteSongIntentHandler,
    FallbackIntentHandler
};