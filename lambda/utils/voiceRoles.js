module.exports = {
  getRoleByTime: function() {
    const hour = new Date().getHours();
    if (hour >= 6 && hour < 14) return "MORNING";
    if (hour >= 14 && hour < 21) return "AFTERNOON";
    return "NIGHT";
  },

  getVoiceConfig: function(role) {
    const roles = {
      MORNING: {
        voice: "Conchita", 
        greeting: "<prosody rate='slow' volume='soft'>¡Buenos días! Bienvenidos a una mañana de recuerdos</prosody>",
        style: "<prosody rate='slow' pitch='+5%'>" 
      },
      AFTERNOON: {
        voice: "Lucia", 
        greeting: "<prosody rate='slow' volume='medium'>¡Buenas tardes! Creo que es el momento perfecto para revivir recuerdos.</prosody>",
        style: "<prosody rate='slow' pitch='normal'>" 
      },
      NIGHT: {
        voice: "Lucia", 
        greeting: "<prosody rate='slow' volume='soft'>¡Buenas noches! Un momento ideal para recordar tranquilamente.</prosody>",
        style: "<prosody rate='slow' pitch='-5%'>" 
      }
    };
    
    const config = roles[role] || roles.MORNING;
    
    return {
      ...config,
      ssmlStyle: config.style || "<prosody rate='slow'>", 
      ssmlEnd: "</prosody>"
    };
  }
};