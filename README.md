# 🌐 Language

[🇬🇧 English](#-english) · [🇩🇪 Deutsch](#-deutsch) · [🇪🇸 Español](#-español)

---

# 🇬🇧 English

# ✨ Archivist

Archivist is a Discord bot that helps your server keep the moments worth remembering.  
It turns strong messages into highlights, keeps an eye on recurring favorites, and does it with privacy in mind.

## What it does

- creates message highlights based on scoring
- reacts to changes when reactions or content change
- cleans up stored highlights when messages are deleted
- posts rich highlight embeds with context and a jump link
- features a daily Moment of the Day
- posts a Weekly Recap
- lets you preview scoring with `/analyze`
- gives admins a control system inside Discord
- stores data in SQLite
- uses a consent-based privacy system

## Why it’s different

Archivist is built to feel useful without being noisy.  
It is not trying to be everything at once. It focuses on memorable messages, clean controls, and privacy that actually matters.

## Features

### Highlights

Archivist scores messages using reactions, sentiment, keywords, and context.  
When a message crosses the threshold, it can become a highlight. If reactions or content change later, the highlight can be promoted or demoted automatically.

### Moment of the Day

Archivist can pick one standout saved message as the daily Moment of the Day and post it as a featured moment.

### Weekly Recap

Archivist can post a Weekly Recap so the best moments from the week are easy to revisit.

### Privacy

Archivist uses a consent-based privacy system.  
Users can opt in, check their status, or delete their stored data.

### Admin Control

Admins get a control system inside Discord for overview, inspection, thresholds, recurring posts, health, and channel settings.

## Commands

Commands are in English.

```text
/help
/analyze
/privacy consent
/privacy status
/privacy delete
/archivist overview
/archivist leaderboard
/archivist points
/archivist threshold
/archivist autopost
/archivist channel
/archivist privacy
/archivist health
/archivist inspect
/archivist weekly
/archivist motd
/archivist backup
/archivist clear
/weekly
```

## Setup Tutorial

1. Clone the repository to your computer.

```bash
git clone <repository-url>
cd discord-bot-archivist
```

2. Install the dependencies.

```bash
npm install
```

3. Create a file called `.env` in the project folder.

4. Put this inside the `.env` file:

```env
DISCORD_TOKEN=your_bot_token_here
DEV_GUILD_ID=your_server_id_here
```

5. Start the bot.

```bash
node index.js
```

6. In Discord, run:

```text
/archivist overview
```

What these values mean:

- `DISCORD_TOKEN` is your bot token from the Discord Developer Portal
- `DEV_GUILD_ID` is your Discord server ID and helps commands appear faster while testing
- commands are in English
- the bot needs permission to read messages, send messages, and use slash commands

## Troubleshooting

- **Bot not responding?** Make sure the bot is running and invited to the correct server
- **Commands not showing up?** Wait a moment, then try again after restarting the bot
- **Wrong token?** Double-check the `DISCORD_TOKEN` value in `.env`
- **Missing permissions?** Make sure the bot can read messages, send messages, and use slash commands

## Invite
[Invite Archivist](#)

## 🤝 Contributing

Contributions, ideas, and improvements are welcome.  
Feel free to fork the project and build on top of it.

---

# 🇩🇪 Deutsch

# ✨ Archivist

Archivist ist ein Discord-Bot, der deinem Server hilft, die Momente zu behalten, die man nicht vergessen möchte.  
Er macht aus starken Nachrichten Highlights, behält wiederkehrende Lieblingsmomente im Blick und achtet dabei auf Datenschutz.

## Was er macht

- erstellt Message-Highlights auf Basis eines Scores
- reagiert auf Änderungen bei Reaktionen oder Nachrichteninhalt
- räumt gespeicherte Highlights auf, wenn Nachrichten gelöscht werden
- postet Highlight-Embeds mit Inhalt, Autor, Kanal, Score, Reaktionen und Jump-Link
- bietet einen täglichen Moment of the Day
- postet einen Weekly Recap
- zeigt mit `/analyze` eine Vorschau auf das Scoring
- bietet ein Admin-Kontrollsystem direkt in Discord
- speichert Daten in SQLite
- nutzt ein zustimmungsbasiertes Datenschutzsystem

## Warum es anders ist

Archivist soll nützlich sein, ohne zu nerven.  
Der Bot will nicht alles gleichzeitig sein. Er konzentriert sich auf erinnerungswürdige Nachrichten, klare Steuerung und Datenschutz, der wirklich mitgedacht ist.

## Features

### Highlights

Archivist bewertet Nachrichten anhand von Reaktionen, Sentiment, Keywords und Kontext.  
Wenn eine Nachricht den Schwellwert überschreitet, kann sie zum Highlight werden. Wenn sich Reaktionen oder Inhalt später ändern, wird das Highlight automatisch hoch- oder heruntergestuft.

### Moment of the Day

Archivist kann jeden Tag eine gespeicherte starke Nachricht als Moment of the Day hervorheben und posten.

### Weekly Recap

Archivist kann einen Weekly Recap posten, damit die besten Momente der Woche leicht wiederzufinden sind.

### Privacy

Archivist nutzt ein zustimmungsbasiertes Datenschutzsystem.  
Nutzer können zustimmen, ihren Status prüfen oder ihre gespeicherten Daten löschen.

### Admin Control

Admins bekommen ein Kontrollsystem direkt in Discord für Übersicht, Inspektion, Schwellwerte, wiederkehrende Posts, Gesundheit und Kanaleinstellungen.

## Commands

Die Commands sind auf Englisch.

```text
/help
/analyze
/privacy consent
/privacy status
/privacy delete
/archivist overview
/archivist leaderboard
/archivist points
/archivist threshold
/archivist autopost
/archivist channel
/archivist privacy
/archivist health
/archivist inspect
/archivist weekly
/archivist motd
/archivist backup
/archivist clear
/weekly
```

## Setup Tutorial

1. Klone das Repository auf deinen Computer.

```bash
git clone <repository-url>
cd discord-bot-archivist
```

2. Installiere die Abhängigkeiten.

```bash
npm install
```

3. Erstelle im Projektordner eine Datei mit dem Namen `.env`.

4. Schreibe das in die `.env` Datei:

```env
DISCORD_TOKEN=your_bot_token_here
DEV_GUILD_ID=your_server_id_here
```

5. Starte den Bot.

```bash
node index.js
```

6. Führe in Discord diesen Befehl aus:

```text
/archivist overview
```

Was diese Werte bedeuten:

- `DISCORD_TOKEN` ist dein Bot-Token aus dem Discord Developer Portal
- `DEV_GUILD_ID` ist die ID deines Discord-Servers und hilft dabei, dass Commands beim Testen schneller erscheinen
- die Commands sind auf Englisch
- der Bot braucht Berechtigungen zum Lesen von Nachrichten, Senden von Nachrichten und Verwenden von Slash-Commands

## Troubleshooting

- **Bot reagiert nicht?** Prüfe, ob der Bot läuft und in den richtigen Server eingeladen wurde
- **Commands erscheinen nicht?** Warte kurz und starte den Bot danach noch einmal neu
- **Falscher Token?** Prüfe den `DISCORD_TOKEN` Wert in deiner `.env`
- **Fehlende Berechtigungen?** Der Bot muss Nachrichten lesen, Nachrichten senden und Slash-Commands verwenden dürfen

## Invite
[Invite Archivist](#)

## 🤝 Contributing

Beiträge, Ideen und Verbesserungen sind willkommen.  
Fork das Projekt gern und bau darauf auf.

---

# 🇪🇸 Español

# ✨ Archivist

Archivist es un bot de Discord que ayuda a tu servidor a guardar los momentos que vale la pena recordar.  
Convierte mensajes fuertes en highlights, sigue los favoritos recurrentes y lo hace con privacidad en mente.

## Qué hace

- crea highlights de mensajes según una puntuación
- reacciona a cambios cuando cambian las reacciones o el contenido
- limpia highlights guardados cuando se eliminan mensajes
- publica embeds de highlights con contenido, autor, canal, puntuación, reacciones y enlace directo
- ofrece un Moment of the Day diario
- publica un Weekly Recap
- permite previsualizar la puntuación con `/analyze`
- ofrece un sistema de control para admins dentro de Discord
- guarda datos en SQLite
- usa un sistema de privacidad basado en consentimiento

## Por qué es diferente

Archivist está hecho para ser útil sin volverse pesado.  
No intenta hacer de todo. Se centra en mensajes memorables, controles claros y privacidad tratada con cuidado.

## Features

### Highlights

Archivist puntúa mensajes usando reacciones, sentimiento, palabras clave y contexto.  
Cuando un mensaje supera el umbral, puede convertirse en highlight. Si luego cambian las reacciones o el contenido, el highlight puede subir o bajar automáticamente.

### Moment of the Day

Archivist puede elegir cada día un mensaje guardado destacado y publicarlo como Moment of the Day.

### Weekly Recap

Archivist puede publicar un Weekly Recap para que los mejores momentos de la semana sean fáciles de revisitar.

### Privacy

Archivist usa un sistema de privacidad basado en consentimiento.  
Los usuarios pueden dar su consentimiento, revisar su estado o borrar sus datos guardados.

### Admin Control

Los admins tienen un sistema de control dentro de Discord para vista general, inspección, umbrales, publicaciones recurrentes, salud del sistema y canales.

## Commands

Los comandos están en inglés.

```text
/help
/analyze
/privacy consent
/privacy status
/privacy delete
/archivist overview
/archivist leaderboard
/archivist points
/archivist threshold
/archivist autopost
/archivist channel
/archivist privacy
/archivist health
/archivist inspect
/archivist weekly
/archivist motd
/archivist backup
/archivist clear
/weekly
```

## Setup Tutorial

1. Clona el repositorio en tu computadora.

```bash
git clone <repository-url>
cd discord-bot-archivist
```

2. Instala las dependencias.

```bash
npm install
```

3. Crea un archivo llamado `.env` dentro de la carpeta del proyecto.

4. Pon esto dentro del archivo `.env`:

```env
DISCORD_TOKEN=your_bot_token_here
DEV_GUILD_ID=your_server_id_here
```

5. Inicia el bot.

```bash
node index.js
```

6. En Discord, ejecuta:

```text
/archivist overview
```

Qué significan esos valores:

- `DISCORD_TOKEN` es el token de tu bot en el Discord Developer Portal
- `DEV_GUILD_ID` es el ID de tu servidor de Discord y ayuda a que los comandos aparezcan más rápido durante pruebas
- los comandos están en inglés
- el bot necesita permisos para leer mensajes, enviar mensajes y usar slash commands

## Troubleshooting

- **¿El bot no responde?** Asegúrate de que el bot esté ejecutándose y esté invitado al servidor correcto
- **¿Los comandos no aparecen?** Espera un momento y vuelve a iniciar el bot
- **¿Token incorrecto?** Revisa el valor de `DISCORD_TOKEN` en tu `.env`
- **¿Faltan permisos?** El bot necesita leer mensajes, enviar mensajes y usar slash commands

## Invite
[Invite Archivist](#)

## 🤝 Contributing

Las contribuciones, ideas y mejoras son bienvenidas.  
Si quieres, haz un fork del proyecto y construye algo encima.
