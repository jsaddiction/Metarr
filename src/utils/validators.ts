/**
 * Validation Utilities
 *
 * Provides reusable validation functions that throw ValidationError on failure.
 * All validators return typed values and provide clear error messages.
 *
 * @module utils/validators
 */

import { ValidationError } from '../errors/index.js';
import path from 'path';

/**
 * Valid entity types supported by the application
 */
const VALID_ENTITY_TYPES = [
  'movie',
  'series',
  'season',
  'episode',
  'collection',
  'artist',
  'album',
  'track',
  'actor',
] as const;

/**
 * Validates that a value is a positive integer (> 0)
 *
 * @param value - The value to validate
 * @param fieldName - Name of the field for error messages
 * @returns The validated positive integer
 * @throws {ValidationError} If value is not a positive integer
 *
 * @example
 * validatePositiveInteger(42, 'userId'); // Returns 42
 * validatePositiveInteger(0, 'count'); // Throws ValidationError
 * validatePositiveInteger(-5, 'id'); // Throws ValidationError
 */
export function validatePositiveInteger(
  value: unknown,
  fieldName: string
): number {
  // Check if value is a number
  if (typeof value !== 'number' || isNaN(value)) {
    throw new ValidationError(
      `${fieldName} must be a number, got ${typeof value}`,
      { fieldName, value }
    );
  }

  // Check if it's an integer
  if (!Number.isInteger(value)) {
    throw new ValidationError(
      `${fieldName} must be an integer, got ${value}`,
      { fieldName, value }
    );
  }

  // Check if it's positive
  if (value <= 0) {
    throw new ValidationError(
      `${fieldName} must be a positive integer, got ${value}`,
      { fieldName, value }
    );
  }

  return value;
}

/**
 * Validates a file path and protects against path traversal attacks
 *
 * @param filePath - The file path to validate
 * @returns The validated, normalized file path
 * @throws {ValidationError} If path is invalid or contains traversal attempts
 *
 * @example
 * validateFilePath('/valid/path/file.txt'); // Returns normalized path
 * validateFilePath('../../../etc/passwd'); // Throws ValidationError
 * validateFilePath(''); // Throws ValidationError
 */
export function validateFilePath(filePath: unknown): string {
  // Check if it's a string
  if (typeof filePath !== 'string') {
    throw new ValidationError(
      `File path must be a string, got ${typeof filePath}`,
      { filePath }
    );
  }

  // Check for empty string
  if (filePath.trim().length === 0) {
    throw new ValidationError('File path cannot be empty', { filePath });
  }

  // Normalize the path to resolve any .. or . segments
  const normalizedPath = path.normalize(filePath);

  // Check for path traversal attempts
  // After normalization, if the path still contains '..' it's trying to escape
  if (normalizedPath.includes('..')) {
    throw new ValidationError(
      'File path contains invalid traversal sequence (..), which is not allowed',
      { filePath, normalizedPath }
    );
  }

  // Check for null bytes (common injection technique)
  if (normalizedPath.includes('\0')) {
    throw new ValidationError('File path contains null bytes', {
      filePath,
      normalizedPath,
    });
  }

  // On Windows, check for invalid characters
  if (process.platform === 'win32') {
    const invalidChars = /[<>:"|?*]/;
    // Extract just the filename part (after drive letter if present)
    const pathWithoutDrive = normalizedPath.replace(/^[A-Za-z]:/, '');
    if (invalidChars.test(pathWithoutDrive)) {
      throw new ValidationError(
        'File path contains invalid characters for Windows: < > : " | ? *',
        { filePath, normalizedPath }
      );
    }
  }

  return normalizedPath;
}

/**
 * Validates that a value is a recognized entity type
 *
 * @param type - The entity type to validate
 * @returns The validated entity type
 * @throws {ValidationError} If type is not a valid entity type
 *
 * @example
 * validateEntityType('movie'); // Returns 'movie'
 * validateEntityType('invalid'); // Throws ValidationError
 */
export function validateEntityType(
  type: unknown
): typeof VALID_ENTITY_TYPES[number] {
  // Check if it's a string
  if (typeof type !== 'string') {
    throw new ValidationError(
      `Entity type must be a string, got ${typeof type}`,
      { type }
    );
  }

  // Check if it's a valid entity type
  if (!VALID_ENTITY_TYPES.includes(type as any)) {
    throw new ValidationError(
      `Invalid entity type: ${type}. Must be one of: ${VALID_ENTITY_TYPES.join(', ')}`,
      { type, validTypes: VALID_ENTITY_TYPES }
    );
  }

  return type as typeof VALID_ENTITY_TYPES[number];
}

/**
 * Validates that a value is a well-formed URL
 *
 * @param url - The URL to validate
 * @returns The validated URL string
 * @throws {ValidationError} If URL is invalid
 *
 * @example
 * validateUrl('https://example.com'); // Returns 'https://example.com'
 * validateUrl('not-a-url'); // Throws ValidationError
 * validateUrl(''); // Throws ValidationError
 */
export function validateUrl(url: unknown): string {
  // Check if it's a string
  if (typeof url !== 'string') {
    throw new ValidationError(`URL must be a string, got ${typeof url}`, {
      url,
    });
  }

  // Check for empty string
  if (url.trim().length === 0) {
    throw new ValidationError('URL cannot be empty', { url });
  }

  // Try to parse the URL
  try {
    const parsedUrl = new URL(url);

    // Ensure it has a valid protocol
    if (!['http:', 'https:', 'ftp:', 'ftps:'].includes(parsedUrl.protocol)) {
      throw new ValidationError(
        `URL must use http, https, ftp, or ftps protocol, got ${parsedUrl.protocol}`,
        { url, protocol: parsedUrl.protocol }
      );
    }

    // Ensure it has a hostname
    if (!parsedUrl.hostname) {
      throw new ValidationError('URL must have a hostname', { url });
    }

    return url;
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }

    throw new ValidationError(`Invalid URL format: ${(error as Error).message}`, {
      url,
      originalError: (error as Error).message,
    });
  }
}

/**
 * Validates that a value is a non-empty string
 *
 * @param value - The value to validate
 * @param fieldName - Name of the field for error messages
 * @returns The validated, trimmed string
 * @throws {ValidationError} If value is not a non-empty string
 *
 * @example
 * validateNonEmptyString('hello', 'name'); // Returns 'hello'
 * validateNonEmptyString('  ', 'name'); // Throws ValidationError
 * validateNonEmptyString('', 'name'); // Throws ValidationError
 */
export function validateNonEmptyString(
  value: unknown,
  fieldName: string
): string {
  // Check if it's a string
  if (typeof value !== 'string') {
    throw new ValidationError(
      `${fieldName} must be a string, got ${typeof value}`,
      { fieldName, value }
    );
  }

  // Trim and check if empty
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new ValidationError(`${fieldName} cannot be empty or whitespace-only`, {
      fieldName,
      value,
    });
  }

  return trimmed;
}

/**
 * Validates that a value is an array of strings
 *
 * @param arr - The array to validate
 * @param fieldName - Name of the field for error messages
 * @param options - Validation options
 * @param options.allowEmpty - Whether to allow empty strings in the array (default: false)
 * @param options.minLength - Minimum array length
 * @param options.maxLength - Maximum array length
 * @returns The validated array of strings
 * @throws {ValidationError} If value is not a valid array of strings
 *
 * @example
 * validateArrayOfStrings(['a', 'b'], 'tags'); // Returns ['a', 'b']
 * validateArrayOfStrings(['a', 123], 'tags'); // Throws ValidationError
 * validateArrayOfStrings('not-array', 'tags'); // Throws ValidationError
 */
export function validateArrayOfStrings(
  arr: unknown,
  fieldName: string,
  options: {
    allowEmpty?: boolean;
    minLength?: number;
    maxLength?: number;
  } = {}
): string[] {
  const { allowEmpty = false, minLength, maxLength } = options;

  // Check if it's an array
  if (!Array.isArray(arr)) {
    throw new ValidationError(
      `${fieldName} must be an array, got ${typeof arr}`,
      { fieldName, value: arr }
    );
  }

  // Check minimum length
  if (minLength !== undefined && arr.length < minLength) {
    throw new ValidationError(
      `${fieldName} must have at least ${minLength} element${minLength !== 1 ? 's' : ''}, got ${arr.length}`,
      { fieldName, value: arr, minLength, actualLength: arr.length }
    );
  }

  // Check maximum length
  if (maxLength !== undefined && arr.length > maxLength) {
    throw new ValidationError(
      `${fieldName} must have at most ${maxLength} element${maxLength !== 1 ? 's' : ''}, got ${arr.length}`,
      { fieldName, value: arr, maxLength, actualLength: arr.length }
    );
  }

  // Validate each element is a string
  for (let i = 0; i < arr.length; i++) {
    const element = arr[i];

    if (typeof element !== 'string') {
      throw new ValidationError(
        `${fieldName}[${i}] must be a string, got ${typeof element}`,
        { fieldName, index: i, value: element }
      );
    }

    // Check for empty strings if not allowed
    if (!allowEmpty && element.trim().length === 0) {
      throw new ValidationError(
        `${fieldName}[${i}] cannot be empty or whitespace-only`,
        { fieldName, index: i, value: element }
      );
    }
  }

  return arr as string[];
}
