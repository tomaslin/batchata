const puppeteer = require('puppeteer');

class GrokService {
  constructor(config) {
    this.config = config;
    this.browser = null;
  }

  async initBrowser() {
    if (!this.browser) {
      const browserConfig = {
        ...this.config,
        executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
      };
      this.browser = await puppeteer.launch(browserConfig);
    }
    return this.browser;
  }

  async initializeConversation() {
    await this.initBrowser();
    const page = await this.browser.newPage();
    if (!page.initialized) {
      await page.goto('https://grok.com');
      await page.waitForSelector('div[class*="ring-input-border"]');
      page.initialized = true;
    }
    return page;
  }

  async sendMessage(page, message) {
    await this.initializeConversation(page);
    
    const textareaSelector = 'textarea.w-full';
    await page.waitForSelector(textareaSelector);
    await page.focus(textareaSelector);
    await page.keyboard.type(message);
    await page.keyboard.press('Enter');

    // Wait for and capture the response
    let previousResponseText = '';
    let responseStableCount = 0;
    const maxWaitTime = 20000;
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitTime) {
      const currentResponseText = await page.evaluate(() => {
        const elements = document.querySelectorAll('div.relative.group.flex.flex-col.justify-center.w-full.max-w-3xl.md\\:px-4.pb-2.message-row.items-start');
        if (elements.length === 0) return '';
        const lastElement = elements[elements.length - 1];
        const proseElements = lastElement.querySelectorAll('.prose p, .prose li');
        return Array.from(proseElements)
          .map(el => el.textContent.trim())
          .filter(text => text)
          .join('\n');
      });

      if (currentResponseText === previousResponseText && currentResponseText !== '') {
        responseStableCount++;
        if (responseStableCount >= 3) {
          return currentResponseText;
        }
      } else {
        responseStableCount = 0;
        previousResponseText = currentResponseText;
      }

      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    return previousResponseText || 'No response received';
  }

  async closePage(page) {
    if (page) {
      await page.close();
    }
  }

  async cleanup() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}

module.exports = GrokService;