/**
 * Task Verification Manager - Orchestrates verification workflow
 */

const VerificationAgent = require('./VerificationAgent');
const EventEmitter = require('events');

class TaskVerificationManager extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      autoVerify: config.autoVerify !== false,
      blockOnFailure: config.blockOnFailure !== false,
      retryOnFailure: config.retryOnFailure || true,
      maxRetries: config.maxRetries || 3,
      verificationThreshold: config.verificationThreshold || 80,
      ...config
    };

    this.verificationAgent = new VerificationAgent(config.agentConfig);
    this.taskQueue = [];
    this.verificationResults = new Map();
    this.blockedTasks = new Set();
    this.isProcessing = false;
  }

  /**
   * Add task to verification queue
   */
  async queueTaskForVerification(task) {
    const enrichedTask = this.enrichTaskWithMetadata(task);
    
    this.taskQueue.push(enrichedTask);
    this.emit('task:queued', enrichedTask);

    if (this.config.autoVerify && !this.isProcessing) {
      this.processVerificationQueue();
    }

    return enrichedTask.id;
  }

  /**
   * Process verification queue
   */
  async processVerificationQueue() {
    if (this.isProcessing || this.taskQueue.length === 0) {
      return;
    }

    this.isProcessing = true;
    
    while (this.taskQueue.length > 0) {
      const task = this.taskQueue.shift();
      
      try {
        await this.verifyTaskWithRetries(task);
      } catch (error) {
        this.emit('verification:error', { task, error });
      }
    }

    this.isProcessing = false;
    this.emit('queue:processed');
  }

  /**
   * Verify task with retry logic
   */
  async verifyTaskWithRetries(task) {
    let attempts = 0;
    let lastResult = null;

    while (attempts < this.config.maxRetries) {
      attempts++;
      
      this.emit('verification:start', { task, attempt: attempts });
      
      const result = await this.verificationAgent.verifyTask(task);
      lastResult = result;

      if (result.verified && result.confidence >= this.config.verificationThreshold) {
        // Task verified successfully
        this.handleVerificationSuccess(task, result);
        return result;
      } else if (attempts < this.config.maxRetries && this.config.retryOnFailure) {
        // Attempt to fix issues before retry
        await this.attemptAutoFix(task, result);
        
        // Wait before retry
        await this.delay(1000 * attempts);
      }
    }

    // Verification failed after all retries
    this.handleVerificationFailure(task, lastResult);
    return lastResult;
  }

  /**
   * Handle successful verification
   */
  handleVerificationSuccess(task, result) {
    this.verificationResults.set(task.id, {
      status: 'verified',
      result,
      timestamp: Date.now()
    });

    this.emit('verification:success', { task, result });
    
    // Mark task as complete in task management system
    this.markTaskComplete(task, result);
    
    // Remove from blocked tasks if it was there
    this.blockedTasks.delete(task.id);
  }

  /**
   * Handle verification failure
   */
  handleVerificationFailure(task, result) {
    this.verificationResults.set(task.id, {
      status: 'failed',
      result,
      timestamp: Date.now()
    });

    this.emit('verification:failed', { task, result });

    if (this.config.blockOnFailure) {
      this.blockedTasks.add(task.id);
      this.emit('task:blocked', { 
        task, 
        reason: 'Verification failed',
        recommendations: result.recommendations 
      });
    }

    // Keep task in pending state
    this.markTaskPending(task, result);
  }

  /**
   * Attempt automatic fixes for common issues
   */
  async attemptAutoFix(task, verificationResult) {
    const fixes = [];
    
    for (const recommendation of verificationResult.recommendations || []) {
      if (recommendation.type === 'critical') {
        try {
          const fix = await this.applyAutoFix(recommendation, task);
          if (fix.success) {
            fixes.push(fix);
            this.emit('autofix:applied', { task, fix });
          }
        } catch (error) {
          this.emit('autofix:failed', { task, error, recommendation });
        }
      }
    }

    return fixes;
  }

  /**
   * Apply specific auto-fix
   */
  async applyAutoFix(recommendation, task) {
    const fix = {
      type: recommendation.type,
      action: recommendation.action,
      success: false,
      details: {}
    };

    switch (recommendation.action) {
      case 'Create missing resources or update task description':
        // Attempt to create missing files
        for (const detail of recommendation.details || []) {
          if (detail.file && !detail.exists) {
            try {
              await this.createMissingFile(detail.file, task);
              fix.details[detail.file] = 'created';
              fix.success = true;
            } catch (error) {
              fix.details[detail.file] = `failed: ${error.message}`;
            }
          }
        }
        break;

      case 'Fix build/lint errors before marking complete':
        // Attempt to run auto-fix commands
        try {
          const { exec } = require('child_process');
          const { promisify } = require('util');
          const execAsync = promisify(exec);
          
          await execAsync('npm run lint -- --fix');
          fix.success = true;
          fix.details.lint = 'auto-fixed';
        } catch (error) {
          fix.details.lint = `failed: ${error.message}`;
        }
        break;

      default:
        fix.details.message = 'No auto-fix available';
    }

    return fix;
  }

  /**
   * Create missing file with minimal template
   */
  async createMissingFile(filePath, task) {
    const fs = require('fs').promises;
    const path = require('path');
    
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
    
    const ext = path.extname(filePath);
    let content = '';
    
    switch (ext) {
      case '.js':
        content = `// Auto-generated file for: ${task.description}\n\nmodule.exports = {};\n`;
        break;
      case '.json':
        content = '{}';
        break;
      case '.md':
        content = `# ${path.basename(filePath, ext)}\n\nAuto-generated for: ${task.description}\n`;
        break;
      default:
        content = '';
    }
    
    await fs.writeFile(filePath, content);
  }

  /**
   * Mark task as complete
   */
  markTaskComplete(task, verificationResult) {
    // Integration point with task management system
    if (this.config.taskManager) {
      this.config.taskManager.markComplete(task.id, {
        verificationId: verificationResult.verification.id,
        confidence: verificationResult.confidence,
        verifiedAt: Date.now()
      });
    }
  }

  /**
   * Mark task as pending
   */
  markTaskPending(task, verificationResult) {
    // Integration point with task management system
    if (this.config.taskManager) {
      this.config.taskManager.markPending(task.id, {
        verificationFailed: true,
        issues: verificationResult.recommendations,
        lastVerificationId: verificationResult.verification.id
      });
    }
  }

  /**
   * Get verification status for a task
   */
  getVerificationStatus(taskId) {
    const result = this.verificationResults.get(taskId);
    const isBlocked = this.blockedTasks.has(taskId);
    
    return {
      taskId,
      verified: result?.status === 'verified',
      blocked: isBlocked,
      result: result?.result,
      timestamp: result?.timestamp
    };
  }

  /**
   * Get all blocked tasks
   */
  getBlockedTasks() {
    return Array.from(this.blockedTasks).map(taskId => {
      const result = this.verificationResults.get(taskId);
      return {
        taskId,
        reason: 'Verification failed',
        recommendations: result?.result?.recommendations || [],
        timestamp: result?.timestamp
      };
    });
  }

  /**
   * Force verification of a specific task
   */
  async forceVerify(taskId, taskData) {
    const task = taskData || { id: taskId, description: `Task ${taskId}` };
    return await this.verifyTaskWithRetries(task);
  }

  /**
   * Clear blocked status for a task
   */
  unblockTask(taskId) {
    const wasBlocked = this.blockedTasks.delete(taskId);
    
    if (wasBlocked) {
      this.emit('task:unblocked', { taskId });
    }
    
    return wasBlocked;
  }

  /**
   * Enrich task with verification metadata
   */
  enrichTaskWithMetadata(task) {
    return {
      ...task,
      id: task.id || this.generateTaskId(),
      queuedAt: Date.now(),
      verificationMetadata: {
        requiredChecks: ['existence', 'functionality', 'tests', 'integration'],
        expectedFiles: task.files || [],
        expectedDirectories: task.directories || [],
        testCommand: task.testCommand,
        endpoints: task.endpoints || [],
        behaviors: task.behaviors || [],
        performanceRequirements: task.performanceRequirements || [],
        claims: task.claims || []
      }
    };
  }

  /**
   * Generate unique task ID
   */
  generateTaskId() {
    return `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Utility delay function
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get verification statistics
   */
  getStatistics() {
    const agentStats = this.verificationAgent.getStatistics();
    const totalQueued = this.verificationResults.size;
    const verified = Array.from(this.verificationResults.values())
      .filter(r => r.status === 'verified').length;
    const failed = totalQueued - verified;
    const blocked = this.blockedTasks.size;

    return {
      ...agentStats,
      queued: this.taskQueue.length,
      totalProcessed: totalQueued,
      verified,
      failed,
      blocked,
      verificationRate: totalQueued > 0 ? 
        (verified / totalQueued * 100).toFixed(2) + '%' : 'N/A'
    };
  }
}

module.exports = TaskVerificationManager;