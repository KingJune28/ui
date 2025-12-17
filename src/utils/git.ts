import { execSync } from 'child_process';
import { logger } from './logger.js';
import path from 'path';
import fs from 'fs';

export function isGitInstalled(): boolean {
  try {
    execSync('git --version', { stdio: 'ignore' });
    return true;
  } catch (error) {
    return false;
  }
}

export function initGit(projectPath: string): boolean {
  try {
    // Check if git is already initialized
    if (fs.existsSync(path.join(projectPath, '.git'))) {
      logger.warn('Git is already initialized in this directory.');
      return false;
    }

    // Initialize git
    execSync('git init', { cwd: projectPath, stdio: 'ignore' });

    // Add all files
    execSync('git add -A', { cwd: projectPath, stdio: 'ignore' });

    // Create initial commit
    execSync('git commit -m "Initial commit"', { cwd: projectPath, stdio: 'ignore' });

    return true;
  } catch (error) {
    logger.warn('Failed to initialize git repository.');
    return false;
  }
}
