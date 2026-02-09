/**
 * Utility to check if mock API mode is enabled
 * Checks localStorage first (for admin profile setting), then falls back to environment variable
 */
// Force mock API off in all environments
export const isUseMockApi = (): boolean => false;
