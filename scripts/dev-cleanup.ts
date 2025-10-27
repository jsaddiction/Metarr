#!/usr/bin/env tsx
/**
 * Development Cleanup Script
 *
 * This script cleans up development artifacts before starting the backend server.
 * It is ONLY intended for use during pre-release development phase.
 *
 * What it does:
 * 1. Deletes the SQLite database to force schema recreation
 * 2. Deletes log files to start with fresh logs
 *
 * Usage: npm run dev:clean
 *
 * DO NOT run this in production!
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..');

// ANSI color codes for prettier output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
};

console.log(`${colors.bright}${colors.cyan}🧹 Development Cleanup Script${colors.reset}\n`);

// Clean database
const dbPath = path.join(projectRoot, 'data', 'metarr.sqlite');
if (fs.existsSync(dbPath)) {
  try {
    fs.unlinkSync(dbPath);
    console.log(`${colors.green}✓${colors.reset} Deleted database: ${dbPath}`);
  } catch (error: any) {
    console.log(`${colors.yellow}⚠${colors.reset} Could not delete database: ${error.message}`);
  }
} else {
  console.log(`${colors.yellow}○${colors.reset} Database not found (already clean): ${dbPath}`);
}

// Clean log files
const logsToDelete = [
  path.join(projectRoot, 'logs', 'app.log'),
  path.join(projectRoot, 'logs', 'error.log'),
  path.join(projectRoot, 'logs', 'jobs.log'),
];

let deletedLogs = 0;
for (const logPath of logsToDelete) {
  if (fs.existsSync(logPath)) {
    try {
      fs.unlinkSync(logPath);
      deletedLogs++;
    } catch (error: any) {
      console.log(`${colors.yellow}⚠${colors.reset} Could not delete log: ${path.basename(logPath)}`);
    }
  }
}

if (deletedLogs > 0) {
  console.log(`${colors.green}✓${colors.reset} Deleted ${deletedLogs} log file(s)`);
} else {
  console.log(`${colors.yellow}○${colors.reset} No log files found (already clean)`);
}

console.log(`\n${colors.bright}${colors.green}✓ Cleanup complete!${colors.reset}\n`);
