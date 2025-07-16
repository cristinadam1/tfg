const Alexa = require('ask-sdk-core');
const questions = require('../game/questions');
const voiceRoles = require('../utils/voiceRoles');
const gameStates = require('../game/gameStates');
const { sendProgressiveResponse } = require('ask-sdk-core');

const StartGameIntentHandler = {
    canHandle(handlerInput) {
        console.log('StartGameIntentHandler - canHandle');
        const attributes = handlerInput.attributesManager.getSessionAttributes();
        const intentName = Alexa.getIntentName(handlerInput.requestEnvelope);
        
        attributes.questionCounter = 0;

        console.log('Intent name:', intentName);
        console.log('Current game state:', attributes.gameState);
        
        const canHandle = Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
               (intentName === 'AMAZON.YesIntent' || 
                intentName === 'StartGameIntent') &&
               attributes.gameState === gameStates.GAME_STARTED;
        
        console.log('Can handle:', canHandle);
        return canHandle;
    },

    handle(handlerInput) {
        const { attributesManager } = handlerInput;
        const attributes = attributesManager.getSessionAttributes();
        
        // Cambiar al estado de preguntas individuales
        attributes.gameState = gameStates.INDIVIDUAL_QUESTION;
        attributes.currentPlayerIndex = 0;
        attributes.currentPlayerName = attributes.players[0].name;
        attributes.questionsAsked = [];
        
        // Seleccionar categoría aleatoria
        const categories = Object.keys(require('../game/questions'));
        const randomCategory = categories[Math.floor(Math.random() * categories.length)];
        attributes.currentCategory = randomCategory;
        
        // Obtener primera pregunta
        const availableQuestions = require('../game/questions')[randomCategory];
        const question = availableQuestions[0];
        attributes.currentQuestion = question;
        attributes.questionsAsked.push(question.question);
        
        attributesManager.setSessionAttributes(attributes);

        console.log('StartGame - Atributos:', JSON.stringify(attributes, null, 2));
        
        // Configurar voz según la hora
        const timeRole = require('../utils/voiceRoles').getRoleByTime();
        const voiceConfig = require('../utils/voiceRoles').getVoiceConfig(timeRole);
        
        const speakOutput = `<voice name="${voiceConfig.voice}">` +
            `${voiceConfig.greeting || '¡Vamos a empezar!'} ` +
            `La primera pregunta es para ${attributes.currentPlayerName}. ` +
            `Categoría: ${randomCategory}. ${question.question}</voice>`;
        
        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(`¿${attributes.currentPlayerName}, cuál es tu respuesta?`)
            .getResponse();
    }
    
};

const IndividualQuestionHandler = {
  canHandle(handlerInput) {
    const attributes = handlerInput.attributesManager.getSessionAttributes();
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
           (Alexa.getIntentName(handlerInput.requestEnvelope) === 'AnswerIntent' ||
            Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.YesIntent') &&
           (attributes.gameState === gameStates.INDIVIDUAL_QUESTION || 
            attributes.gameState === gameStates.TEAM_QUESTION);
  },

  async handle(handlerInput) {
    const { attributesManager, requestEnvelope } = handlerInput;
    const attributes = attributesManager.getSessionAttributes();
    const intentName = Alexa.getIntentName(requestEnvelope);
    
    // Configurar rol y voz según la hora
    const timeRole = voiceRoles.getRoleByTime();
    const voiceConfig = voiceRoles.getVoiceConfig(timeRole);
    
    // Si es la primera pregunta
    if (!attributes.currentQuestion) {
      return startIndividualQuestions(handlerInput, voiceConfig);
    }
    
    // Si están respondiendo a una pregunta
    if (intentName === 'AnswerIntent') {
      return handleAnswer(handlerInput, voiceConfig);
    }
    
    // Si dicen que sí a continuar
    if (intentName === 'AMAZON.YesIntent') {
      return askNextQuestion(handlerInput, voiceConfig);
    }
    
    // Respuesta por defecto
    return handlerInput.responseBuilder
      .speak("No entendí tu respuesta. ¿Puedes repetirla?")
      .reprompt(`¿${attributes.currentPlayerName}, cuál es tu respuesta?`)
      .getResponse();
  }
};

const TeamQuestionHandler = {
    canHandle(handlerInput) {
        const attributes = handlerInput.attributesManager.getSessionAttributes();
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
               (Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.YesIntent' ||
                Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.NoIntent') &&
               attributes.gameState === gameStates.TEAM_CONFIRMATION;
    },

    async handle(handlerInput) {
        const { attributesManager, requestEnvelope } = handlerInput;
        const attributes = attributesManager.getSessionAttributes();
        const intentName = Alexa.getIntentName(requestEnvelope);
        const timeRole = voiceRoles.getRoleByTime();
        const voiceConfig = voiceRoles.getVoiceConfig(timeRole);

        if (intentName === 'AMAZON.YesIntent') {
            // Configurar pregunta en equipo
            attributes.gameState = gameStates.TEAM_QUESTION;
            const teammateIndex = (attributes.currentPlayerIndex + 1) % attributes.players.length;
            const teammateName = attributes.players[teammateIndex].name;

            // Temporizador de 30 segundos
            setTimeout(async () => {
                try {
                    await handlerInput.responseBuilder
                        .speak("Tiempo terminado. ¿Cuál es su respuesta?")
                        .getResponse();
                } catch (error) {
                    console.error('Error en temporizador:', error);
                }
            }, 30000);

            return handlerInput.responseBuilder
                .speak(`<voice name="${voiceConfig.voice}">Perfecto. Tienes 30 segundos para discutir con ${teammateName}. La pregunta es: ${attributes.currentQuestion.question}</voice>`)
                .reprompt("¿Cuál es su respuesta en equipo?")
                .getResponse();
        } else {
            // Si no hay compañero, continuar con pregunta individual
            attributes.gameState = gameStates.INDIVIDUAL_QUESTION;
            return handlerInput.responseBuilder
                .speak(`<voice name="${voiceConfig.voice}">Continuaremos con preguntas individuales. ${attributes.currentQuestion.question}</voice>`)
                .reprompt(`¿${attributes.currentPlayerName}, cuál es tu respuesta?`)
                .getResponse();
        }
    }
};

// Modifica askNextQuestion para incluir preguntas en equipo
function askNextQuestion(handlerInput, voiceConfig) {
    const { attributesManager } = handlerInput;
    const attributes = attributesManager.getSessionAttributes();
    
    // Incrementar contador de preguntas
    attributes.questionCounter = (attributes.questionCounter || 0) + 1;
    
    // Cada 3 preguntas, intentar hacer una en equipo (si hay suficientes jugadores)
    if (attributes.questionCounter % 3 === 0 && attributes.players.length > 1) {
        return startTeamQuestion(handlerInput, voiceConfig);
    }
    
    // Resto de la lógica para preguntas individuales...
}

// Nueva función para iniciar preguntas en equipo
function startTeamQuestion(handlerInput, voiceConfig) {
    const { attributesManager } = handlerInput;
    const attributes = attributesManager.getSessionAttributes();
    
    attributes.gameState = gameStates.TEAM_CONFIRMATION;
    const teammateIndex = (attributes.currentPlayerIndex + 1) % attributes.players.length;
    const teammateName = attributes.players[teammateIndex].name;
    
    return handlerInput.responseBuilder
        .speak(`<voice name="${voiceConfig.voice}">¡Pregunta en equipo! ${attributes.currentPlayerName}, ¿tienes un compañero a tu derecha? Tienes 30 segundos para ponerte de acuerdo con ${teammateName}.</voice>`)
        .reprompt(`¿${attributes.currentPlayerName}, tienes un compañero a tu derecha? Responde sí o no.`)
        .getResponse();
}

// Modifica handleAnswer para puntuar en equipo
function handleAnswer(handlerInput, voiceConfig) {
    const { attributesManager, requestEnvelope } = handlerInput;
    const attributes = attributesManager.getSessionAttributes();
    
    // ... (lógica de validación de respuesta)
    
    if (isCorrect && attributes.gameState === gameStates.TEAM_QUESTION) {
        // Dar puntos a ambos jugadores
        const teammateIndex = (attributes.currentPlayerIndex + 1) % attributes.players.length;
        attributes.players[attributes.currentPlayerIndex].score += 1;
        attributes.players[teammateIndex].score += 1;
    } else if (isCorrect) {
        // Puntuación individual normal
        attributes.players[attributes.currentPlayerIndex].score += 1;
    }
    
    // ... (resto de la función)
}





// Función para iniciar las preguntas individuales
function startIndividualQuestions(handlerInput, voiceConfig) {
  const { attributesManager } = handlerInput;
  const attributes = attributesManager.getSessionAttributes();
  
  // Configurar estado
  attributes.gameState = gameStates.INDIVIDUAL_QUESTION;
  attributes.currentQuestionIndex = 0;
  attributes.currentPlayerIndex = 0;
  attributes.currentPlayerName = attributes.players[0].name;
  attributes.questionsAsked = [];
  
  // Seleccionar categoría aleatoria
  const categories = Object.keys(questions);
  const randomCategory = categories[Math.floor(Math.random() * categories.length)];
  
  // Guardar categoría actual
  attributes.currentCategory = randomCategory;
  attributesManager.setSessionAttributes(attributes);
  
  // Obtener pregunta
  const availableQuestions = questions[randomCategory].filter(q => 
    !attributes.questionsAsked.includes(q.question)
  );
  const question = availableQuestions[0];
  
  // Guardar pregunta actual
  attributes.currentQuestion = question;
  attributes.questionsAsked.push(question.question);
  attributesManager.setSessionAttributes(attributes);
  
  // Construir respuesta con voz adecuada
  const speakOutput = `<voice name="${voiceConfig.voice}">` +
    `${voiceConfig.greeting || 'Vamos a jugar!'} ` +
    `La primera pregunta es para ${attributes.currentPlayerName}. ` +
    `Categoría: ${randomCategory}. ${question.question}</voice>`;
  
  return handlerInput.responseBuilder
    .speak(speakOutput)
    .reprompt(`¿${attributes.currentPlayerName}, cuál es tu respuesta?`)
    .getResponse();
}

// Función para manejar respuestas
function handleAnswer(handlerInput, voiceConfig) {
    const { attributesManager, requestEnvelope } = handlerInput;
    const attributes = attributesManager.getSessionAttributes();
    const userAnswer = Alexa.getSlotValue(requestEnvelope, 'answer');

    // Normalización para comparación
    const normalizeString = (str) => {
        if (!str) return '';
        return str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    };

    const normalizedUserAnswer = normalizeString(userAnswer);
    
    // Obtener todas las respuestas posibles (tanto de 'answer' como de 'answers')
    let possibleAnswers = [];
    if (attributes.currentQuestion.answers) {
        possibleAnswers = attributes.currentQuestion.answers;
    } else if (attributes.currentQuestion.answer) {
        possibleAnswers = [attributes.currentQuestion.answer];
    }

    // Verificar si alguna respuesta coincide
    const isCorrect = possibleAnswers.some(correctAnswer => 
        normalizedUserAnswer.includes(normalizeString(correctAnswer))
    );

    // Actualizar puntuación
    if (isCorrect) {
        attributes.players[attributes.currentPlayerIndex].score += 1;
    }

    // Mensajes de feedback
    const feedbackMessages = [
        "¡Excelente!",
        "¡Muy bien!",
        "¡Correcto!",
        "¡Así se hace!",
        "¡Lo sabías!"
    ];
    const randomFeedback = feedbackMessages[Math.floor(Math.random() * feedbackMessages.length)];
    
    const speakOutput = `<voice name="${voiceConfig.voice}">` +
        (isCorrect ? 
            `${randomFeedback} ${attributes.currentPlayerName}, acertaste. ` :
            `Casi, ${attributes.currentPlayerName}. La respuesta correcta era ${possibleAnswers[0]}. `) +
        `¿Listos para la siguiente pregunta?</voice>`;

    // Pasar al siguiente jugador
    attributes.currentPlayerIndex = (attributes.currentPlayerIndex + 1) % attributes.players.length;
    attributes.currentPlayerName = attributes.players[attributes.currentPlayerIndex].name;
    attributesManager.setSessionAttributes(attributes);
    
    return handlerInput.responseBuilder
        .speak(speakOutput)
        .reprompt(`¿Quieren continuar con la siguiente pregunta?`)
        .getResponse();
}

async function startTeamQuestion(handlerInput, voiceConfig) {
    const { attributesManager } = handlerInput;
    const attributes = attributesManager.getSessionAttributes();
    
    // Configurar estado
    attributes.gameState = gameStates.TEAM_QUESTION;
    
    // Obtener pregunta
    const availableQuestions = questions[attributes.currentCategory].filter(q => 
      !attributes.questionsAsked.includes(q.question)
    );
    const question = availableQuestions[0];
    
    // Guardar pregunta actual
    attributes.currentQuestion = question;
    attributes.questionsAsked.push(question.question);
    
    // Determinar compañero
    const teammateIndex = (attributes.currentPlayerIndex + 1) % attributes.players.length;
    const teammateName = attributes.players[teammateIndex].name;
    
    // Configurar temporizador
    setTimeout(async () => {
      try {
        await sendProgressiveResponse(handlerInput.requestEnvelope, {
          directives: [{
            type: 'VoicePlayer.Speak',
            speech: 'Tiempo terminado. ¿Cuál es su respuesta?'
          }]
        });
      } catch (error) {
        console.error('Error enviando progressive response:', error);
      }
    }, 25000); // 25 segundos
  
    // Construir respuesta inicial
    const speakOutput = `<voice name="${voiceConfig.voice}">` +
      `¡Pregunta en equipo! ${attributes.currentPlayerName}, ¿tienes un compañero a tu derecha? ` +
      `Tienes 30 segundos para discutir con ${teammateName}. ` +
      `La pregunta es: ${question.question}</voice>`;
    
    return handlerInput.responseBuilder
      .speak(speakOutput)
      .reprompt("¿Tienes un compañero a tu derecha? Responde sí o no.")
      .getResponse();
  }
  
// Función para hacer la siguiente pregunta
function askNextQuestion(handlerInput, voiceConfig) {
    const { attributesManager } = handlerInput;
    const attributes = attributesManager.getSessionAttributes();
    
    // Obtener nueva pregunta
    const availableQuestions = questions[attributes.currentCategory].filter(q => 
      !attributes.questionsAsked.includes(q.question)
    );
    
    if (availableQuestions.length === 0) {
      const categories = Object.keys(questions).filter(c => c !== attributes.currentCategory);
      if (categories.length === 0) {
        return endGame(handlerInput);
      }
      attributes.currentCategory = categories[Math.floor(Math.random() * categories.length)];
      attributes.questionsAsked = [];
    }
  
    // Incrementar contador y verificar si es pregunta de equipo
    attributes.questionCounter = (attributes.questionCounter || 0) + 1;
    
    if (attributes.questionCounter % 3 === 0 && attributes.players.length > 1) {
      return startTeamQuestion(handlerInput, voiceConfig);
    }
  
    // Continuar con pregunta individual
    const availableQuestionsNew = questions[attributes.currentCategory].filter(q => 
      !attributes.questionsAsked.includes(q.question)
    );
    const question = availableQuestionsNew[0];
    
    attributes.currentQuestion = question;
    attributes.questionsAsked.push(question.question);
    attributesManager.setSessionAttributes(attributes);
    
    const speakOutput = `<voice name="${voiceConfig.voice}">` +
      `La siguiente pregunta es para ${attributes.currentPlayerName}. ` +
      `Categoría: ${attributes.currentCategory}. ${question.question}</voice>`;
    
    return handlerInput.responseBuilder
      .speak(speakOutput)
      .reprompt(`¿${attributes.currentPlayerName}, cuál es tu respuesta?`)
      .getResponse();
  }

module.exports = {
  IndividualQuestionHandler,
  StartGameIntentHandler,
  TeamQuestionHandler
};