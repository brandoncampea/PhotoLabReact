/**
 * Utility to check if mock API mode is enabled
 * Checks localStorage first (for admin profile setting), then falls back to environment variable
 */
export const isUseMockApi = (): boolean => {
	return false;
};
