# Phase 1 Implementation Guide: Error Handling Fix

## Overview

**Goal:** Replace 432 `catch (error: any)` occurrences with proper error handling
**Effort:** 1 week part-time or 2-3 days full-time
**Impact:** 50%+ reduction in `any` usage with minimal risk

---

## Step-by-Step Implementation

### Step 1: Understand TypeScript Error Handling

**Before TypeScript 4.4:**
```typescript
catch (error) {
  // error is type 'any' by default
}
```

**After TypeScript 4.4:**
```typescript
catch (error) {
  // error is type 'unknown' by default with useUnknownInCatchVariables: true
}
```

**Best Practice:**
```typescript
catch (error) {
  if (error instanceof Error) {
    logger.error('Operation failed', { error: error.message, stack: error.stack });
  } else {
    logger.error('Operation failed', { error: String(error) });
  }
}
```

---

### Step 2: Update tsconfig.json

Add strict error handling:

```json
{
  "compilerOptions": {
    "useUnknownInCatchVariables": true,  // Treat catch variables as 'unknown'
    "strict": true,
    "noImplicitAny": true
  }
}
```

---

### Step 3: Create Error Handling Utilities

Create `src/utils/errorHandling.ts`:

```typescript
/**
 * Type-safe error message extraction
 * Handles Error objects, strings, and unknown errors
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return String(error);
}

/**
 * Type-safe error stack extraction
 */
export function getErrorStack(error: unknown): string | undefined {
  if (error instanceof Error) {
    return error.stack;
  }
  return undefined;
}

/**
 * Check if error is a specific type
 */
export function isErrorWithCode(error: unknown): error is Error & { code: string } {
  return (
    error instanceof Error &&
    'code' in error &&
    typeof (error as any).code === 'string'
  );
}

/**
 * Check if error is a database error
 */
export function isDatabaseError(error: unknown): error is Error & { errno?: number; code?: string } {
  return (
    error instanceof Error &&
    ('errno' in error || 'code' in error)
  );
}

/**
 * Create a standardized error object for logging
 */
export interface ErrorLogContext {
  message: string;
  stack?: string;
  code?: string;
  errno?: number;
  [key: string]: unknown;
}

export function createErrorLogContext(error: unknown, additionalContext?: Record<string, unknown>): ErrorLogContext {
  const context: ErrorLogContext = {
    message: getErrorMessage(error),
    stack: getErrorStack(error),
  };

  if (isErrorWithCode(error)) {
    context.code = error.code;
  }

  if (isDatabaseError(error)) {
    context.errno = error.errno;
    if (!context.code && error.code) {
      context.code = error.code;
    }
  }

  return {
    ...context,
    ...additionalContext,
  };
}
```

---

### Step 4: Update Error Handling Patterns

#### Pattern 1: Simple Error Logging

**Before:**
```typescript
catch (error: any) {
  logger.error('Failed to fetch movie', { error: error.message });
  throw error;
}
```

**After:**
```typescript
import { getErrorMessage, createErrorLogContext } from '../utils/errorHandling.js';

catch (error) {
  logger.error('Failed to fetch movie', createErrorLogContext(error));
  throw error;
}
```

#### Pattern 2: Error Message Extraction

**Before:**
```typescript
catch (error: any) {
  return { success: false, error: error.message };
}
```

**After:**
```typescript
import { getErrorMessage } from '../utils/errorHandling.js';

catch (error) {
  return { success: false, error: getErrorMessage(error) };
}
```

#### Pattern 3: Error Type Checking

**Before:**
```typescript
catch (error: any) {
  if (error.code === 'ENOENT') {
    logger.debug('File not found');
  } else {
    throw error;
  }
}
```

**After:**
```typescript
import { isErrorWithCode } from '../utils/errorHandling.js';

catch (error) {
  if (isErrorWithCode(error) && error.code === 'ENOENT') {
    logger.debug('File not found');
  } else {
    throw error;
  }
}
```

#### Pattern 4: Database Errors

**Before:**
```typescript
catch (error: any) {
  if (error.errno === 1062) {
    throw new Error('Duplicate entry');
  }
  throw error;
}
```

**After:**
```typescript
import { isDatabaseError } from '../utils/errorHandling.js';

catch (error) {
  if (isDatabaseError(error) && error.errno === 1062) {
    throw new Error('Duplicate entry');
  }
  throw error;
}
```

---

### Step 5: Automated Find and Replace

Use these regex patterns to find candidates for replacement:

**Find:**
```regex
catch \((\w+): any\)
```

**Replace (manual review required):**
```typescript
catch ($1)
```

**VS Code Multi-Cursor Workflow:**
1. Open Find/Replace (Ctrl+H)
2. Enable regex mode
3. Find: `catch \(error: any\)`
4. Replace with: `catch (error)`
5. Review each replacement before accepting

---

### Step 6: File-by-File Migration

**Priority Order:**
1. Utility files (lowest risk)
2. Service files (medium risk)
3. Controller files (higher risk)
4. Route files (highest risk - user-facing)

**Example: nfoGenerator.ts (Lines 284, 396, 480, 695, 790, 865)**

**Before (Line 284):**
```typescript
catch (error: any) {
  logger.error('Failed to generate movie NFO', {
    movieDir,
    error: error.message,
  });
  throw new Error(`NFO generation failed: ${error.message}`);
}
```

**After:**
```typescript
import { getErrorMessage, createErrorLogContext } from '../../utils/errorHandling.js';

catch (error) {
  logger.error('Failed to generate movie NFO', {
    movieDir,
    ...createErrorLogContext(error),
  });
  throw new Error(`NFO generation failed: ${getErrorMessage(error)}`);
}
```

---

### Step 7: Testing Strategy

#### Unit Test Example
```typescript
import { describe, it, expect } from 'vitest';
import { getErrorMessage, getErrorStack, isErrorWithCode } from '../utils/errorHandling';

describe('Error Handling Utils', () => {
  it('should extract message from Error object', () => {
    const error = new Error('Test error');
    expect(getErrorMessage(error)).toBe('Test error');
  });

  it('should extract message from string', () => {
    expect(getErrorMessage('String error')).toBe('String error');
  });

  it('should convert unknown to string', () => {
    expect(getErrorMessage({ message: 'Object error' })).toBe('[object Object]');
  });

  it('should extract stack from Error', () => {
    const error = new Error('Test');
    expect(getErrorStack(error)).toBeDefined();
  });

  it('should identify error with code', () => {
    const error = Object.assign(new Error('Test'), { code: 'ENOENT' });
    expect(isErrorWithCode(error)).toBe(true);
  });
});
```

#### Integration Test
```typescript
import { describe, it, expect } from 'vitest';
import { MovieService } from '../services/movieService';

describe('MovieService Error Handling', () => {
  it('should handle database errors gracefully', async () => {
    const service = new MovieService(mockDb);

    // Trigger error condition
    mockDb.query.mockRejectedValue(new Error('Connection failed'));

    await expect(service.getById(1)).rejects.toThrow('Connection failed');
  });
});
```

---

### Step 8: ESLint Configuration

Add rule to prevent regression:

**.eslintrc.json:**
```json
{
  "rules": {
    "@typescript-eslint/no-explicit-any": "error",
    "@typescript-eslint/no-unsafe-assignment": "warn",
    "@typescript-eslint/no-unsafe-member-access": "warn"
  },
  "overrides": [
    {
      "files": ["*.test.ts", "*.spec.ts"],
      "rules": {
        "@typescript-eslint/no-explicit-any": "off"
      }
    }
  ]
}
```

**Run linter:**
```bash
npm run lint -- --fix
```

---

### Step 9: CI/CD Integration

Add type checking to CI pipeline:

**.github/workflows/type-check.yml:**
```yaml
name: Type Check

on: [push, pull_request]

jobs:
  type-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '20'
      - run: npm ci
      - run: npm run typecheck
      - run: npx tsc --noEmit --strict
```

**package.json script:**
```json
{
  "scripts": {
    "typecheck": "tsc --noEmit",
    "count-any": "rg ': any' --type ts src/ | wc -l"
  }
}
```

---

### Step 10: Documentation

Update coding guidelines in `docs/DEVELOPMENT.md`:

```markdown
## Error Handling Guidelines

### Always use unknown for caught errors

```typescript
// ✅ Good
catch (error) {
  if (error instanceof Error) {
    logger.error('Failed', { error: error.message });
  }
}

// ❌ Bad
catch (error: any) {
  logger.error('Failed', { error: error.message });
}
```

### Use utility functions

```typescript
import { getErrorMessage, createErrorLogContext } from '../utils/errorHandling';

catch (error) {
  logger.error('Operation failed', createErrorLogContext(error));
  throw new Error(`Failed: ${getErrorMessage(error)}`);
}
```
```

---

## Checklist

### Pre-Implementation
- [ ] Update tsconfig.json with `useUnknownInCatchVariables: true`
- [ ] Create `src/utils/errorHandling.ts`
- [ ] Write unit tests for error utilities
- [ ] Document new patterns in DEVELOPMENT.md

### Implementation
- [ ] Fix utility files (src/utils/*)
- [ ] Fix service files (src/services/*)
- [ ] Fix controller files (src/controllers/*)
- [ ] Fix route files (src/routes/*)
- [ ] Run full test suite
- [ ] Manual testing of critical paths

### Post-Implementation
- [ ] Add ESLint rule `@typescript-eslint/no-explicit-any: error`
- [ ] Update CI/CD with type checking
- [ ] Create PR with changes
- [ ] Code review by team
- [ ] Monitor production after merge

---

## Expected Outcomes

### Metrics
- **Before:** 692 `any` in backend, 73 in frontend
- **After:** ~260 `any` in backend, 73 in frontend (432 eliminated)
- **Type Coverage:** Increase from ~65% to ~80%

### Benefits
- ✅ Catch more errors at compile time
- ✅ Better IntelliSense in error handlers
- ✅ More robust error logging
- ✅ Foundation for future type improvements

---

## Common Issues & Solutions

### Issue 1: TypeScript Errors After Removal
**Problem:** `Property 'message' does not exist on type 'unknown'`

**Solution:**
```typescript
// Add type guard
if (error instanceof Error) {
  console.log(error.message); // ✅ TypeScript knows this is safe
}
```

### Issue 2: Non-Error Throws
**Problem:** Code throws strings or objects, not Error instances

**Solution:**
```typescript
catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  logger.error('Failed', { error: message });
}
```

### Issue 3: Third-Party Library Errors
**Problem:** Library throws custom error types

**Solution:**
```typescript
import { AxiosError } from 'axios';

catch (error) {
  if (error instanceof AxiosError) {
    logger.error('HTTP request failed', {
      status: error.response?.status,
      data: error.response?.data,
    });
  }
}
```

---

## Timeline

| Day | Task | Hours |
|-----|------|-------|
| 1 | Setup (tsconfig, utils, tests) | 4 |
| 2 | Fix utility files | 3 |
| 3 | Fix service files (part 1) | 4 |
| 4 | Fix service files (part 2) | 4 |
| 5 | Fix controllers & routes | 4 |
| 6 | Testing & bug fixes | 4 |
| 7 | Documentation & PR | 2 |

**Total:** ~25 hours (1 week part-time)

---

## Success Criteria

- [ ] Zero TypeScript compilation errors
- [ ] All existing tests pass
- [ ] ESLint shows 0 `no-explicit-any` violations in updated files
- [ ] `any` count reduced by at least 400
- [ ] No production incidents related to error handling

---

## Questions?

See main remediation plan: `docs/refactoring/TYPESCRIPT_ANY_REMEDIATION.md`
