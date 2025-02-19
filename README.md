# Batchata - AI Chat CLI Tool

Batchata is a command-line interface tool for interacting with Gemini and Grok AI chat services through a browser automation interface.

## Installation

```bash
npm install
```

## Starting the Service

1. Start the conversation service:
```bash
node conversation-service.js
```
The service will start on port 3001 by default.

2. Use the CLI tool to interact with the service.

## CLI Commands

### Browser Management

```bash
# Open the browser instance
batchata open-browser

# Configure browser headless mode
batchata headless true  # Enable headless mode
batchata headless false # Disable headless mode

# Stop the server and delete the .json file keeping track of stff
batchata reset
```

### Conversation Management

#### Gemini Commands
```bash
# Start a new Gemini conversation
batchata start-gemini

# Send a message to Gemini
batchata gemini "Your message here"

# Close the active Gemini conversation
batchata close-gemini
```

#### Grok Commands
```bash
# Start a new Grok conversation
batchata start-grok

# Send a message to Grok
batchata grok "Your message here"

# Close the active Grok conversation
batchata close-grok
```

## API Endpoints

The conversation service exposes the following REST endpoints:

### Browser Management
- `POST /browser/open` - Opens a new browser instance

### Conversation Management
- `POST /conversation` - Start a new conversation
  - Body: `{ "service": "gemini" | "grok" }`
  - Returns: `{ "conversationId": "uuid" }`

- `DELETE /conversation/:id` - Close a specific conversation
  - Returns: `{ "status": "closed" }`

- `POST /conversation/:id/message` - Send a message to a conversation
  - Body: `{ "message": "string" }`
  - Returns: `{ "status": "sent" }`

### Configuration
- `PUT /config/headless` - Configure browser headless mode
  - Body: `{ "headless": boolean | "new" }`
  - Returns: `{ "status": "updated" }`

## Notes

- The service uses Puppeteer for browser automation
- Only one active conversation per service (Gemini/Grok) is supported at a time
- The browser can be run in headless or visible mode
- Default port is 3001, can be changed via PORT environment variable