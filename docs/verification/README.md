# Task Verification System

## Overview

The Task Verification System is an intelligent subagent that automatically tests and verifies task completion to prevent hallucinations and ensure features actually work before marking them as complete.

## Key Features

### 🛡️ Hallucination Prevention
- Detects impossible claims and contradictions
- Validates references against actual codebase
- Identifies non-existent features claimed as complete

### ✅ Comprehensive Verification
- **Existence Check**: Verifies files and directories exist
- **Functionality Check**: Tests that features actually work
- **Test Coverage**: Ensures adequate testing
- **Integration Check**: Validates build and lint success
- **Performance Check**: Measures against requirements
- **Hallucination Detection**: Identifies false claims

### 🔧 Auto-Fix Capabilities
- Creates missing files with templates
- Runs lint auto-fix commands
- Attempts to resolve common issues
- Retries verification after fixes

### 📊 Detailed Reporting
- Generates verification reports for each task
- Provides confidence scores (0-100%)
- Offers actionable recommendations
- Tracks verification history and statistics

## Installation

```javascript
const { TaskManagementSystem } = require('./src/verification');

const taskManager = new TaskManagementSystem({
  enableVerification: true,
  autoVerifyOnComplete: true,
  strictMode: true,
  autoFix: true
});
```

## Usage

### Creating Tasks

```javascript
const task = taskManager.createTask({
  description: 'Implement user authentication',
  files: ['src/auth/login.js', 'src/auth/register.js'],
  testCommand: 'npm test -- src/auth',
  endpoints: [
    { url: '/api/auth/login', method: 'POST' },
    { url: '/api/auth/register', method: 'POST' }
  ],
  requiresVerification: true
});
```

### Completing Tasks with Verification

```javascript
try {
  const result = await taskManager.completeTask(task.id, {
    implementedFiles: ['src/auth/login.js'],
    testsWritten: true
  });

  if (result.success) {
    console.log('Task verified and completed!');
    console.log(`Confidence: ${result.verificationResult.confidence}%`);
  }
} catch (error) {
  console.error('Verification failed:', error.message);
}
```

### Handling Blocked Tasks

```javascript
// Get blocked tasks
const blockedTasks = taskManager.getBlockedTasks();

blockedTasks.forEach(blocked => {
  console.log(`Task ${blocked.taskId} blocked`);
  blocked.recommendations.forEach(rec => {
    console.log(`Fix: ${rec.action}`);
  });
});

// Unblock after fixing issues
taskManager.unblockTask(taskId);
```

## Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enableVerification` | boolean | true | Enable verification system |
| `autoVerifyOnComplete` | boolean | true | Auto-verify when completing tasks |
| `strictMode` | boolean | true | Block tasks that fail verification |
| `autoFix` | boolean | false | Attempt automatic fixes |
| `maxRetries` | number | 3 | Maximum verification retry attempts |
| `verificationThreshold` | number | 80 | Minimum confidence score to pass |
| `timeout` | number | 30000 | Verification timeout in ms |

## Verification Pipeline

1. **Existence Verification** (10 points)
   - Checks if claimed files exist
   - Validates directory structure

2. **Functionality Verification** (20 points)
   - Runs test commands
   - Tests API endpoints
   - Validates expected behaviors

3. **Test Coverage** (15 points)
   - Checks for test files
   - Runs test suites
   - Validates test results

4. **Integration Check** (15 points)
   - Runs build process
   - Checks linting
   - Validates compilation

5. **Hallucination Detection** (20 points)
   - Detects impossible claims
   - Validates references
   - Finds contradictions

6. **Performance Check** (10 points)
   - Measures against requirements
   - Validates performance thresholds

## Events

The system emits various events for monitoring:

```javascript
verificationManager.on('verification:success', ({ task, result }) => {
  console.log(`Task ${task.id} verified (${result.confidence}%)`);
});

verificationManager.on('verification:failed', ({ task, result }) => {
  console.error(`Task ${task.id} failed verification`);
});

verificationManager.on('task:blocked', ({ task, recommendations }) => {
  console.warn(`Task ${task.id} blocked`);
});

verificationManager.on('autofix:applied', ({ task, fix }) => {
  console.log(`Auto-fix applied: ${fix.action}`);
});
```

## Statistics

Get comprehensive statistics:

```javascript
const stats = taskManager.getStatistics();

console.log('Tasks:', stats.tasks);
// { total, completed, inProgress, pending, failed, completionRate }

console.log('Verification:', stats.verification);
// { total, passed, failed, passRate, avgConfidence, hallucinationsDetected }
```

## Best Practices

1. **Define Clear Requirements**: Specify expected files, tests, and behaviors
2. **Use Strict Mode**: Block incomplete tasks in production
3. **Enable Auto-Fix**: Let the system attempt common fixes
4. **Monitor Events**: Track verification failures and blocked tasks
5. **Review Reports**: Analyze verification reports for patterns
6. **Set Appropriate Thresholds**: Adjust confidence requirements per project

## Example Task Definition

```javascript
{
  description: 'Implement shopping cart feature',
  
  // Expected files to create
  files: [
    'src/cart/CartManager.js',
    'src/cart/CartItem.js',
    'tests/cart.test.js'
  ],
  
  // Expected directories
  directories: ['src/cart', 'tests'],
  
  // Test command to verify
  testCommand: 'npm test -- tests/cart.test.js',
  
  // API endpoints to test
  endpoints: [
    { url: '/api/cart/add', method: 'POST' },
    { url: '/api/cart/remove', method: 'DELETE' },
    { url: '/api/cart/items', method: 'GET' }
  ],
  
  // Expected behaviors
  behaviors: [
    {
      name: 'Add item to cart',
      testScript: 'node -e "require(\'./src/cart\').add({id: 1})"',
      expectedOutput: 'success'
    }
  ],
  
  // Performance requirements
  performanceRequirements: [
    { name: 'Response time', threshold: 200 },
    { name: 'Memory usage', threshold: 50 }
  ],
  
  // Claims to validate
  claims: [
    { description: 'Supports 1000 concurrent users' },
    { description: 'ACID transaction support' }
  ]
}
```

## Troubleshooting

### Task Keeps Failing Verification

1. Check the verification report for specific issues
2. Review recommendations provided
3. Ensure all expected files are created
4. Verify tests are passing
5. Check for build/lint errors

### False Positives in Hallucination Detection

1. Review the claims being made
2. Ensure descriptions are accurate
3. Avoid contradictory statements
4. Use realistic performance claims

### Auto-Fix Not Working

1. Check file permissions
2. Ensure npm scripts are defined
3. Review auto-fix logs in events
4. Manually fix critical issues first

## Contributing

To extend the verification system:

1. Add new check types in `runVerificationPipeline()`
2. Implement check logic as new methods
3. Update scoring and recommendations
4. Add appropriate event emissions
5. Update documentation

## License

MIT