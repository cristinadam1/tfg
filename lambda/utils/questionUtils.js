const questions = require('../game/questions');

const getNextAvailableQuestion = (attributes) => {
    const availableCategories = Object.keys(questions).filter(cat => cat !== 'FINAL');
    
    if (availableCategories.length === 0) {
        return null; 
    }
    
    if (!attributes.currentCategory || 
        !questions[attributes.currentCategory] || 
        questions[attributes.currentCategory].filter(q => !attributes.questionsAsked.includes(q.question)).length === 0) {
        
        attributes.currentCategory = availableCategories[Math.floor(Math.random() * availableCategories.length)];
        attributes.questionsAsked = [];
    }
    
    let questionsLeft = questions[attributes.currentCategory].filter(q => 
        !attributes.questionsAsked.includes(q.question)
    );
    
    if (questionsLeft.length === 0) {
        const remainingCategories = availableCategories.filter(cat => cat !== attributes.currentCategory);
        
        if (remainingCategories.length === 0) {
            return null; 
        }
        
        attributes.currentCategory = remainingCategories[Math.floor(Math.random() * remainingCategories.length)];
        attributes.questionsAsked = [];
        questionsLeft = questions[attributes.currentCategory];
    }
    
    return questionsLeft[0];
};

module.exports = { getNextAvailableQuestion };