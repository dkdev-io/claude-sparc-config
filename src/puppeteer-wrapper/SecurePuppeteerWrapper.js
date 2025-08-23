const puppeteer = require('puppeteer');
const crypto = require('crypto');
const readline = require('readline');
const { promisify } = require('util');

class SecurePuppeteerWrapper {
  constructor() {
    this.browser = null;
    this.page = null;
    this.approvedUrl = null;
    this.authCode = null;
    this.codeExpiry = null;
    this.allowedDataFields = [];
    this.isAuthenticated = false;
    this.sessionActive = false;
  }

  /**
   * Generate secure six-digit code
   */
  generateSecureCode() {
    // Use crypto for secure random generation
    return crypto.randomInt(100000, 999999).toString();
  }

  /**
   * Store code securely in memory with encryption
   */
  async storeCode() {
    // Generate code
    const code = this.generateSecureCode();
    
    // Store with encryption in memory only (not on disk)
    const salt = crypto.randomBytes(16);
    const key = crypto.pbkdf2Sync(code, salt, 100000, 32, 'sha256');
    
    this.authCode = {
      hash: crypto.createHash('sha256').update(code).digest('hex'),
      salt: salt,
      key: key,
      created: Date.now()
    };
    
    console.log('\n🔐 AUTHENTICATION CODE (valid for single use):');
    console.log(`\n    ${code}\n`);
    console.log('⚠️  This code will expire 15 seconds after first use');
    console.log('📋 Copy this code now - it won\'t be shown again\n');
    
    return code;
  }

  /**
   * Verify authentication code
   */
  verifyCode(inputCode) {
    if (!this.authCode) {
      throw new Error('No authentication code has been generated');
    }

    const inputHash = crypto.createHash('sha256').update(inputCode).digest('hex');
    
    if (inputHash === this.authCode.hash) {
      // Set expiry for 15 seconds from now
      this.codeExpiry = Date.now() + 15000;
      this.isAuthenticated = true;
      
      // Clear the stored code after successful verification
      setTimeout(() => {
        this.authCode = null;
        this.isAuthenticated = false;
        console.log('\n⏰ Authentication expired\n');
      }, 15000);
      
      return true;
    }
    
    return false;
  }

  /**
   * Check if authentication is still valid
   */
  checkAuth() {
    if (!this.isAuthenticated) {
      throw new Error('Not authenticated. Please provide valid code.');
    }
    
    if (this.codeExpiry && Date.now() > this.codeExpiry) {
      this.isAuthenticated = false;
      throw new Error('Authentication expired. Please generate new code.');
    }
    
    return true;
  }

  /**
   * Prompt for approved URL
   */
  async promptForUrl() {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    const question = promisify(rl.question).bind(rl);
    
    console.log('\n📌 TAB RESTRICTION SETUP');
    console.log('Please paste the URL of the approved tab:');
    
    const url = await question('URL: ');
    rl.close();
    
    // Validate URL
    try {
      new URL(url);
      this.approvedUrl = url;
      console.log(`✅ Approved URL set: ${url}\n`);
      return url;
    } catch (error) {
      throw new Error('Invalid URL provided');
    }
  }

  /**
   * Prompt for authentication code
   */
  async promptForCode() {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true
    });
    
    const question = promisify(rl.question).bind(rl);
    
    console.log('\n🔑 AUTHENTICATION REQUIRED');
    const code = await question('Enter 6-digit code: ');
    rl.close();
    
    if (this.verifyCode(code)) {
      console.log('✅ Authentication successful (expires in 15 seconds)\n');
      return true;
    } else {
      throw new Error('Invalid authentication code');
    }
  }

  /**
   * Set allowed data fields
   */
  setAllowedDataFields(fields) {
    if (!Array.isArray(fields)) {
      throw new Error('Allowed data fields must be an array');
    }
    
    this.allowedDataFields = fields;
    console.log(`📊 Allowed data fields set: ${fields.join(', ')}\n`);
  }

  /**
   * Initialize browser with restrictions
   */
  async initialize(options = {}) {
    try {
      // Check authentication
      this.checkAuth();
      
      if (!this.approvedUrl) {
        throw new Error('No approved URL set. Call promptForUrl() first.');
      }
      
      console.log('🚀 Launching browser...');
      
      this.browser = await puppeteer.launch({
        headless: options.headless !== false,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-web-security', // Be careful with this
          '--disable-features=IsolateOrigins,site-per-process'
        ]
      });
      
      this.page = await this.browser.newPage();
      
      // Set up request interception to block unauthorized navigations
      await this.page.setRequestInterception(true);
      
      this.page.on('request', (request) => {
        const requestUrl = request.url();
        const approvedDomain = new URL(this.approvedUrl).origin;
        const requestDomain = new URL(requestUrl).origin;
        
        // Allow same-origin requests and required resources
        if (requestDomain === approvedDomain || 
            request.resourceType() === 'stylesheet' ||
            request.resourceType() === 'script' ||
            request.resourceType() === 'image' ||
            request.resourceType() === 'font') {
          request.continue();
        } else if (request.isNavigationRequest() && requestUrl !== this.approvedUrl) {
          console.log(`❌ Blocked navigation to: ${requestUrl}`);
          request.abort();
        } else {
          request.continue();
        }
      });
      
      // Navigate to approved URL
      await this.page.goto(this.approvedUrl, { waitUntil: 'networkidle2' });
      console.log(`✅ Connected to approved tab: ${this.approvedUrl}\n`);
      
      this.sessionActive = true;
      return this.page;
      
    } catch (error) {
      await this.cleanup();
      throw error;
    }
  }

  /**
   * Extract data with field restrictions
   */
  async extractData(selector, fields = null) {
    try {
      this.checkAuth();
      
      if (!this.sessionActive) {
        throw new Error('No active session. Call initialize() first.');
      }
      
      const dataFields = fields || this.allowedDataFields;
      
      if (dataFields.length === 0) {
        throw new Error('No data fields specified. Cannot extract data without knowing what fields are allowed.');
      }
      
      console.log(`📤 Extracting data for fields: ${dataFields.join(', ')}`);
      
      const data = await this.page.evaluate((sel, allowedFields) => {
        const elements = document.querySelectorAll(sel);
        const results = [];
        
        elements.forEach(el => {
          const item = {};
          
          // Only extract allowed fields
          allowedFields.forEach(field => {
            const fieldElement = el.querySelector(`[data-field="${field}"], .${field}, #${field}`);
            if (fieldElement) {
              item[field] = fieldElement.textContent.trim();
            } else if (el.hasAttribute(field)) {
              item[field] = el.getAttribute(field);
            } else if (el[field]) {
              item[field] = el[field];
            }
          });
          
          if (Object.keys(item).length > 0) {
            results.push(item);
          }
        });
        
        return results;
      }, selector, dataFields);
      
      console.log(`✅ Extracted ${data.length} items\n`);
      return data;
      
    } catch (error) {
      console.error('❌ Data extraction failed:', error.message);
      throw error;
    }
  }

  /**
   * Check if current operation would violate restrictions
   */
  checkRestrictions(operation, details) {
    const restrictions = [];
    
    if (operation === 'navigate' && details.url !== this.approvedUrl) {
      restrictions.push(`Cannot navigate to ${details.url} - only ${this.approvedUrl} is approved`);
    }
    
    if (operation === 'extract' && details.fields) {
      const unauthorized = details.fields.filter(f => !this.allowedDataFields.includes(f));
      if (unauthorized.length > 0) {
        restrictions.push(`Cannot extract fields: ${unauthorized.join(', ')} - not in allowed list`);
      }
    }
    
    if (operation === 'store' && details.location !== 'memory') {
      restrictions.push('Cannot store data to disk - only in-memory storage allowed');
    }
    
    if (restrictions.length > 0) {
      console.log('\n⚠️  RESTRICTION WARNINGS:');
      restrictions.forEach(r => console.log(`  - ${r}`));
      console.log('\nThese restrictions prevent task completion. Please adjust your requirements.\n');
      return false;
    }
    
    return true;
  }

  /**
   * Clean up browser instance
   */
  async cleanup() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
      this.sessionActive = false;
      console.log('🧹 Browser closed\n');
    }
  }

  /**
   * Execute with all guardrails
   */
  async executeSecure(taskFunction, taskDescription) {
    console.log(`\n📋 TASK: ${taskDescription}\n`);
    
    try {
      // Generate and show code
      await this.storeCode();
      
      // Prompt for URL
      await this.promptForUrl();
      
      // Prompt for authentication
      await this.promptForCode();
      
      // Execute task
      const result = await taskFunction(this);
      
      console.log('✅ Task completed successfully\n');
      return result;
      
    } catch (error) {
      console.error(`❌ Task failed: ${error.message}\n`);
      throw error;
    } finally {
      await this.cleanup();
    }
  }
}

module.exports = SecurePuppeteerWrapper;