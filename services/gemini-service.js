const puppeteer = require('puppeteer');
const path = require('path');

class GeminiService {
  constructor(config) {
    this.config = config;
    this.browser = null;
  }

  async initBrowser() {
    if (!this.browser) {
      const browserConfig = {
        ...this.config,
        executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        userDataDir: path.join(process.cwd(), 'chrome-profile') // Load profile for Gemini
      };

      console.log(browserConfig);
      this.browser = await puppeteer.launch(browserConfig);
    }
    return this.browser;
  }

  async initializeConversation() {
    await this.initBrowser();
    const page = await this.browser.newPage();
    if (!page.initialized) {
      await page.goto('https://gemini.google.com/app');
      await page.waitForSelector('button.bard-mode-menu-button');
      await page.click('button.bard-mode-menu-button');
      await new Promise(resolve => setTimeout(resolve, 1000));

      await page.waitForSelector('.mat-bottom-sheet-container button.mat-mdc-menu-item');
      const buttons = await page.$$('.mat-bottom-sheet-container button.mat-mdc-menu-item');
      for (const button of buttons) {
        const text = await button.evaluate(el => el.textContent);
        if (text.includes('2.0 Flash Thinking Experimental with apps')) {
          await button.click();
          break;
        }
      }
      await new Promise(resolve => setTimeout(resolve, 2000));

      await page.waitForFunction(() => {
        const modeText = document.querySelector('.current-mode-title span')?.textContent;
        return modeText?.includes('2.0 Flash Thinking Experimental with apps');
      });

      await page.waitForSelector('.ql-editor');
      page.initialized = true;
    }
    return page;
  }

  async sendMessage(page, message) {
    // Get initial count of completed responses
    const initialCount = await page.evaluate(() => {
      return document.querySelectorAll('div.avatar_primary_animation.is-gpi-avatar[data-test-lottie-animation-status="completed"]').length;
    });

    await page.evaluate((text) => {
      const editor = document.querySelector('.ql-editor');
      editor.textContent = text;
      editor.dispatchEvent(new Event('input', { bubbles: true }));
    }, message);

    await page.keyboard.press('Enter');

    // Wait for a new response to complete with increased timeout and improved detection
    await page.waitForFunction((prevCount) => {
      const completedDivs = document.querySelectorAll('div.avatar_primary_animation.is-gpi-avatar[data-test-lottie-animation-status="completed"]');
      const responseElements = document.querySelectorAll('.model-response-text');
      return completedDivs.length > prevCount || (responseElements.length > 0 && responseElements[responseElements.length - 1].textContent.trim().length > 0);
    }, { timeout: 120000 }, initialCount);

    // Add a small delay to ensure response is fully loaded
    await page.waitForTimeout(1000);

    // Capture the response text
    const response = await page.evaluate(() => {
      const responseElements = document.querySelectorAll('.model-response-text');
      const responses = Array.from(responseElements).reverse();
      for (const response of responses) {
        const paragraphs = Array.from(response.querySelectorAll('p'))
          .map(p => p.textContent.trim())
          .filter(p => p.length > 0)
          .join('\n\n');
        
        const content = paragraphs || response.textContent.trim();
        if (content) return content;
      }
      return '';
    });

    return response;
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

module.exports = GeminiService;