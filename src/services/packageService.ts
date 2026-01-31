import api from './api';
import { Package } from '../types';

export const packageService = {
  async getAll(priceListId?: number): Promise<Package[]> {
    const url = priceListId ? `/packages?priceListId=${priceListId}` : '/packages';
    const response = await api.get(url);
    return response.data;
  },

  async getById(id: number): Promise<Package | null> {
    try {
      const response = await api.get(`/packages/${id}`);
      return response.data;
    } catch (error) {
      console.error('Failed to fetch package:', error);
      return null;
    }
  },

  async create(data: any): Promise<any> {
    const response = await api.post('/packages', data);
    return response.data;
  },

  async update(id: number, data: any): Promise<any> {
    const response = await api.put(`/packages/${id}`, data);
    return response.data;
  },

  async delete(id: number): Promise<void> {
    await api.delete(`/packages/${id}`);
  },

  /**
   * Calculate the total retail value if package items were purchased separately
   */
  calculateRetailValue(pkg: Package): number {
    return pkg.items.reduce((total, item) => {
      const itemPrice = item.productSize?.price || 0;
      return total + (itemPrice * item.quantity);
    }, 0);
  },

  /**
   * Calculate savings when buying package vs individual items
   */
  calculateSavings(pkg: Package): number {
    const retailValue = this.calculateRetailValue(pkg);
    return retailValue - pkg.packagePrice;
  },

  /**
   * Get savings percentage
   */
  getSavingsPercentage(pkg: Package): number {
    const retailValue = this.calculateRetailValue(pkg);
    if (retailValue === 0) return 0;
    const savings = this.calculateSavings(pkg);
    return Math.round((savings / retailValue) * 100);
  },
};
