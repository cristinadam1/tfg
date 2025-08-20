module.exports = {
  getRoleByTime: function() {
    const hour = new Date().getHours();
    if (hour >= 6 && hour < 12) return "AFTERNOON"; //"MORNING";
    if (hour >= 12 && hour < 20) return "MORNING";//"AFTERNOON";
    return "NIGHT";
  },

  getVoiceConfig: function(role) {
    const roles = {
      CHILD: {
        voice: "Conchita",
        style: "childish",
        pitch: "+20%",
        rate: "fast"
      },
      ADULT: {
        voice: "Sergio",
        style: "calm",
        pitch: "+15%",
        rate: "medium"
      },
      MORNING: {
        voice: "Lucia",
        style: "cheerful",
        greeting: "¡Buenos días! ¿Listos para una mañana de recuerdos?"
      },
      AFTERNOON: {
        voice: "Enrique",  
        style: "cheerful",
        greeting: "¡Buenas tardes! ¿Preparados para un viaje al pasado?"
      },
      NIGHT: {
        voice: "Mia",
        style: "calm",
        greeting: "¡Buenas noches! Perfecto momento para recordar."
      }
    };
    return roles[role] || roles.ADULT;
  }
};