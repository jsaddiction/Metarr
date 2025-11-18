/**
 * Processing Decision Service - Phase 3 of File Classification
 *
 * Makes the final binary decision: Can we process this directory automatically?
 * Based on two critical requirements: Main movie + TMDB ID
 *
 * Principle: "Minimum Requirements: Main movie file + TMDB ID = can process"
 */

import { logger } from '../../middleware/logging.js';
import {
  ClassificationResult,
  ProcessingDecision,
} from '../../types/classification.js';

/**
 * Determine if directory can be processed automatically
 *
 * Binary decision based on:
 * 1. Main movie identified? (≥80% confidence)
 * 2. TMDB ID available? (from NFO or user input)
 *
 * Everything else is optional and doesn't block processing.
 */
export function canProcessDirectory(
  classificationResult: ClassificationResult
): ProcessingDecision {
  const { videos, text, totalUnknown } = classificationResult;

  const hasMainMovie = videos.mainMovie !== null;
  const hasTmdbId = text.tmdbId !== undefined;
  const hasUnknownFiles = totalUnknown > 0;

  const missingRequirements: string[] = [];

  // Check main movie requirement
  if (!hasMainMovie) {
    missingRequirements.push('Main movie file not identified');
  }

  // Check TMDB ID requirement
  if (!hasTmdbId) {
    missingRequirements.push('TMDB ID not found in NFO');
  }

  // Early return: Cannot process - missing critical requirements
  if (!hasMainMovie || !hasTmdbId) {
    logger.warn('Directory cannot be processed automatically', {
      missingRequirements,
      hasMainMovie,
      hasTmdbId,
      unknownCount: totalUnknown,
    });

    return {
      canProcess: false,
      status: 'MANUAL_REQUIRED',
      confidence: 0,
      reason: `Cannot process automatically. Missing: ${missingRequirements.join(', ')}`,
      missingRequirements,
      hasMainMovie,
      hasTmdbId,
      hasUnknownFiles,
      unknownFileCount: totalUnknown,
    };
  }

  // Early return: Perfect - everything classified
  if (!hasUnknownFiles) {
    logger.info('Directory can be processed (perfect classification)', {
      mainMovie: videos.mainMovie?.facts.filesystem.filename,
      tmdbId: text.tmdbId,
      totalFiles: classificationResult.totalFiles,
    });

    return {
      canProcess: true,
      status: 'CAN_PROCESS',
      confidence: 100,
      reason: 'All requirements met. All files classified successfully.',
      missingRequirements,
      hasMainMovie,
      hasTmdbId,
      hasUnknownFiles,
      unknownFileCount: totalUnknown,
    };
  }

  // Default: Good enough - has requirements but some unknowns
  logger.info('Directory can be processed (with unknowns)', {
    mainMovie: videos.mainMovie?.facts.filesystem.filename,
    tmdbId: text.tmdbId,
    unknownCount: totalUnknown,
  });

  return {
    canProcess: true,
    status: 'CAN_PROCESS_WITH_UNKNOWNS',
    confidence: 80,
    reason: `All requirements met. ${totalUnknown} unknown file(s) will be flagged for recycling at publish time.`,
    missingRequirements,
    hasMainMovie,
    hasTmdbId,
    hasUnknownFiles,
    unknownFileCount: totalUnknown,
  };
}

/**
 * Get user-friendly explanation of processing status
 */
export function getProcessingStatusExplanation(decision: ProcessingDecision): string {
  if (decision.canProcess && decision.status === 'CAN_PROCESS') {
    return `✅ Ready to process automatically. Main movie identified, TMDB ID found, all files classified.`;
  }

  if (decision.canProcess && decision.status === 'CAN_PROCESS_WITH_UNKNOWNS') {
    return `⚠️ Ready to process with warnings. Main movie identified, TMDB ID found, but ${decision.unknownFileCount} unknown file(s) present. These will be moved to recycle bin during publish.`;
  }

  // MANUAL_REQUIRED
  const issues: string[] = [];
  if (!decision.hasMainMovie) {
    issues.push('❌ Main movie file could not be identified automatically');
  }
  if (!decision.hasTmdbId) {
    issues.push('❌ TMDB ID not found (check NFO file)');
  }

  return `🛑 Manual classification required:\n${issues.join('\n')}\n\nPlease use the manual classification interface to identify the main movie file and/or provide the TMDB ID.`;
}

/**
 * Get actionable next steps for user based on decision
 */
export function getNextSteps(decision: ProcessingDecision): string[] {
  if (decision.canProcess) {
    return [
      'Review classification results',
      'Click "Continue" to proceed with enrichment',
      'Unknown files (if any) will be moved to recycle bin during publish',
    ];
  }

  const steps: string[] = ['Open manual classification interface'];

  if (!decision.hasMainMovie) {
    steps.push('Identify which video file is the main movie');
  }

  if (!decision.hasTmdbId) {
    steps.push('Provide TMDB ID for this movie (search by title/year)');
  }

  if (decision.hasUnknownFiles) {
    steps.push(`Classify ${decision.unknownFileCount} unknown file(s) (optional)`);
  }

  steps.push('Re-run classification after providing required information');

  return steps;
}

/**
 * Validate classification result before making decision
 * Ensures critical fields are present
 */
export function validateClassificationResult(
  classificationResult: ClassificationResult
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Validate videos classification
  if (!classificationResult.videos) {
    errors.push('Video classification missing');
  }

  // Validate text classification
  if (!classificationResult.text) {
    errors.push('Text classification missing');
  }

  // Validate images classification
  if (!classificationResult.images) {
    errors.push('Image classification missing');
  }

  // Validate totals make sense
  if (classificationResult.totalFiles < 0) {
    errors.push('Invalid totalFiles count');
  }

  if (classificationResult.totalClassified < 0) {
    errors.push('Invalid totalClassified count');
  }

  if (classificationResult.totalUnknown < 0) {
    errors.push('Invalid totalUnknown count');
  }

  // Check that totals add up
  const expectedTotal =
    classificationResult.totalClassified + classificationResult.totalUnknown;
  if (expectedTotal !== classificationResult.totalFiles) {
    errors.push(
      `Total files mismatch: ${classificationResult.totalFiles} files, but ${classificationResult.totalClassified} classified + ${classificationResult.totalUnknown} unknown = ${expectedTotal}`
    );
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
