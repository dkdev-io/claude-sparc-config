/**
 * Task Management System with Verification Agent
 * Main integration module
 */

const TaskVerificationManager = require('./TaskVerificationManager');
const VerificationAgent = require('./VerificationAgent');

class TaskManagementSystem {
  constructor(config = {}) {
    this.config = {
      enableVerification: config.enableVerification !== false,
      autoVerifyOnComplete: config.autoVerifyOnComplete !== false,
      strictMode: config.strictMode || true,
      ...config
    };

    // Initialize verification manager
    this.verificationManager = new TaskVerificationManager({
      autoVerify: this.config.autoVerifyOnComplete,
      blockOnFailure: this.config.strictMode,
      taskManager: this,
      agentConfig: {
        strictMode: this.config.strictMode,
        autoFix: config.autoFix || false
      }
    });

    // Task storage
    this.tasks = new Map();
    this.taskHistory = [];
    
    // Setup event listeners
    this.setupEventListeners();
  }

  /**
   * Create a new task
   */
  createTask(taskData) {
    const task = {
      id: this.generateTaskId(),
      description: taskData.description,
      status: 'pending',
      createdAt: Date.now(),
      ...taskData
    };

    this.tasks.set(task.id, task);
    
    if (this.config.enableVerification && taskData.requiresVerification !== false) {
      task.verificationRequired = true;
    }

    return task;
  }

  /**
   * Mark task as in progress
   */
  startTask(taskId) {
    const task = this.tasks.get(taskId);
    
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    if (this.isTaskBlocked(taskId)) {
      throw new Error(`Task ${taskId} is blocked due to verification failure`);
    }

    task.status = 'in_progress';
    task.startedAt = Date.now();
    
    return task;
  }

  /**
   * Complete a task (with automatic verification)
   */
  async completeTask(taskId, completionData = {}) {
    const task = this.tasks.get(taskId);
    
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    // Enrich task with completion data for verification
    const enrichedTask = {
      ...task,
      ...completionData,
      completedAt: Date.now()
    };

    // Run verification if enabled
    if (this.config.enableVerification && task.verificationRequired) {
      const verificationResult = await this.verificationManager.forceVerify(
        taskId,
        enrichedTask
      );

      if (!verificationResult.verified) {
        // Task failed verification
        task.status = 'verification_failed';
        task.verificationResult = verificationResult;
        
        if (this.config.strictMode) {
          throw new Error(
            `Task ${taskId} failed verification. ` +
            `Confidence: ${verificationResult.confidence}%. ` +
            `Issues: ${verificationResult.recommendations.map(r => r.message).join(', ')}`
          );
        }
        
        return {
          success: false,
          task,
          verificationResult,
          message: 'Task completed but failed verification'
        };
      }

      // Task passed verification
      task.verificationResult = verificationResult;
    }

    // Mark task as complete
    task.status = 'completed';
    task.completedAt = Date.now();
    
    // Add to history
    this.taskHistory.push({
      ...task,
      completedAt: task.completedAt
    });

    return {
      success: true,
      task,
      verificationResult: task.verificationResult,
      message: 'Task completed and verified successfully'
    };
  }

  /**
   * Mark task as complete (called by verification manager)
   */
  markComplete(taskId, verificationData) {
    const task = this.tasks.get(taskId);
    
    if (task) {
      task.status = 'completed';
      task.completedAt = Date.now();
      task.verificationData = verificationData;
    }
  }

  /**
   * Mark task as pending (called by verification manager)
   */
  markPending(taskId, issueData) {
    const task = this.tasks.get(taskId);
    
    if (task) {
      task.status = 'pending';
      task.verificationIssues = issueData;
    }
  }

  /**
   * Check if task is blocked
   */
  isTaskBlocked(taskId) {
    const status = this.verificationManager.getVerificationStatus(taskId);
    return status.blocked;
  }

  /**
   * Setup event listeners for verification events
   */
  setupEventListeners() {
    this.verificationManager.on('verification:success', ({ task, result }) => {
      console.log(`✅ Task ${task.id} verified successfully (${result.confidence}% confidence)`);
    });

    this.verificationManager.on('verification:failed', ({ task, result }) => {
      console.error(`❌ Task ${task.id} verification failed`);
      console.error('Recommendations:', result.recommendations);
    });

    this.verificationManager.on('task:blocked', ({ task, reason, recommendations }) => {
      console.warn(`⚠️ Task ${task.id} blocked: ${reason}`);
      recommendations.forEach(rec => {
        console.warn(`  - ${rec.type}: ${rec.message}`);
      });
    });

    this.verificationManager.on('autofix:applied', ({ task, fix }) => {
      console.log(`🔧 Auto-fix applied for task ${task.id}:`, fix.action);
    });

    this.verificationManager.on('verification:error', ({ task, error }) => {
      console.error(`❗ Verification error for task ${task.id}:`, error.message);
    });
  }

  /**
   * Get task by ID
   */
  getTask(taskId) {
    return this.tasks.get(taskId);
  }

  /**
   * Get all tasks
   */
  getAllTasks() {
    return Array.from(this.tasks.values());
  }

  /**
   * Get tasks by status
   */
  getTasksByStatus(status) {
    return Array.from(this.tasks.values()).filter(task => task.status === status);
  }

  /**
   * Get verification report for a task
   */
  getVerificationReport(taskId) {
    return this.verificationManager.getVerificationStatus(taskId);
  }

  /**
   * Get all blocked tasks
   */
  getBlockedTasks() {
    return this.verificationManager.getBlockedTasks();
  }

  /**
   * Force unblock a task
   */
  unblockTask(taskId) {
    return this.verificationManager.unblockTask(taskId);
  }

  /**
   * Get system statistics
   */
  getStatistics() {
    const totalTasks = this.tasks.size;
    const completed = this.getTasksByStatus('completed').length;
    const inProgress = this.getTasksByStatus('in_progress').length;
    const pending = this.getTasksByStatus('pending').length;
    const failed = this.getTasksByStatus('verification_failed').length;
    
    const verificationStats = this.verificationManager.getStatistics();

    return {
      tasks: {
        total: totalTasks,
        completed,
        inProgress,
        pending,
        failed,
        completionRate: totalTasks > 0 ? 
          (completed / totalTasks * 100).toFixed(2) + '%' : 'N/A'
      },
      verification: verificationStats
    };
  }

  /**
   * Generate unique task ID
   */
  generateTaskId() {
    return `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

// Export all components
module.exports = {
  TaskManagementSystem,
  TaskVerificationManager,
  VerificationAgent
};