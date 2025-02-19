const express = require('express');
const { v4: uuidv4 } = require('uuid');
const GeminiService = require('./services/gemini-service');
const GrokService = require('./services/grok-service');

const app = express();
app.use(express.json());

// Configuration
const config = {
  headless: false // can be set to false for visible browser
};

// Store active conversations and message queues
const conversations = new Map();
const messageQueues = new Map();
const processingStatus = new Map();
let geminiService = null;
let grokService = null;

// Helper function to process message queue
async function processMessageQueue(conversationId) {
  if (processingStatus.get(conversationId)) return;
  
  const queue = messageQueues.get(conversationId);
  if (!queue || queue.length === 0) return;
  
  processingStatus.set(conversationId, true);
  
  try {
    const conversation = conversations.get(conversationId);
    if (!conversation) return;
    
    while (queue.length > 0) {
      const { message, resolve, reject } = queue[0];
      try {
        const { page, serviceInstance } = conversation;
        const response = await serviceInstance.sendMessage(page, message);
        resolve({ status: 'completed', response });
      } catch (error) {
        reject(error);
      }
      queue.shift();
    }
  } finally {
    processingStatus.set(conversationId, false);
    if (queue.length > 0) {
      processMessageQueue(conversationId);
    }
  }
}

// Open browser endpoint
app.post('/browser/open', async (req, res) => {
  try {
    if (!geminiService) {
      geminiService = new GeminiService(config);
    }
    await geminiService.initializeConversation();
    res.json({ status: 'opened' });
  } catch (error) {
    console.error('Error opening browser:', error);
    res.status(500).json({ error: 'Failed to open browser' });
  }
});

// Open a new conversation
app.post('/conversation', async (req, res) => {
  const { service } = req.body;

  if (!service || !['gemini', 'grok'].includes(service)) {
    return res.status(400).json({ error: 'Valid service (gemini or grok) is required' });
  }

  try {
    let serviceInstance;
    if (service === 'gemini') {
      if (!geminiService) {
        geminiService = new GeminiService(config);
      }
      serviceInstance = geminiService;
    } else {
      if (!grokService) {
        grokService = new GrokService(config);
      }
      serviceInstance = grokService;
    }

    const page = await serviceInstance.initializeConversation();
    const conversationId = uuidv4();
    conversations.set(conversationId, { page, service, serviceInstance });
    messageQueues.set(conversationId, []);
    processingStatus.set(conversationId, false);
    
    res.json({ conversationId });
  } catch (error) {
    console.error('Error opening conversation:', error);
    res.status(500).json({ error: 'Failed to open conversation' });
  }
});

// Close a conversation
app.delete('/conversation/:id', async (req, res) => {
  const { id } = req.params;
  
  try {
    const conversation = conversations.get(id);
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }
    
    const { page, serviceInstance } = conversation;
    await serviceInstance.closePage(page);
    conversations.delete(id);
    messageQueues.delete(id);
    processingStatus.delete(id);
    
    // Clean up the service if no more conversations
    if (conversations.size === 0) {
      if (geminiService) {
        await geminiService.cleanup();
        geminiService = null;
      }
      if (grokService) {
        await grokService.cleanup();
        grokService = null;
      }
    }
    res.json({ status: 'closed' });
  } catch (error) {
    console.error('Error closing conversation:', error);
    res.status(500).json({ error: 'Failed to close conversation' });
  }
});

// Send message to conversation
app.post('/conversation/:id/message', async (req, res) => {
  const { id } = req.params;
  const { message } = req.body;
  
  if (!message) {
    return res.status(400).json({ error: 'Message is required' });
  }
  
  try {
    const conversation = conversations.get(id);
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }
    
    const queue = messageQueues.get(id);
    if (!queue) {
      return res.status(404).json({ error: 'Queue not found' });
    }

    const messagePromise = new Promise((resolve, reject) => {
      queue.push({ message, resolve, reject });
    });

    processMessageQueue(id);
    const result = await messagePromise;
    res.json(result);
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// Set headless mode
app.put('/config/headless', async (req, res) => {
  const { headless } = req.body;
  
  if (typeof headless !== 'boolean' && headless !== 'new') {
    return res.status(400).json({ error: 'Invalid headless value' });
  }
  
  try {
    // Close all existing conversations and cleanup services
    for (const [id, conversation] of conversations) {
      const { page, serviceInstance } = conversation;
      await serviceInstance.closePage(page);
      conversations.delete(id);
    }
    
    if (geminiService) {
      await geminiService.cleanup();
      geminiService = null;
    }
    if (grokService) {
      await grokService.cleanup();
      grokService = null;
    }
    
    // Update the configuration
    config.headless = headless;
    
    res.json({ status: 'updated' });
  } catch (error) {
    console.error('Error updating headless mode:', error);
    res.status(500).json({ error: 'Failed to update headless mode' });
  }
});

const PORT = process.env.PORT || 3001;
// Stop service endpoint
app.post('/service/stop', async (req, res) => {
  try {
    // Close all existing conversations and cleanup services
    for (const [id, conversation] of conversations) {
      const { page, serviceInstance } = conversation;
      await serviceInstance.closePage(page);
      conversations.delete(id);
    }
    
    if (geminiService) {
      await geminiService.cleanup();
      geminiService = null;
    }
    if (grokService) {
      await grokService.cleanup();
      grokService = null;
    }

    res.json({ status: 'stopped' });
    
    // Give time for the response to be sent before shutting down
    setTimeout(() => {
      process.exit(0);
    }, 100);
  } catch (error) {
    console.error('Error stopping service:', error);
    res.status(500).json({ error: 'Failed to stop service' });
  }
});

const server = app.listen(PORT, () => {
  console.log(`Conversation service listening on port ${PORT}`);
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
  server.close();
});