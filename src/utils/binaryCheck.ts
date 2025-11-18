/**
 * Binary Availability Checker
 *
 * Verifies that required external binaries are available at startup.
 * Provides early warnings if dependencies are missing.
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import { logger } from '../middleware/logging.js';

const execFilePromise = promisify(execFile);

export interface BinaryCheckResult {
  binary: string;
  available: boolean;
  version?: string;
  error?: string;
}

/**
 * Check if a binary is available and get its version
 */
async function checkBinary(binaryName: string, versionArgs: string[] = ['--version']): Promise<BinaryCheckResult> {
  try {
    const { stdout, stderr } = await execFilePromise(binaryName, versionArgs, {
      timeout: 5000, // 5 second timeout
    });

    const output = stdout || stderr;
    const versionMatch = output.match(/version\s+([\d.]+)|v([\d.]+)|([\d.]+)/i);
    const version = versionMatch ? (versionMatch[1] || versionMatch[2] || versionMatch[3]) : 'unknown';

    return {
      binary: binaryName,
      available: true,
      version,
    };
  } catch (error) {
    return {
      binary: binaryName,
      available: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Check all required binaries at startup
 * Logs warnings for missing binaries but doesn't block startup
 */
export async function checkRequiredBinaries(): Promise<void> {
  logger.info('Checking binary dependencies...');

  const binaries = [
    { name: 'ffprobe', required: true, purpose: 'Video stream analysis' },
    { name: 'ffmpeg', required: false, purpose: 'Video processing (optional)' },
  ];

  const results: BinaryCheckResult[] = [];

  for (const binary of binaries) {
    // FFmpeg tools use single-dash version flag
    const versionArgs = binary.name.startsWith('ff') ? ['-version'] : ['--version'];
    const result = await checkBinary(binary.name, versionArgs);
    results.push(result);

    if (result.available) {
      logger.info(`✓ ${binary.name} found`, {
        service: 'binaryCheck',
        binary: binary.name,
        version: result.version,
      });
    } else {
      const logLevel = binary.required ? 'error' : 'warn';
      logger[logLevel](`✗ ${binary.name} not found - ${binary.purpose}`, {
        service: 'binaryCheck',
        binary: binary.name,
        required: binary.required,
        error: result.error,
      });

      if (binary.required) {
        logger.error(
          `REQUIRED DEPENDENCY MISSING: ${binary.name} is required for ${binary.purpose}. ` +
          `Please install FFmpeg: https://ffmpeg.org/download.html`
        );
      }
    }
  }

  const allRequired = binaries.filter(b => b.required);
  const availableRequired = results.filter(r => r.available && allRequired.some(b => b.name === r.binary));

  if (availableRequired.length < allRequired.length) {
    logger.warn(
      `${availableRequired.length}/${allRequired.length} required binaries available. ` +
      `Some features may not work correctly.`
    );
  } else {
    logger.info(`All ${allRequired.length} required binaries available`);
  }
}
