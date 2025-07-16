module.exports = {
  getRoleByTime: function() {
    const hour = new Date().getHours();
    if (hour >= 6 && hour < 12) return "MORNING";
    if (hour >= 12 && hour < 20) return "AFTERNOON";
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
        voice: "Enrique",
        style: "neutral",
        pitch: "default",
        rate: "medium"
      },
      MORNING: {
        voice: "Lucia",
        style: "cheerful",
        greeting: "¡Buenos días! ¿Listos para una mañana de recuerdos?"
      },
      AFTERNOON: {
        voice: "Enrique",  
        style: "conversational",
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