import api from './api';

type EditorPhotoInput = {
  id?: number;
  photoId?: number;
  name?: string;
  url?: string;
  thumbnailUrl?: string;
  fullImageUrl?: string;
  printUrl?: string;
  width?: number;
  height?: number;
  filetype?: 'jpg' | 'png' | string;
};

export const whccEditorService = {
  async createSession(payload: {
    productId: number;
    photoIds?: number[];
    photos?: EditorPhotoInput[];
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
