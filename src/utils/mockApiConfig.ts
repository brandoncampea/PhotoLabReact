/**
 * Utility to check if mock API mode is enabled
 * Checks localStorage first (for admin profile setting), then falls back to environment variable
 */
export const isUseMockApi = (): boolean => {
  // Check localStorage first (set by Admin Profile)
  const stored = localStorage.getItem('VITE_USE_MOCK_API');
  if (stored !== null) {
    return stored === 'true';
  }
  
  // Fall back to environment variable
  return import.meta.env.VITE_USE_MOCK_API === 'true';
};
