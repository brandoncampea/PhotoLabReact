import { useState, useEffect } from 'react';
import { roesService, RoesConfig } from '../services/roesService';

/**
 * Hook to check ROES enabled status and get config
 * Subscribes to localStorage changes for reactive updates
 */
export function useRoesConfig() {
  const [config, setConfig] = useState<RoesConfig | null>(roesService.getConfig());
  const [isEnabled, setIsEnabled] = useState(roesService.isEnabled());

  useEffect(() => {
    // Initial load
    const currentConfig = roesService.getConfig();
    setConfig(currentConfig);
    setIsEnabled(currentConfig?.enabled ?? false);

    // Listen for storage changes (e.g., from admin panel)
    const handleStorageChange = () => {
      const updated = roesService.getConfig();
      setConfig(updated);
      setIsEnabled(updated?.enabled ?? false);
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  return { config, isEnabled };
}
