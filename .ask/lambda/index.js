const Alexa = require('ask-sdk-core');
const baseHandlers = require('./handlers/baseHandlers');
const dbHandlers = require('./handlers/dbHandlers');
const gameHandlers = require('./handlers/gameHandlers');

console.log('Skill iniciada - Versión:', process.env.AWS_LAMBDA_FUNCTION_VERSION);
process.env.ASK_DEBUG = 'true';

exports.handler = Alexa.SkillBuilders.custom()
    .addRequestHandlers(
        baseHandlers.LaunchRequestHandler,
        //baseHandlers.HelpIntentHandler,
        baseHandlers.FallbackIntentHandler,
        baseHandlers.PlayerCountIntentHandler,
        baseHandlers.GetPlayerNameIntentHandler,
        baseHandlers.GetFavoriteSongIntentHandler,
        gameHandlers.StartGameIntentHandler,
        gameHandlers.IndividualQuestionHandler,
        gameHandlers.TeamQuestionHandler,
        gameHandlers.HelpIntentHandler,
        gameHandlers.FinalTeamQuestionHandler,
        gameHandlers.ShowRankingHandler,
        gameHandlers.NewGameDecisionHandler,
        gameHandlers.SamePlayersHandler,       
        gameHandlers.SessionEndedRequestHandler  
    )
    .addErrorHandlers(baseHandlers.ErrorHandler)
    .lambda();