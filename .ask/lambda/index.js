const Alexa = require('ask-sdk-core');
const baseHandlers = require('./handlers/baseHandlers');
const dbHandlers = require('./handlers/dbHandlers');

exports.handler = Alexa.SkillBuilders.custom()
    .addRequestHandlers(
        baseHandlers.LaunchRequestHandler,
        baseHandlers.HelpIntentHandler,
        baseHandlers.SaveColorHandler,
        //dbHandlers.SaveDataIntentHandler,
        baseHandlers.GetFavoriteSongIntentHandler,
        baseHandlers.FallbackIntentHandler
        //dbHandlers.ReadDataIntentHandler
    )
    .addErrorHandlers(baseHandlers.ErrorHandler)
    .lambda();