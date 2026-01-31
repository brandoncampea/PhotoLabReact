/**
 * Site configuration service
 * Manages enabled/disabled status of different printing sites (WHCC, ROES, Mpix)
 */

export interface SiteConfig {
  whccEnabled: boolean;
  roesEnabled: boolean;
  mpixEnabled: boolean;
}

class SiteConfigService {
  private defaultConfig: SiteConfig = {
    whccEnabled: false,
    roesEnabled: false,
    mpixEnabled: true,
  };

  /**
   * Get site configuration
   */
  getConfig(): SiteConfig {
    try {
      if (typeof window === 'undefined') {
        return this.defaultConfig;
      }

      const stored = localStorage.getItem('siteConfig');
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (error) {
      console.warn('Failed to load site config:', error);
    }

    return this.defaultConfig;
  }

  /**
   * Set site configuration
   */
  setConfig(config: Partial<SiteConfig>): void {
    try {
      const current = this.getConfig();
      const updated = { ...current, ...config };
      localStorage.setItem('siteConfig', JSON.stringify(updated));
    } catch (error) {
      console.error('Failed to save site config:', error);
    }
  }

  /**
   * Enable/disable a specific site
   */
  setSiteEnabled(site: 'whcc' | 'roes' | 'mpix', enabled: boolean): void {
    if (site === 'whcc') {
      this.setConfig({ whccEnabled: enabled });
    } else if (site === 'roes') {
      this.setConfig({ roesEnabled: enabled });
    } else if (site === 'mpix') {
      this.setConfig({ mpixEnabled: enabled });
    }
  }

  /**
   * Check if a specific site is enabled
   */
  isSiteEnabled(site: 'whcc' | 'roes' | 'mpix'): boolean {
    const config = this.getConfig();
    if (site === 'whcc') return config.whccEnabled;
    if (site === 'roes') return config.roesEnabled;
    if (site === 'mpix') return config.mpixEnabled;
    return false;
  }

  /**
   * Reset to default configuration
   */
  reset(): void {
    localStorage.removeItem('siteConfig');
  }
}

export const siteConfigService = new SiteConfigService();
