#!/usr/bin/env node

/**
 * Test script to verify agent guardrails and permissions
 * This validates that agents can execute approved commands without asking
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 Testing Agent Guardrails and Permissions...\n');

// Load and verify CLAUDE.md exists
const claudeMdPath = path.join(process.env.HOME, 'CLAUDE.md');
const settingsPath = path.join(process.env.HOME, '.claude/settings.local.json');

console.log('1. Checking CLAUDE.md configuration...');
if (!fs.existsSync(claudeMdPath)) {
    console.error('❌ CLAUDE.md not found!');
    process.exit(1);
}

const claudeMd = fs.readFileSync(claudeMdPath, 'utf8');

// Check for key sections
const requiredSections = [
    { name: 'AUTO-APPROVED COMMANDS', pattern: /AUTO-APPROVED COMMANDS/i },
    { name: 'SUPABASE COMMANDS', pattern: /SUPABASE COMMANDS.*EXECUTE WITHOUT APPROVAL/i },
    { name: 'AGENT AUTONOMY RULES', pattern: /AGENT AUTONOMY RULES.*DO THE WORK/i },
    { name: 'Database Operations', pattern: /Database Operations.*DO NOT ASK PERMISSION/i },
    { name: 'Migration Management', pattern: /Migration Management.*EXECUTE DIRECTLY/i }
];

let allSectionsFound = true;
requiredSections.forEach(section => {
    if (claudeMd.match(section.pattern)) {
        console.log(`  ✅ ${section.name} section found`);
    } else {
        console.error(`  ❌ ${section.name} section missing!`);
        allSectionsFound = false;
    }
});

console.log('\n2. Checking settings.local.json permissions...');
if (!fs.existsSync(settingsPath)) {
    console.error('❌ settings.local.json not found!');
    process.exit(1);
}

const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
const permissions = settings.permissions?.allow || [];

// Check for Supabase permissions
const supabaseCommands = [
    'supabase db:*',
    'supabase migration:*',
    'supabase gen:*',
    'supabase functions:*',
    'supabase start:*',
    'supabase stop:*',
    'supabase init:*',
    'supabase link:*'
];

let allPermissionsFound = true;
supabaseCommands.forEach(cmd => {
    const pattern = `Bash(${cmd})`;
    if (permissions.some(p => p.includes(cmd.replace(':*', '')))) {
        console.log(`  ✅ Permission for ${cmd} found`);
    } else {
        console.error(`  ❌ Permission for ${cmd} missing!`);
        allPermissionsFound = false;
    }
});

console.log('\n3. Verifying agent instructions...');

// Check for "DO NOT ASK" instructions
const doNotAskPatterns = [
    'YOU CREATE SCHEMAS',
    'YOU RUN MIGRATIONS',
    'YOU MANAGE DATABASE',
    'NO DELEGATION'
];

doNotAskPatterns.forEach(pattern => {
    if (claudeMd.includes(pattern)) {
        console.log(`  ✅ Instruction "${pattern}" found`);
    } else {
        console.error(`  ❌ Instruction "${pattern}" missing!`);
        allSectionsFound = false;
    }
});

// Summary
console.log('\n' + '='.repeat(50));
if (allSectionsFound && allPermissionsFound) {
    console.log('✅ All guardrails configured correctly!');
    console.log('\nAgents should now:');
    console.log('  • Execute Supabase commands without asking permission');
    console.log('  • Create schemas and run migrations autonomously');
    console.log('  • Handle database operations independently');
    console.log('  • Complete tasks end-to-end without delegating to user');
} else {
    console.error('❌ Some guardrails are missing or misconfigured!');
    console.log('\nPlease review the configuration files.');
}

console.log('\n📝 Configuration files checked:');
console.log(`  • ${claudeMdPath}`);
console.log(`  • ${settingsPath}`);