const Alexa = require('ask-sdk-core');
const baseHandlers = require('./handlers/baseHandlers');
const dbHandlers = require('./handlers/dbHandlers');

console.log('Skill iniciada - Versión:', process.env.AWS_LAMBDA_FUNCTION_VERSION);

// Habilita logging detallado
process.env.ASK_DEBUG = 'true';

exports.handler = Alexa.SkillBuilders.custom()
    .addRequestHandlers(
        baseHandlers.LaunchRequestHandler,
        baseHandlers.HelpIntentHandler,
        baseHandlers.PlayerCountIntentHandler,
        //baseHandlers.SaveColorHandler,
        //dbHandlers.SaveDataIntentHandler,
        baseHandlers.GetFavoriteSongIntentHandler,
        baseHandlers.FallbackIntentHandler,
        baseHandlers.GetPlayerNameIntentHandler
        //dbHandlers.ReadDataIntentHandler
    )
    .addErrorHandlers(baseHandlers.ErrorHandler)
    .lambda();