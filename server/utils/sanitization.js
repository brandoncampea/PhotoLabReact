import validator from 'validator';

/**
 * Sanitization utilities for input validation
 * Provides safe methods to validate and sanitize user input
 */

/**
 * Sanitize string input - removes XSS vectors
 * @param {string} input - The input string to sanitize
 * @param {number} maxLength - Maximum allowed length (optional)
 * @returns {string} - Sanitized string
 */
export const sanitizeString = (input, maxLength = 500) => {
  if (typeof input !== 'string') return '';
  
  // Trim and limit length
  let cleaned = input.trim().slice(0, maxLength);
  
  // Escape HTML special characters
  cleaned = validator.escape(cleaned);
  
  return cleaned;
};

/**
 * Sanitize email input
 * @param {string} email - The email to sanitize
 * @returns {string} - Sanitized and normalized email
 */
export const sanitizeEmail = (email) => {
  if (typeof email !== 'string') return '';
  
  const normalized = email.trim().toLowerCase();
  
  if (!validator.isEmail(normalized)) {
    throw new Error('Invalid email format');
  }
  
  return validator.normalizeEmail(normalized);
};

/**
 * Sanitize URL input
 * @param {string} url - The URL to sanitize
 * @returns {string} - Sanitized URL
 */
export const sanitizeUrl = (url) => {
  if (typeof url !== 'string') return '';
  
  const trimmed = url.trim();
  
  // Only allow http and https protocols
  if (!validator.isURL(trimmed, {
    protocols: ['http', 'https'],
    require_protocol: true,
  })) {
    throw new Error('Invalid URL format');
  }
  
  return trimmed;
};

/**
 * Sanitize numeric input
 * @param {any} input - The input to convert to a number
 * @param {number} min - Minimum allowed value (optional)
 * @param {number} max - Maximum allowed value (optional)
 * @returns {number} - Sanitized number
 */
export const sanitizeNumber = (input, min = null, max = null) => {
  const num = Number(input);
  
  if (!Number.isFinite(num)) {
    throw new Error('Invalid number format');
  }
  
  if (min !== null && num < min) {
    throw new Error(`Number must be at least ${min}`);
  }
  
  if (max !== null && num > max) {
    throw new Error(`Number must not exceed ${max}`);
  }
  
  return num;
};

/**
 * Sanitize integer input
 * @param {any} input - The input to convert to an integer
 * @param {number} min - Minimum allowed value (optional)
 * @param {number} max - Maximum allowed value (optional)
 * @returns {number} - Sanitized integer
 */
export const sanitizeInteger = (input, min = null, max = null) => {
  const num = Number(input);
  
  if (!Number.isInteger(num)) {
    throw new Error('Invalid integer format');
  }
  
  if (min !== null && num < min) {
    throw new Error(`Integer must be at least ${min}`);
  }
  
  if (max !== null && num > max) {
    throw new Error(`Integer must not exceed ${max}`);
  }
  
  return num;
};

/**
 * Sanitize boolean input
 * @param {any} input - The input to convert to a boolean
 * @returns {boolean} - Sanitized boolean
 */
export const sanitizeBoolean = (input) => {
  if (typeof input === 'boolean') return input;
  if (typeof input === 'string') {
    return validator.toBoolean(input, true);
  }
  return Boolean(input);
};

/**
 * Sanitize array of strings
 * @param {any} input - The input array
 * @param {number} maxItems - Maximum number of items
 * @param {number} maxItemLength - Maximum length per item
 * @returns {string[]} - Sanitized array
 */
export const sanitizeStringArray = (input, maxItems = 100, maxItemLength = 500) => {
  if (!Array.isArray(input)) return [];
  
  return input
    .slice(0, maxItems)
    .map(item => sanitizeString(item, maxItemLength))
    .filter(item => item.length > 0);
};

/**
 * Sanitize object by applying sanitizers to known fields
 * @param {object} obj - The object to sanitize
 * @param {object} schema - Schema defining how to sanitize each field
 *   Example: { name: 'string', email: 'email', count: 'integer' }
 * @returns {object} - Sanitized object
 */
export const sanitizeObject = (obj, schema) => {
  if (typeof obj !== 'object' || obj === null) return {};
  
  const sanitized = {};
  
  for (const [key, type] of Object.entries(schema)) {
    const value = obj[key];
    
    if (value === null || value === undefined) {
      continue;
    }
    
    try {
      switch (type) {
        case 'string':
          sanitized[key] = sanitizeString(value);
          break;
        case 'email':
          sanitized[key] = sanitizeEmail(value);
          break;
        case 'url':
          sanitized[key] = sanitizeUrl(value);
          break;
        case 'number':
          sanitized[key] = sanitizeNumber(value);
          break;
        case 'integer':
          sanitized[key] = sanitizeInteger(value);
          break;
        case 'boolean':
          sanitized[key] = sanitizeBoolean(value);
          break;
        case 'stringArray':
          sanitized[key] = sanitizeStringArray(value);
          break;
        default:
          sanitized[key] = value;
      }
    } catch (err) {
      console.warn(`Sanitization failed for field ${key}:`, err.message);
      // Continue without this field rather than throwing
    }
  }
  
  return sanitized;
};

export default {
  sanitizeString,
  sanitizeEmail,
  sanitizeUrl,
  sanitizeNumber,
  sanitizeInteger,
  sanitizeBoolean,
  sanitizeStringArray,
  sanitizeObject,
};
