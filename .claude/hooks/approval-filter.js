#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const os = require('os');

// Load configuration - try multiple locations
const configPaths = [
  process.env.CLAUDE_APPROVAL_CONFIG,
  path.join(os.homedir(), 'pachacuti/config/claude-code-approval.json'),
  path.join(process.cwd(), 'config/claude-code-approval.json'),
  path.join(os.homedir(), '.claude/approval-config.json')
].filter(Boolean);

let config;
for (const configPath of configPaths) {
  try {
    if (fs.existsSync(configPath)) {
      config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      break;
    }
  } catch (error) {
    // Continue to next path
  }
}

if (!config) {
  // Use built-in defaults for auto-approval
  config = {
    autoApprove: {
      enabled: true,
      gitOperations: {
        alwaysApprove: [
          "git status", "git diff", "git log", "git branch",
          "git remote", "git show", "git ls-files"
        ]
      },
      npmOperations: {
        alwaysApprove: [
          "npm run build", "npm run test", "npm run lint",
          "npm run dev", "npm run start", "npm test"
        ]
      },
      bashCommands: {
        alwaysApprove: ["ls", "pwd", "cat", "grep", "which", "echo"]
      }
    }
  };
}

// Parse command - handle both single string and args array
const fullCommand = process.argv.slice(2).join(' ').trim();

// Handle batch commands (commands joined with && or ;)
function parseBatchCommands(cmd) {
  // Split by && or ; to detect batch operations
  const separators = /\s*(?:&&|;)\s*/;
  const commands = cmd.split(separators).map(c => c.trim());
  return commands;
}

// Check if path contains sensitive files
function isSensitivePath(path) {
  const sensitivePatterns = [
    /\.env(?:\.|$)/i,
    /\.secret(?:\.|$)/i,
    /\.key(?:\.|$)/i,
    /\.pem(?:\.|$)/i,
    /private.*key/i,
    /credentials/i,
    /password/i,
    /token(?:\.|$)/i
  ];
  
  return sensitivePatterns.some(pattern => pattern.test(path));
}

// Parse git command details
function parseGitCommand(fullCmd) {
  const parts = fullCmd.split(/\s+/);
  if (parts[0] !== 'git') return null;
  
  const subcommand = parts[1];
  const args = parts.slice(2);
  
  return { subcommand, args, fullCmd };
}

// Check if git command should be auto-approved
function shouldAutoApproveGit(fullCmd) {
  const gitCmd = parseGitCommand(fullCmd);
  if (!gitCmd) return false;
  
  const { subcommand, args } = gitCmd;
  
  // Always approve read-only operations
  const readOnlyOps = ['status', 'diff', 'log', 'branch', 'remote', 'show', 
                       'ls-files', 'describe', 'rev-parse', 'config'];
  if (readOnlyOps.includes(subcommand)) {
    // Special case: git config without --global or system changes
    if (subcommand === 'config' && (args.includes('--global') || args.includes('--system'))) {
      return false;
    }
    return true;
  }
  
  // Handle conditional approvals
  const conditionalRules = config.autoApprove?.gitOperations?.conditionalApprove || {};
  
  // git add - check for sensitive files
  if (subcommand === 'add') {
    // Check if adding sensitive files
    const hasPath = args.some(arg => !arg.startsWith('-'));
    if (!hasPath || args.includes('.')) {
      // Adding everything or current directory - check for sensitive files
      return false; // Be cautious with git add .
    }
    
    // Check each path for sensitive patterns
    const paths = args.filter(arg => !arg.startsWith('-'));
    const hasSensitive = paths.some(path => isSensitivePath(path));
    
    return !hasSensitive;
  }
  
  // git commit - always approve (no sensitive data in commit message)
  if (subcommand === 'commit') {
    return true;
  }
  
  // git push - check branch
  if (subcommand === 'push') {
    // Find branch name in args
    let branch = '';
    
    // Look for explicit branch specification
    for (let i = 0; i < args.length; i++) {
      if (!args[i].startsWith('-')) {
        // Format: git push origin branch
        if (i === 1) {
          branch = args[i];
        } else if (i === 0 && args[i] !== 'origin') {
          branch = args[i];
        }
      }
    }
    
    // If no branch specified, get current branch
    if (!branch && args.includes('origin')) {
      // Pushing current branch
      try {
        const currentBranch = require('child_process')
          .execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' })
          .trim();
        branch = currentBranch;
      } catch {
        // Can't determine branch, be cautious
        return false;
      }
    }
    
    // Check if it's a protected branch
    const protectedBranches = ['main', 'master', 'production', 'prod', 'release'];
    const isProtected = protectedBranches.some(protected => 
      branch === protected || branch.endsWith('/' + protected)
    );
    
    return !isProtected;
  }
  
  // git pull, fetch, stash - generally safe
  if (['pull', 'fetch', 'stash', 'merge', 'rebase'].includes(subcommand)) {
    return true;
  }
  
  // git checkout - check if switching to protected branch
  if (subcommand === 'checkout') {
    const branch = args.find(arg => !arg.startsWith('-'));
    const protectedBranches = ['main', 'master', 'production'];
    const isProtected = protectedBranches.includes(branch);
    return !isProtected;
  }
  
  // git rm - requires approval
  if (subcommand === 'rm') {
    return false;
  }
  
  // git reset - check if it's a hard reset
  if (subcommand === 'reset') {
    return !args.includes('--hard');
  }
  
  // git init - always approve
  if (subcommand === 'init') {
    return true;
  }
  
  return false;
}

// Check if npm command should be auto-approved
function shouldAutoApproveNpm(fullCmd) {
  const parts = fullCmd.split(/\s+/);
  const cmd = parts[0];
  
  if (!['npm', 'yarn', 'pnpm'].includes(cmd)) return false;
  
  // Check always approve list
  const alwaysApprove = config.autoApprove?.npmOperations?.alwaysApprove || [];
  if (alwaysApprove.some(approved => fullCmd === approved || fullCmd.startsWith(approved + ' '))) {
    return true;
  }
  
  // Check for npm install without new packages
  if (parts[1] === 'install' || parts[1] === 'i') {
    // If no package specified, it's installing from package.json
    if (parts.length === 2) {
      return true;
    }
    // If it has flags only (like --save-dev), still safe
    const hasPackage = parts.slice(2).some(arg => !arg.startsWith('-'));
    return !hasPackage;
  }
  
  // npm ci is always safe (clean install from lock file)
  if (parts[1] === 'ci') {
    return true;
  }
  
  return false;
}

// Check for custom commands that should auto-approve
function shouldAutoApproveCustom(fullCmd) {
  const customAutoApprove = [
    /^~\/bin\/qc/,
    /^\/Users\/[^\/]+\/bin\/qc/,  // Handle expanded home directory
    /^qc(?:\s|$)/,
    /^osascript/,
    /^node scripts\//,
    /^\.\/scripts\//,
    /^npx claude-flow/,
    /^npx/, // All npx commands
    /^pwd$/,
    /^ls(?:\s|$)/,
    /^which(?:\s|$)/,
    /^echo(?:\s|$)/,
    /^cat(?:\s|$)/,
    /^grep(?:\s|$)/,
    /^find(?:\s|$)/,
    /^mkdir/, // All mkdir operations
    /^touch(?:\s|$)/,
    /^mv(?:\s|$)/,  
    /^cp(?:\s|$)/,
    /^chmod/, // All chmod operations
    /^open(?:\s|$)/,  // Opening files/URLs
    /^code(?:\s|$)/,  // Opening in VS Code
    /^jq(?:\s|$)/,  // JSON processing
    /^sed(?:\s|$)/, // Stream editing (usually safe)
    /^awk(?:\s|$)/, // Text processing
    /^tail(?:\s|$)/, // Viewing file ends
    /^head(?:\s|$)/, // Viewing file starts
    /^wc(?:\s|$)/,  // Word count
    /^date(?:\s|$)/, // Date command
    /^env(?:\s|$)/,  // Environment variables (read)
    /^printenv(?:\s|$)/, // Print environment
    /^basename(?:\s|$)/, // Path manipulation
    /^dirname(?:\s|$)/,  // Path manipulation
    /^test(?:\s|$)/,  // Test conditions
    /^\[.*\]$/,  // Test bracket notation
    /^true$/,
    /^false$/,
    /^exit(?:\s|$)/,
    /^return(?:\s|$)/,
    /^cd(?:\s|$)/,  // Change directory
    /^pushd(?:\s|$)/,  // Push directory
    /^popd(?:\s|$)/,  // Pop directory
    /^supabase/, // ALL Supabase commands
    /^lsof(?:\s|$)/, // List open files
    /^ps(?:\s|$)/, // Process status
    /^kill(?:\s|$)/, // Kill processes (not killall)
    /^curl(?:\s|$)/, // URL transfers
    /^brew(?:\s|$)/, // Homebrew
    /^gh(?:\s|$)/, // GitHub CLI
    /^psql/, // PostgreSQL client
    /^PGPASSWORD=/, // PostgreSQL with password
  ];
  
  return customAutoApprove.some(pattern => pattern.test(fullCmd));
}

// Risk assessment function
function assessRisk(fullCmd) {
  // High-risk commands that should always require approval
  const highRisk = [
    /^rm -rf/,
    /^sudo/,
    /^chmod 777/,
    /^eval/,
    /curl.*\|\s*(?:bash|sh)/,
    /wget.*\|\s*(?:bash|sh)/,
    /^dd(?:\s|$)/,  // Disk operations
    /^mkfs/,  // Format filesystem
    /^fdisk/,  // Partition management
    /^killall/,
    /^pkill/,
    /^systemctl/,
    /^service/,
    /^apt-get remove/,
    /^brew uninstall/,
    /^npm uninstall/,
    /^yarn remove/,
    />\/dev\/null\s+2>&1/,  // Hiding errors (suspicious)
  ];
  
  if (highRisk.some(pattern => pattern.test(fullCmd))) {
    return 'high';
  }
  
  // Read-only operations are low risk
  const readOnly = [
    /^git (?:status|diff|log|branch|show|ls-files)/,
    /^ls(?:\s|$)/,
    /^cat(?:\s|$)/,
    /^grep(?:\s|$)/,
    /^pwd$/,
    /^which(?:\s|$)/,
    /^find .* -name/,
    /^echo(?:\s|$)/,
    /^env$/,
    /^printenv$/,
    /^npm ls/,
    /^npm outdated/,
    /^npm audit/,
  ];
  
  if (readOnly.some(pattern => pattern.test(fullCmd))) {
    return 'low';
  }
  
  return 'medium';
}

// Main function to check if command should be auto-approved
function shouldAutoApprove(fullCmd) {
  if (!config.autoApprove?.enabled) return false;
  
  // Check for batch operations
  const commands = parseBatchCommands(fullCmd);
  const isBatch = commands.length > 1;
  
  if (isBatch) {
    // Check if it's a known safe workflow
    const batchRules = config.autoApprove?.batchOperations?.rules || {};
    
    // Common git workflow
    const isGitWorkflow = commands.every(cmd => 
      cmd.startsWith('git ') && shouldAutoApproveGit(cmd)
    );
    if (isGitWorkflow) return true;
    
    // Test and build workflow
    const isTestBuild = commands.every(cmd => 
      cmd.match(/^npm (?:run )?(?:test|build|lint|typecheck)/)
    );
    if (isTestBuild) return true;
    
    // Check each command individually - all must be safe
    const allSafe = commands.every(cmd => shouldAutoApproveSingle(cmd.trim()));
    return allSafe;
  }
  
  return shouldAutoApproveSingle(fullCmd);
}

// Check single command for auto-approval
function shouldAutoApproveSingle(fullCmd) {
  // Remove leading/trailing whitespace
  fullCmd = fullCmd.trim();
  
  // Handle piped commands - check if ALL parts are safe
  if (fullCmd.includes('|')) {
    // Smart split that respects quotes
    const pipedCommands = [];
    let current = '';
    let inSingleQuote = false;
    let inDoubleQuote = false;
    let escaped = false;
    
    for (let i = 0; i < fullCmd.length; i++) {
      const char = fullCmd[i];
      
      if (escaped) {
        current += char;
        escaped = false;
        continue;
      }
      
      if (char === '\\') {
        current += char;
        escaped = true;
        continue;
      }
      
      if (char === "'" && !inDoubleQuote) {
        current += char;
        inSingleQuote = !inSingleQuote;
        continue;
      }
      
      if (char === '"' && !inSingleQuote) {
        current += char;
        inDoubleQuote = !inDoubleQuote;
        continue;
      }
      
      if (char === '|' && !inSingleQuote && !inDoubleQuote) {
        pipedCommands.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    
    if (current) {
      pipedCommands.push(current.trim());
    }
    
    // All commands in the pipeline must be safe
    const allPipedSafe = pipedCommands.every(cmd => {
      // Recursively check each piped command
      return shouldAutoApproveSingleNoPipe(cmd);
    });
    return allPipedSafe;
  }
  
  return shouldAutoApproveSingleNoPipe(fullCmd);
}

// Check single command without pipe handling (to avoid recursion)
function shouldAutoApproveSingleNoPipe(fullCmd) {
  // Remove leading/trailing whitespace
  fullCmd = fullCmd.trim();
  
  // Check custom commands first (highest priority)
  if (shouldAutoApproveCustom(fullCmd)) {
    return true;
  }
  
  // Check git operations
  if (fullCmd.startsWith('git ')) {
    return shouldAutoApproveGit(fullCmd);
  }
  
  // Check npm/yarn/pnpm operations  
  if (fullCmd.match(/^(?:npm|yarn|pnpm)(?:\s|$)/)) {
    return shouldAutoApproveNpm(fullCmd);
  }
  
  // Check bash commands from config
  const bashAlways = config.autoApprove?.bashCommands?.alwaysApprove || [];
  const firstWord = fullCmd.split(/\s+/)[0];
  if (bashAlways.includes(firstWord)) {
    return true;
  }
  
  // Check patterns from config
  const patterns = config.autoApprove?.bashCommands?.patterns || {};
  for (const [name, pattern] of Object.entries(patterns)) {
    if (new RegExp(pattern).test(fullCmd)) {
      return true;
    }
  }
  
  // Check if it's a high-risk command that should never auto-approve
  if (assessRisk(fullCmd) === 'high') {
    return false;
  }
  
  return false;
}

// Main logic
const risk = assessRisk(fullCommand);
const autoApprove = shouldAutoApprove(fullCommand);

// Output decision
const decision = {
  command: fullCommand,
  risk,
  autoApprove,
  timestamp: new Date().toISOString(),
  batch: parseBatchCommands(fullCommand).length > 1
};

// Log decision to home directory (always accessible)
const logPath = path.join(os.homedir(), '.claude-approval-log');
try {
  fs.appendFileSync(logPath, JSON.stringify(decision) + '\n');
} catch (error) {
  // Silent fail on logging
}

// Exit with appropriate code
// 0 = auto-approve, 1 = require approval
process.exit(autoApprove ? 0 : 1);