# Secure Puppeteer Wrapper

A secure wrapper for Puppeteer with authentication and access restrictions.

## Features

✅ **Tab Restriction**: Only operates on user-approved URLs  
✅ **Six-Digit Authentication**: Cryptographically secure codes  
✅ **15-Second Expiry**: Authentication expires automatically  
✅ **Data Field Limits**: Only extracts specified data fields  
✅ **Memory-Only Storage**: No disk persistence of sensitive data  
✅ **Agent Transparency**: Reports when restrictions prevent task completion  

## Quick Start

```javascript
const SecurePuppeteerWrapper = require('./SecurePuppeteerWrapper');

const wrapper = new SecurePuppeteerWrapper();

await wrapper.executeSecure(async (secureWrapper) => {
  // Set what data fields are allowed
  secureWrapper.setAllowedDataFields(['name', 'price', 'description']);
  
  // This will prompt for URL and authentication code
  const page = await secureWrapper.initialize();
  
  // Extract only allowed data
  const data = await secureWrapper.extractData('.item');
  
  return data;
}, 'Extract product information');
```

## Security Flow

1. **Code Generation**: System generates secure 6-digit code
2. **URL Prompt**: User pastes approved tab URL
3. **Authentication**: User enters 6-digit code
4. **Restricted Execution**: Only approved operations allowed
5. **Auto Cleanup**: Everything expires/cleans up in 15 seconds

## Installation

```bash
cd src/puppeteer-wrapper
npm install
```

## Usage Examples

### Basic Data Extraction
```javascript
const { quickExtract } = require('./example-usage');

const data = await quickExtract(
  '.product',  // CSS selector
  ['name', 'price'],  // Allowed fields
  'Extract product data'  // Task description
);
```

### Custom Workflow
```javascript
await wrapper.executeSecure(async (secureWrapper) => {
  // Check if your requirements violate restrictions
  if (!secureWrapper.checkRestrictions('extract', { fields: ['sensitive_field'] })) {
    throw new Error('Cannot complete - restricted data requested');
  }
  
  // Your task logic here
}, 'Your task description');
```

## Security Guarantees

- ✅ Code stored in memory only with encryption
- ✅ URLs restricted to user-approved domains
- ✅ Data extraction limited to specified fields
- ✅ 15-second authentication window
- ✅ No persistent storage of restricted data
- ⚠️  Restrictions are code-based (not OS-level)

## Agent Behavior

The wrapper will:
- Tell you if restrictions prevent task completion
- Show what fields are allowed vs requested
- Block navigation to unauthorized URLs
- Report when authentication expires
- Clean up automatically

## Error Messages

- `Not authenticated` - Need to provide 6-digit code
- `Authentication expired` - 15 seconds passed
- `Invalid URL provided` - URL format issue
- `Cannot extract fields: X` - Requested field not allowed
- `Blocked navigation to: X` - Tried to leave approved tab

## Best Practices

1. Always specify exact data fields needed
2. Keep sessions under 15 seconds
3. One task per authentication
4. Check restrictions before complex operations