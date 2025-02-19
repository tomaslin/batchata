#!/usr/bin/env node

const axios = require('axios');
const yargs = require('yargs');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:3001';
const STATE_FILE = path.join(__dirname, '.conversation-state.json');

// Load conversation state from file
function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    }
  } catch (error) {
    console.error('Error loading state:', error.message);
  }
  return { gemini: null, grok: null };
}

// Save conversation state to file
function saveState(state) {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } catch (error) {
    console.error('Error saving state:', error.message);
  }
}

// Store active conversation IDs
const activeConversations = loadState();

// Helper function to configure headless mode
async function configureHeadless(mode) {
  await callApi('PUT', '/config/headless', { headless: mode });
  console.log(`Headless mode ${mode ? 'enabled' : 'disabled'} successfully`);
}

// Helper function to make API calls
async function callApi(method, endpoint, data = null) {
  try {
    const config = {
      method,
      url: `${BASE_URL}${endpoint}`,
      ...(data && { data })
    };
    try {
      const response = await axios(config);
      return response.data;
    } catch (error) {
      if (error.code === 'ECONNREFUSED') {
        console.log('Conversation service not running. Starting it now...');
        const { spawn } = require('child_process');
        const serviceProcess = spawn('node', ['conversation-service.js'], {
          detached: true,
          stdio: 'ignore'
        });
        serviceProcess.unref();
        
        // Wait for the service to start
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Retry the request
        const retryResponse = await axios(config);
        return retryResponse.data;
      }
      throw error;
    }
  } catch (error) {
    console.error('Error:', error.response?.data?.error || error.message);
    process.exit(1);
  }
}

// Command handlers
async function openBrowser() {
  await callApi('POST', '/browser/open');
  console.log('Browser opened successfully');
}

async function startConversation(service) {
  if (activeConversations[service]) {
    console.log(`${service} conversation is already active`);
    return;
  }
  const response = await callApi('POST', '/conversation', { service });
  activeConversations[service] = response.conversationId;
  saveState(activeConversations);
  console.log(`${service} conversation started with ID: ${response.conversationId}`);
}

async function closeConversation(service) {
  const conversationId = activeConversations[service];
  if (!conversationId) {
    console.log(`No active ${service} conversation`);
    return;
  }
  await callApi('DELETE', `/conversation/${conversationId}`);
  activeConversations[service] = null;
  saveState(activeConversations);
  console.log(`${service} conversation closed`);
}

async function sendMessage(service, message) {
  const conversationId = activeConversations[service];
  if (!conversationId) {
    console.log(`No active ${service} conversation. Start one first with start-${service}`);
    return;
  }
  const response = await callApi('POST', `/conversation/${conversationId}/message`, { message });
  console.log(response.response);
}

// Command line interface setup
yargs
  .command('open-browser', 'Open the browser instance', {}, openBrowser)
  .command('start-gemini', 'Start a new Gemini conversation', {}, () => startConversation('gemini'))
  .command('start-grok', 'Start a new Grok conversation', {}, () => startConversation('grok'))
  .command('close-gemini', 'Close the active Gemini conversation', {}, () => closeConversation('gemini'))
  .command('close-grok', 'Close the active Grok conversation', {}, () => closeConversation('grok'))
  .command('converse-gemini <message>', 'Send a message to Gemini', {
    message: {
      describe: 'Message to send',
      demandOption: true,
      type: 'string'
    }
  }, (argv) => sendMessage('gemini', argv.message))
  .command('converse-grok <message>', 'Send a message to Grok', {
    message: {
      describe: 'Message to send',
      demandOption: true,
      type: 'string'
    }
  }, (argv) => sendMessage('grok', argv.message))
  .command('headless <mode>', 'Configure browser headless mode', {
    mode: {
      describe: 'Enable or disable headless mode',
      demandOption: true,
      type: 'boolean'
    }
  }, (argv) => configureHeadless(argv.mode))
  .argv;