/**
 * Site configuration service
 * Manages enabled/disabled status of different printing sites (WHCC, ROES, Mpix)
 */

export interface SiteConfig {
  whccEnabled: boolean;
  roesEnabled: boolean;
  mpixEnabled: boolean;
  selectedLab: 'whcc' | 'roes' | 'mpix' | null;
}

class SiteConfigService {
  private defaultConfig: SiteConfig = {
    whccEnabled: false,
    roesEnabled: false,
    mpixEnabled: true,
    selectedLab: 'mpix',
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
        const parsed = JSON.parse(stored) as Partial<SiteConfig>;
        const merged = { ...this.defaultConfig, ...parsed };

        // Backward compatibility for older saved configs without selectedLab
        if (!merged.selectedLab) {
          if (merged.whccEnabled) merged.selectedLab = 'whcc';
          else if (merged.mpixEnabled) merged.selectedLab = 'mpix';
          else if (merged.roesEnabled) merged.selectedLab = 'roes';
          else merged.selectedLab = null;
        }

        return merged;
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
    if (enabled) {
      // Only one active lab at a time
      this.setConfig({
        whccEnabled: site === 'whcc',
        roesEnabled: site === 'roes',
        mpixEnabled: site === 'mpix',
        selectedLab: site,
      });
      return;
    }

    const current = this.getConfig();
    const updated: SiteConfig = {
      ...current,
      whccEnabled: site === 'whcc' ? false : current.whccEnabled,
      roesEnabled: site === 'roes' ? false : current.roesEnabled,
      mpixEnabled: site === 'mpix' ? false : current.mpixEnabled,
      selectedLab: current.selectedLab,
    };

    if (updated.selectedLab === site) {
      if (updated.whccEnabled) updated.selectedLab = 'whcc';
      else if (updated.mpixEnabled) updated.selectedLab = 'mpix';
      else if (updated.roesEnabled) updated.selectedLab = 'roes';
      else updated.selectedLab = null;
    }

    this.setConfig(updated);
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
   * Get currently selected (active) lab
   */
  getSelectedLab(): 'whcc' | 'roes' | 'mpix' | null {
    return this.getConfig().selectedLab;
  }

  /**
   * Reset to default configuration
   */
  reset(): void {
    localStorage.removeItem('siteConfig');
  }
}

export const siteConfigService = new SiteConfigService();
