/**
 * Tests for Field Update Utilities
 *
 * Tests the "fill gaps, don't erase" principle
 */

import { shouldUpdateField } from '../../src/utils/fieldUpdate.js';

describe('shouldUpdateField', () => {
  describe('Rule 1: User locked field - never update', () => {
    it('should reject update when field is locked, even with valid new value', () => {
      expect(shouldUpdateField('The Matrix', 'The Matrix Reloaded', true)).toBe(false);
    });

    it('should reject update when field is locked and current is empty', () => {
      expect(shouldUpdateField(null, 'Great movie!', true)).toBe(false);
      expect(shouldUpdateField('', 'Great movie!', true)).toBe(false);
    });

    it('should reject update when field is locked and new value is empty', () => {
      expect(shouldUpdateField('Great movie!', null, true)).toBe(false);
      expect(shouldUpdateField('Great movie!', '', true)).toBe(false);
    });
  });

  describe('Rule 2: Current is empty - accept any non-empty value (FILL GAP)', () => {
    it('should accept new value when current is null', () => {
      expect(shouldUpdateField(null, 'Great movie!', false)).toBe(true);
    });

    it('should accept new value when current is empty string', () => {
      expect(shouldUpdateField('', 'Great movie!', false)).toBe(true);
    });

    it('should accept new value when current is undefined', () => {
      expect(shouldUpdateField(undefined, 'Great movie!', false)).toBe(true);
    });

    it('should reject new value when current is empty and new is also empty', () => {
      expect(shouldUpdateField(null, null, false)).toBe(false);
      expect(shouldUpdateField('', '', false)).toBe(false);
      expect(shouldUpdateField(null, '', false)).toBe(false);
      expect(shouldUpdateField('', null, false)).toBe(false);
    });

    it('should accept numeric values when filling gap', () => {
      expect(shouldUpdateField(null, 8.7, false)).toBe(true);
      expect(shouldUpdateField('', 0, false)).toBe(true);
    });

    it('should accept boolean values when filling gap', () => {
      expect(shouldUpdateField(null, true, false)).toBe(true);
      expect(shouldUpdateField('', false, false)).toBe(true);
    });
  });

  describe('Rule 3: Current has value, new is empty - REJECT (PREVENT REGRESSION)', () => {
    it('should reject null when current has value', () => {
      expect(shouldUpdateField('Great movie!', null, false)).toBe(false);
    });

    it('should reject empty string when current has value', () => {
      expect(shouldUpdateField('Great movie!', '', false)).toBe(false);
    });

    it('should reject undefined when current has value', () => {
      expect(shouldUpdateField('Great movie!', undefined, false)).toBe(false);
    });

    it('should reject empty values even for numeric current values', () => {
      expect(shouldUpdateField(8.7, null, false)).toBe(false);
      expect(shouldUpdateField(100, '', false)).toBe(false);
    });

    it('should reject empty values even for boolean current values', () => {
      expect(shouldUpdateField(true, null, false)).toBe(false);
      expect(shouldUpdateField(false, '', false)).toBe(false);
    });
  });

  describe('Rule 4: Both have values - allow update if different (ALLOW CHANGES)', () => {
    it('should accept new value when different from current', () => {
      expect(shouldUpdateField('Old plot', 'New plot', false)).toBe(true);
    });

    it('should reject new value when same as current', () => {
      expect(shouldUpdateField('Same plot', 'Same plot', false)).toBe(false);
    });

    it('should handle numeric value changes', () => {
      expect(shouldUpdateField(8.5, 8.7, false)).toBe(true);
      expect(shouldUpdateField(8.7, 8.7, false)).toBe(false);
    });

    it('should handle boolean value changes', () => {
      expect(shouldUpdateField(true, false, false)).toBe(true);
      expect(shouldUpdateField(false, false, false)).toBe(false);
    });

    it('should handle zero as a valid value', () => {
      expect(shouldUpdateField(5, 0, false)).toBe(true);
      expect(shouldUpdateField(0, 0, false)).toBe(false);
    });

    it('should handle false as a valid value', () => {
      expect(shouldUpdateField(true, false, false)).toBe(true);
      expect(shouldUpdateField(false, false, false)).toBe(false);
    });
  });

  describe('Edge cases', () => {
    it('should handle mixed type comparisons', () => {
      // String "0" vs number 0 are different
      expect(shouldUpdateField('0', 0, false)).toBe(true);
      expect(shouldUpdateField(0, '0', false)).toBe(true);
    });

    it('should handle whitespace strings as non-empty', () => {
      // Whitespace is considered a value (not empty)
      expect(shouldUpdateField('   ', 'New value', false)).toBe(true);
      expect(shouldUpdateField('Old value', '   ', false)).toBe(true);
    });

    it('should handle array values', () => {
      const arr1 = ['Action', 'Sci-Fi'];
      const arr2 = ['Action', 'Sci-Fi'];
      const arr3 = ['Drama'];

      // Arrays are compared by reference, not content
      expect(shouldUpdateField(arr1, arr2, false)).toBe(true); // Different references
      expect(shouldUpdateField(arr1, arr1, false)).toBe(false); // Same reference
      expect(shouldUpdateField(arr1, arr3, false)).toBe(true);
    });

    it('should handle object values', () => {
      const obj1 = { rating: 8.7 };
      const obj2 = { rating: 8.7 };

      // Objects are compared by reference, not content
      expect(shouldUpdateField(obj1, obj2, false)).toBe(true); // Different references
      expect(shouldUpdateField(obj1, obj1, false)).toBe(false); // Same reference
    });
  });

  describe('Real-world scenarios', () => {
    it('should fill missing plot from provider', () => {
      expect(shouldUpdateField(null, 'A hacker discovers the truth about reality.', false)).toBe(
        true
      );
    });

    it('should not erase existing plot with empty provider data', () => {
      expect(shouldUpdateField('A hacker discovers the truth about reality.', null, false)).toBe(
        false
      );
    });

    it('should allow updating incomplete plot with more detailed one', () => {
      const currentPlot = 'A hacker discovers the truth.';
      const newPlot = 'A hacker discovers the truth about reality and fights to free humanity.';
      expect(shouldUpdateField(currentPlot, newPlot, false)).toBe(true);
    });

    it('should respect user lock on manually edited field', () => {
      const manualEdit = 'My custom description';
      const providerData = 'Official description from provider';
      expect(shouldUpdateField(manualEdit, providerData, true)).toBe(false);
    });

    it('should fill missing rating from secondary provider', () => {
      expect(shouldUpdateField(null, 8.7, false)).toBe(true);
    });

    it('should allow updating rating if provider has newer data', () => {
      expect(shouldUpdateField(8.5, 8.7, false)).toBe(true);
    });

    it('should not overwrite rating with null from incomplete provider', () => {
      expect(shouldUpdateField(8.7, null, false)).toBe(false);
    });
  });
});
