import api from './api';

export const whccEditorService = {
  async createSession(payload: {
    productId: number;
    photoIds?: number[];
    quantity?: number;
    completeUrl?: string;
    cancelUrl?: string;
    overrideEditorProductId?: string;
    overrideEditorDesignId?: string;
  }) {
    const response = await api.post('/whcc-editor/session/create', payload);
    return response.data as {
      editorId: string | null;
      url: string | null;
      productId: number;
      productName: string;
      photoCount: number;
    };
  },
};
