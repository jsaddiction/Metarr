/**
 * Field Update Utilities
 *
 * Implements "fill gaps, don't erase" principle for metadata updates
 * across multiple providers.
 */

/**
 * Determines if a field should be updated based on current and new values
 * Implements "fill gaps, don't erase" principle
 *
 * Rules:
 * 1. User locked field → NEVER update (user has manual override)
 * 2. Current is empty → Accept any non-empty value (FILL GAP)
 * 3. Current has value, new is empty → REJECT (PREVENT REGRESSION)
 * 4. Both have values → Allow update if different (ALLOW CHANGES)
 *
 * @param currentValue - Current field value in database
 * @param newValue - New value from provider
 * @param fieldLocked - Whether user has locked this field
 * @returns true if field should be updated, false otherwise
 *
 * @example
 * // User locked field - never update
 * shouldUpdateField("The Matrix", "The Matrix Reloaded", true) // false
 *
 * @example
 * // Fill gap - accept new value
 * shouldUpdateField(null, "Great movie!", false) // true
 * shouldUpdateField("", "Great movie!", false) // true
 *
 * @example
 * // Prevent regression - reject empty value
 * shouldUpdateField("Great movie!", null, false) // false
 * shouldUpdateField("Great movie!", "", false) // false
 *
 * @example
 * // Allow changes - both have values
 * shouldUpdateField("Old plot", "New plot", false) // true
 * shouldUpdateField("Same plot", "Same plot", false) // false
 */
export function shouldUpdateField(
  currentValue: any,
  newValue: any,
  fieldLocked: boolean
): boolean {
  // Rule 1: User locked this field → never update
  if (fieldLocked) {
    return false;
  }

  // Rule 2: Current is empty → accept any non-empty value (FILL GAP)
  if (currentValue == null || currentValue === '') {
    return newValue != null && newValue !== '';
  }

  // Rule 3: Current has value, new is empty → REJECT (PREVENT REGRESSION)
  if (newValue == null || newValue === '') {
    return false;
  }

  // Rule 4: Both have values → allow update if different (ALLOW CHANGES)
  return currentValue !== newValue;
}
