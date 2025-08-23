/**
 * Verification Agent - Automatic Task Completion Verification
 * Prevents hallucinations and ensures features work before marking complete
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const path = require('path');

const execAsync = promisify(exec);

class VerificationAgent {
  constructor(config = {}) {
    this.config = {
      maxRetries: config.maxRetries || 3,
      timeout: config.timeout || 30000,
      strictMode: config.strictMode !== false,
      autoFix: config.autoFix || false,
      reportPath: config.reportPath || './verification-reports',
      ...config
    };
    
    this.verificationHistory = [];
    this.hallucinationDetections = [];
    this.activeVerifications = new Map();
  }

  /**
   * Main verification entry point
   */
  async verifyTask(task) {
    const verificationId = this.generateVerificationId();
    const verification = {
      id: verificationId,
      taskId: task.id,
      taskDescription: task.description,
      startTime: Date.now(),
      status: 'running',
      checks: [],
      evidence: [],
      issues: []
    };

    this.activeVerifications.set(verificationId, verification);

    try {
      // Run verification pipeline
      const results = await this.runVerificationPipeline(task, verification);
      
      verification.status = results.passed ? 'passed' : 'failed';
      verification.endTime = Date.now();
      verification.duration = verification.endTime - verification.startTime;
      verification.results = results;

      // Store verification history
      this.verificationHistory.push(verification);
      
      // Generate report
      await this.generateVerificationReport(verification);

      return {
        verified: results.passed,
        confidence: results.confidence,
        verification,
        recommendations: results.recommendations
      };

    } catch (error) {
      verification.status = 'error';
      verification.error = error.message;
      verification.endTime = Date.now();
      
      this.verificationHistory.push(verification);
      
      return {
        verified: false,
        confidence: 0,
        verification,
        error: error.message
      };
    } finally {
      this.activeVerifications.delete(verificationId);
    }
  }

  /**
   * Core verification pipeline
   */
  async runVerificationPipeline(task, verification) {
    const checks = [];
    let totalScore = 0;
    let maxScore = 0;

    // 1. Existence Check
    const existenceCheck = await this.verifyExistence(task);
    checks.push(existenceCheck);
    totalScore += existenceCheck.score;
    maxScore += existenceCheck.maxScore;

    // 2. Functionality Check
    const functionalityCheck = await this.verifyFunctionality(task);
    checks.push(functionalityCheck);
    totalScore += functionalityCheck.score;
    maxScore += functionalityCheck.maxScore;

    // 3. Test Coverage Check
    const testCheck = await this.verifyTests(task);
    checks.push(testCheck);
    totalScore += testCheck.score;
    maxScore += testCheck.maxScore;

    // 4. Integration Check
    const integrationCheck = await this.verifyIntegration(task);
    checks.push(integrationCheck);
    totalScore += integrationCheck.score;
    maxScore += integrationCheck.maxScore;

    // 5. Hallucination Detection
    const hallucinationCheck = await this.detectHallucinations(task);
    checks.push(hallucinationCheck);
    totalScore += hallucinationCheck.score;
    maxScore += hallucinationCheck.maxScore;

    // 6. Performance Check
    const performanceCheck = await this.verifyPerformance(task);
    checks.push(performanceCheck);
    totalScore += performanceCheck.score;
    maxScore += performanceCheck.maxScore;

    verification.checks = checks;

    const confidence = (totalScore / maxScore) * 100;
    const passed = confidence >= (this.config.strictMode ? 80 : 60);

    const recommendations = this.generateRecommendations(checks, task);

    return {
      passed,
      confidence,
      checks,
      recommendations,
      score: totalScore,
      maxScore
    };
  }

  /**
   * Verify that claimed files/features actually exist
   */
  async verifyExistence(task) {
    const check = {
      name: 'Existence Verification',
      type: 'existence',
      passed: false,
      score: 0,
      maxScore: 10,
      details: []
    };

    try {
      // Extract file paths from task
      const filePaths = this.extractFilePaths(task.description);
      
      for (const filePath of filePaths) {
        try {
          await fs.access(filePath);
          check.details.push({ file: filePath, exists: true });
          check.score += 2;
        } catch {
          check.details.push({ file: filePath, exists: false, issue: 'File not found' });
        }
      }

      // Check for expected directories
      if (task.expectedDirectories) {
        for (const dir of task.expectedDirectories) {
          try {
            const stats = await fs.stat(dir);
            if (stats.isDirectory()) {
              check.score += 1;
              check.details.push({ directory: dir, exists: true });
            }
          } catch {
            check.details.push({ directory: dir, exists: false });
          }
        }
      }

      check.passed = check.score >= (check.maxScore * 0.6);
    } catch (error) {
      check.error = error.message;
    }

    return check;
  }

  /**
   * Verify that features actually work
   */
  async verifyFunctionality(task) {
    const check = {
      name: 'Functionality Verification',
      type: 'functionality',
      passed: false,
      score: 0,
      maxScore: 20,
      details: []
    };

    try {
      // Run feature-specific tests
      if (task.testCommand) {
        const { stdout, stderr } = await execAsync(task.testCommand, {
          timeout: this.config.timeout
        });

        const testsPassed = !stderr && stdout.includes('passed');
        check.score = testsPassed ? 20 : 0;
        check.details.push({
          command: task.testCommand,
          passed: testsPassed,
          output: stdout.substring(0, 500)
        });
      }

      // Check API endpoints if applicable
      if (task.endpoints) {
        for (const endpoint of task.endpoints) {
          const isWorking = await this.testEndpoint(endpoint);
          if (isWorking) {
            check.score += 5;
            check.details.push({ endpoint, status: 'working' });
          } else {
            check.details.push({ endpoint, status: 'failed' });
          }
        }
      }

      // Verify expected behaviors
      if (task.behaviors) {
        for (const behavior of task.behaviors) {
          const behaviorPassed = await this.verifyBehavior(behavior);
          if (behaviorPassed) {
            check.score += 3;
            check.details.push({ behavior: behavior.name, passed: true });
          } else {
            check.details.push({ behavior: behavior.name, passed: false });
          }
        }
      }

      check.passed = check.score >= (check.maxScore * 0.7);
    } catch (error) {
      check.error = error.message;
    }

    return check;
  }

  /**
   * Verify test coverage
   */
  async verifyTests(task) {
    const check = {
      name: 'Test Coverage Verification',
      type: 'tests',
      passed: false,
      score: 0,
      maxScore: 15,
      details: []
    };

    try {
      // Check if tests exist
      const testFiles = await this.findTestFiles(task);
      
      if (testFiles.length > 0) {
        check.score += 5;
        check.details.push({ testFiles: testFiles.length });
      }

      // Run tests if available
      if (task.testDirectory) {
        try {
          const { stdout } = await execAsync(`npm test -- ${task.testDirectory}`, {
            timeout: this.config.timeout
          });

          const testsPass = stdout.includes('passing') || stdout.includes('PASS');
          if (testsPass) {
            check.score += 10;
            check.details.push({ testsRun: true, passed: true });
          } else {
            check.details.push({ testsRun: true, passed: false });
          }
        } catch (testError) {
          check.details.push({ testsRun: false, error: testError.message });
        }
      }

      check.passed = check.score >= (check.maxScore * 0.5);
    } catch (error) {
      check.error = error.message;
    }

    return check;
  }

  /**
   * Verify integration with existing system
   */
  async verifyIntegration(task) {
    const check = {
      name: 'Integration Verification',
      type: 'integration',
      passed: false,
      score: 0,
      maxScore: 15,
      details: []
    };

    try {
      // Check build succeeds
      if (task.requiresBuild !== false) {
        try {
          const { stderr } = await execAsync('npm run build', {
            timeout: this.config.timeout
          });

          if (!stderr || stderr.length === 0) {
            check.score += 10;
            check.details.push({ build: 'success' });
          } else {
            check.details.push({ build: 'failed', error: stderr });
          }
        } catch (buildError) {
          check.details.push({ build: 'failed', error: buildError.message });
        }
      }

      // Check linting passes
      try {
        const { stdout, stderr } = await execAsync('npm run lint', {
          timeout: 10000
        });

        if (!stderr) {
          check.score += 5;
          check.details.push({ lint: 'passed' });
        } else {
          check.details.push({ lint: 'failed', issues: stderr });
        }
      } catch (lintError) {
        check.details.push({ lint: 'skipped' });
      }

      check.passed = check.score >= (check.maxScore * 0.6);
    } catch (error) {
      check.error = error.message;
    }

    return check;
  }

  /**
   * Detect potential hallucinations
   */
  async detectHallucinations(task) {
    const check = {
      name: 'Hallucination Detection',
      type: 'hallucination',
      passed: true,
      score: 20,
      maxScore: 20,
      details: []
    };

    const hallucinations = [];

    try {
      // Check for impossible claims
      if (task.claims) {
        for (const claim of task.claims) {
          const isValid = await this.validateClaim(claim);
          if (!isValid) {
            hallucinations.push({
              type: 'impossible_claim',
              claim: claim.description,
              reason: claim.validationError
            });
            check.score -= 5;
          }
        }
      }

      // Check for non-existent references
      const references = this.extractReferences(task.description);
      for (const ref of references) {
        const exists = await this.verifyReference(ref);
        if (!exists) {
          hallucinations.push({
            type: 'non_existent_reference',
            reference: ref,
            issue: 'Reference not found in codebase'
          });
          check.score -= 3;
        }
      }

      // Check for contradictions
      const contradictions = this.findContradictions(task);
      if (contradictions.length > 0) {
        hallucinations.push(...contradictions);
        check.score -= contradictions.length * 2;
      }

      if (hallucinations.length > 0) {
        this.hallucinationDetections.push({
          taskId: task.id,
          timestamp: Date.now(),
          hallucinations
        });
        check.passed = false;
        check.details = hallucinations;
      }

      check.score = Math.max(0, check.score);
    } catch (error) {
      check.error = error.message;
    }

    return check;
  }

  /**
   * Verify performance requirements
   */
  async verifyPerformance(task) {
    const check = {
      name: 'Performance Verification',
      type: 'performance',
      passed: true,
      score: 10,
      maxScore: 10,
      details: []
    };

    try {
      if (task.performanceRequirements) {
        for (const req of task.performanceRequirements) {
          const metric = await this.measurePerformance(req);
          
          if (metric.value > req.threshold) {
            check.score -= 2;
            check.details.push({
              metric: req.name,
              expected: `<= ${req.threshold}`,
              actual: metric.value,
              passed: false
            });
          } else {
            check.details.push({
              metric: req.name,
              expected: `<= ${req.threshold}`,
              actual: metric.value,
              passed: true
            });
          }
        }
      }

      check.passed = check.score >= (check.maxScore * 0.7);
      check.score = Math.max(0, check.score);
    } catch (error) {
      check.error = error.message;
    }

    return check;
  }

  /**
   * Generate recommendations based on verification results
   */
  generateRecommendations(checks, task) {
    const recommendations = [];

    for (const check of checks) {
      if (!check.passed) {
        switch (check.type) {
          case 'existence':
            recommendations.push({
              type: 'critical',
              message: 'Missing files or directories detected',
              action: 'Create missing resources or update task description',
              details: check.details.filter(d => !d.exists)
            });
            break;

          case 'functionality':
            recommendations.push({
              type: 'high',
              message: 'Feature not working as expected',
              action: 'Debug and fix implementation',
              details: check.details.filter(d => !d.passed)
            });
            break;

          case 'tests':
            recommendations.push({
              type: 'medium',
              message: 'Insufficient test coverage',
              action: 'Add comprehensive tests for the feature',
              details: check.details
            });
            break;

          case 'integration':
            recommendations.push({
              type: 'high',
              message: 'Integration issues detected',
              action: 'Fix build/lint errors before marking complete',
              details: check.details.filter(d => d.build === 'failed' || d.lint === 'failed')
            });
            break;

          case 'hallucination':
            recommendations.push({
              type: 'critical',
              message: 'Potential hallucinations detected',
              action: 'Verify claims and fix discrepancies',
              details: check.details
            });
            break;

          case 'performance':
            recommendations.push({
              type: 'medium',
              message: 'Performance requirements not met',
              action: 'Optimize implementation',
              details: check.details.filter(d => !d.passed)
            });
            break;
        }
      }
    }

    return recommendations;
  }

  /**
   * Generate detailed verification report
   */
  async generateVerificationReport(verification) {
    const report = {
      id: verification.id,
      taskId: verification.taskId,
      timestamp: new Date().toISOString(),
      duration: verification.duration,
      status: verification.status,
      confidence: verification.results?.confidence || 0,
      passed: verification.results?.passed || false,
      checks: verification.checks,
      recommendations: verification.results?.recommendations || [],
      evidence: verification.evidence
    };

    // Save report
    const reportPath = path.join(
      this.config.reportPath,
      `verification-${verification.id}.json`
    );

    await fs.mkdir(this.config.reportPath, { recursive: true });
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));

    return report;
  }

  // Helper methods
  generateVerificationId() {
    return `ver-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  extractFilePaths(description) {
    const filePattern = /[\.\/\w-]+\.\w+/g;
    return (description.match(filePattern) || []).filter(f => 
      f.includes('.') && !f.startsWith('.')
    );
  }

  extractReferences(description) {
    const refPattern = /(?:class|function|method|component|module)\s+(\w+)/gi;
    const matches = [];
    let match;
    
    while ((match = refPattern.exec(description)) !== null) {
      matches.push(match[1]);
    }
    
    return matches;
  }

  async findTestFiles(task) {
    const testPatterns = ['*.test.js', '*.spec.js', '*.test.ts', '*.spec.ts'];
    const testFiles = [];

    try {
      for (const pattern of testPatterns) {
        const files = await this.globFiles(pattern);
        testFiles.push(...files);
      }
    } catch (error) {
      console.error('Error finding test files:', error);
    }

    return testFiles;
  }

  async globFiles(pattern) {
    // Simple glob implementation - in production use proper glob library
    const { stdout } = await execAsync(`find . -name "${pattern}" -type f`);
    return stdout.split('\n').filter(f => f.length > 0);
  }

  async testEndpoint(endpoint) {
    try {
      const response = await fetch(endpoint.url, {
        method: endpoint.method || 'GET',
        timeout: 5000
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async verifyBehavior(behavior) {
    try {
      if (behavior.testScript) {
        const { stdout } = await execAsync(behavior.testScript, {
          timeout: 10000
        });
        return stdout.includes(behavior.expectedOutput || 'success');
      }
      return false;
    } catch {
      return false;
    }
  }

  async validateClaim(claim) {
    // Implement claim validation logic
    return !claim.impossible && !claim.contradictory;
  }

  async verifyReference(reference) {
    try {
      const { stdout } = await execAsync(`grep -r "${reference}" . --include="*.js" --include="*.ts"`);
      return stdout.length > 0;
    } catch {
      return false;
    }
  }

  findContradictions(task) {
    const contradictions = [];
    
    // Check for logical contradictions in task description
    if (task.description.includes('async') && task.description.includes('synchronous')) {
      contradictions.push({
        type: 'contradiction',
        description: 'Task claims both async and synchronous behavior'
      });
    }

    return contradictions;
  }

  async measurePerformance(requirement) {
    // Implement performance measurement
    return {
      name: requirement.name,
      value: 0 // Placeholder - implement actual measurement
    };
  }

  /**
   * Get verification statistics
   */
  getStatistics() {
    const total = this.verificationHistory.length;
    const passed = this.verificationHistory.filter(v => v.results?.passed).length;
    const failed = total - passed;
    const avgConfidence = this.verificationHistory.reduce((sum, v) => 
      sum + (v.results?.confidence || 0), 0) / total || 0;

    return {
      total,
      passed,
      failed,
      passRate: (passed / total * 100).toFixed(2) + '%',
      avgConfidence: avgConfidence.toFixed(2) + '%',
      hallucinationsDetected: this.hallucinationDetections.length
    };
  }
}

module.exports = VerificationAgent;