const SecurePuppeteerWrapper = require('./SecurePuppeteerWrapper');

// Example 1: Simple data extraction with full security flow
async function extractUserData() {
  const wrapper = new SecurePuppeteerWrapper();
  
  await wrapper.executeSecure(async (secureWrapper) => {
    // Set allowed data fields based on your prompt requirements
    secureWrapper.setAllowedDataFields(['name', 'email', 'status']);
    
    // Initialize browser (will prompt for URL and code)
    const page = await secureWrapper.initialize();
    
    // Extract only allowed data
    const userData = await secureWrapper.extractData('.user-item', ['name', 'email']);
    
    console.log('Extracted data:', userData);
    return userData;
    
  }, 'Extract user information from approved webpage');
}

// Example 2: More complex interaction
async function performComplexTask() {
  const wrapper = new SecurePuppeteerWrapper();
  
  await wrapper.executeSecure(async (secureWrapper) => {
    // Agent must inform if restrictions prevent task completion
    if (!secureWrapper.checkRestrictions('extract', { fields: ['password', 'ssn'] })) {
      throw new Error('Task cannot be completed due to data restrictions');
    }
    
    secureWrapper.setAllowedDataFields(['title', 'description', 'price']);
    
    const page = await secureWrapper.initialize();
    
    // Wait for elements to load
    await page.waitForSelector('.product-list');
    
    // Click elements (restricted to approved tab)
    await page.click('.load-more-btn');
    await page.waitForTimeout(2000);
    
    // Extract allowed data only
    const products = await secureWrapper.extractData('.product-item');
    
    return products;
    
  }, 'Extract product information with pagination');
}

// Example 3: Error handling and restriction checking
async function attemptRestrictedAction() {
  const wrapper = new SecurePuppeteerWrapper();
  
  try {
    await wrapper.executeSecure(async (secureWrapper) => {
      secureWrapper.setAllowedDataFields(['public_info']);
      
      const page = await secureWrapper.initialize();
      
      // This will fail due to restrictions
      const restrictedData = await secureWrapper.extractData('.user', ['private_data']);
      
      return restrictedData;
      
    }, 'Attempt to extract restricted data');
    
  } catch (error) {
    console.log('Expected error due to restrictions:', error.message);
  }
}

// Usage patterns for different scenarios
module.exports = {
  extractUserData,
  performComplexTask,
  attemptRestrictedAction,
  
  // Quick usage function
  async quickExtract(selector, fields, taskDescription) {
    const wrapper = new SecurePuppeteerWrapper();
    return await wrapper.executeSecure(async (secureWrapper) => {
      secureWrapper.setAllowedDataFields(fields);
      const page = await secureWrapper.initialize();
      return await secureWrapper.extractData(selector, fields);
    }, taskDescription);
  }
};

// Run examples (uncomment to test)
// extractUserData().catch(console.error);
// performComplexTask().catch(console.error);
// attemptRestrictedAction().catch(console.error);