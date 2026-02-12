# Regreso al Pasado - Skill de Alexa para Personas Mayores

**Trabajo de Fin de Grado (TFG) - Ingeniería Informática** **Universidad de Granada (UGR)**

## 📖 Descripción del Proyecto

**Regreso al Pasado** es un *juego serio* desarrollado como una Skill de Alexa, diseñado específicamente para **personas mayores** en residencias y centros de día.

El objetivo principal de la aplicación es fomentar la **interacción social**, la **estimulación cognitiva** (a través de la reminiscencia) y el **bienestar emocional** de los usuarios. Utilizando una interfaz de voz natural y apoyo visual en dispositivos con pantalla (como Echo Show), el juego actúa como un moderador lúdico que evoca recuerdos positivos sobre música, cine, costumbres y eventos de las décadas de los 50 a los 80.

Este proyecto se enmarca dentro de la investigación *SIA-EnveSalud* ("Evaluación del uso de robots sociales y sistemas conversacionales para promover el envejecimiento saludable").

## 🎯 Objetivos

* **Fomentar la socialización:** Combatir el aislamiento y la soledad en entornos residenciales mediante dinámicas grupales.
* **Estimulación Cognitiva:** Ejercitar la memoria a largo plazo a través de la terapia de reminiscencia.
* **Accesibilidad Tecnológica:** Romper la brecha digital facilitando el uso de tecnología mediante la voz, eliminando barreras físicas y cognitivas.

## ⚙️ Características Principales

* **Multijugador:** Diseñado para grupos de 2 a 8 jugadores (también permite modo individual).
* **Dinámica de Juego:**
    * Registro de usuarios y sus canciones favoritas.
    * Preguntas adaptadas culturalmente (años 50-80).
    * Rondas de preguntas individuales y colaborativas (en equipo).
    * Ranking final no competitivo basado en "recuerdos evocados".
* **Adaptabilidad:**
    * Uso de **Amazon Polly** para adaptar la voz y el tono de Alexa según la hora del día.
    * Feedback positivo constante y mensajes de ánimo.
    * Apoyo visual con imágenes grandes y claras.
* **Co-Diseño:** El desarrollo se basó en sesiones participativas con residentes de los centros *María Auxiliadora* y *EntreÁlamos*, integrando sus preferencias reales (gustos musicales, imágenes y temáticas).

## 🛠️ Tecnologías Utilizadas

Este proyecto utiliza una arquitectura **Serverless** sobre **AWS**:

* **Plataforma:** Alexa Skills Kit (ASK).
* **Lenguaje:** Node.js (JavaScript).
* **Backend:** AWS Lambda (Lógica del juego).
* **Base de Datos:** Amazon DynamoDB (Persistencia de sesiones, jugadores y puntuaciones).
* **Almacenamiento:** Amazon S3 (Recursos multimedia: imágenes y clips de audio).
* **Voz/TTS:** Amazon Polly (Personalización de la voz).
* **Interfaz Visual:** Alexa Presentation Language (APL).
* **Herramientas:** VS Code, ASK CLI.

## 🚀 Instalación y Despliegue

Para desplegar esta skill en tu propia cuenta de desarrollador de Amazon:

1.  **Prerrequisitos:**
    * Cuenta de Amazon Developer.
    * Cuenta de AWS con permisos de usuario IAM configurados.
    * Node.js y NPM instalados.
    * ASK CLI instalada y configurada (`ask configure`).

2.  **Clonar el repositorio:**
    ```bash
    git clone [https://github.com/cristinadam1/tfg.git](https://github.com/cristinadam1/tfg.git)
    cd tfg
    ```

3.  **Instalar dependencias:**
    Navega a la carpeta de la lambda y ejecuta:
    ```bash
    cd lambda
    npm install
    ```

4.  **Despliegue:**
    Utiliza la CLI de Alexa para subir el modelo de interacción y el backend:
    ```bash
    ask deploy
    ```

## 📄 Estructura del Proyecto

* `/lambda`: Código fuente del backend (Node.js).
    * `/game`: Lógica de estados del juego.
    * `/handlers`: Manejadores de intents de Alexa.
    * `/data`: Banco de preguntas y recursos.
* `/skill-package`: Manifiesto de la skill y modelos de interacción (JSON).
* `/apls`: Documentos visuales (APL) para dispositivos con pantalla.

## 👥 Autoría y Créditos

* **Autora:** Cristina del Águila Martín
* **Tutora:** Nuria Medina Medina
* **Institución:** Escuela Técnica Superior de Ingenierías Informática y de Telecomunicación (ETSIIT) - Universidad de Granada.

---
*Granada, 2025.*
