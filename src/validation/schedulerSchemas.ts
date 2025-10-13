import { z } from 'zod';

/**
 * Scheduler Validation Schemas
 *
 * Zod schemas for validating scheduler configuration requests
 */

/**
 * Update library scheduler configuration
 */
export const updateSchedulerConfigSchema = z.object({
  fileScannerEnabled: z.boolean(),
  fileScannerIntervalHours: z.number()
    .int()
    .min(1, 'File scanner interval must be at least 1 hour')
    .max(8760, 'File scanner interval must be less than 1 year'), // 365 days
  providerUpdaterEnabled: z.boolean(),
  providerUpdaterIntervalHours: z.number()
    .int()
    .min(1, 'Provider updater interval must be at least 1 hour')
    .max(8760, 'Provider updater interval must be less than 1 year'),
});

/**
 * Trigger manual job (no body, just validation that library exists)
 */
export const triggerJobSchema = z.object({
  force: z.boolean().optional().default(false),
});
