const questions = require('../game/questions');

const getNextAvailableQuestion = (attributes) => {
    const availableCategories = Object.keys(questions).filter(cat => cat !== 'FINAL');
    
    if (availableCategories.length === 0) {
        return null;
    }
    
    const categoriesWithAvailableQuestions = availableCategories.filter(category => {
        const categoryQuestions = questions[category];
        return categoryQuestions.some(q => !attributes.questionsAsked?.includes(q.question));
    });
    
    if (categoriesWithAvailableQuestions.length === 0) {
        return null; 
    }
    
    const randomCategoryIndex = Math.floor(Math.random() * categoriesWithAvailableQuestions.length);
    const selectedCategory = categoriesWithAvailableQuestions[randomCategoryIndex];
    
    const availableQuestions = questions[selectedCategory].filter(q => 
        !attributes.questionsAsked?.includes(q.question)
    );
    
    if (availableQuestions.length === 0) {
        return null; 
    }
    
    const randomQuestionIndex = Math.floor(Math.random() * availableQuestions.length);
    return availableQuestions[randomQuestionIndex];
};

module.exports = { getNextAvailableQuestion };