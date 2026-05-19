import React, { createContext, useContext, useState, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { autoTagPhotoFromFilenameAndFaces } from '../utils/autoTagPhotoFromFilenameAndFaces';
import { photoService } from '../services/photoService';

export type UploadFileStatus = 'queued' | 'uploading' | 'done' | 'paused' | 'error';

export interface UploadFile {
  id: string;
  file: File;
  previewUrl: string;
  progress: number;
  status: UploadFileStatus;
  error?: string;
}

interface UploadContextType {
  files: UploadFile[];
  addFiles: (files: File[]) => void;
  updateFile: (id: string, updates: Partial<UploadFile>) => void;
  removeFile: (id: string) => void;
  clearFiles: () => void;
}

const UploadContext = createContext<UploadContextType | undefined>(undefined);

export const useUploadContext = () => {
  const ctx = useContext(UploadContext);
  if (!ctx) throw new Error('useUploadContext must be used within UploadProvider');
  return ctx;
};

export const UploadProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [files, setFiles] = useState<UploadFile[]>([]);
  const { user } = useAuth();

  const addFiles = useCallback((newFiles: File[]) => {
    setFiles(prev => [
      ...prev,
      ...newFiles.map(file => ({
        id: `${file.name}-${file.size}-${file.lastModified}-${Math.random()}`,
        file,
        previewUrl: URL.createObjectURL(file),
        progress: 0,
        status: 'queued' as UploadFileStatus,
      }))
    ]);
  }, []);

  const updateFile = useCallback((id: string, updates: Partial<UploadFile>) => {
    setFiles(prev => prev.map(f => f.id === id ? { ...f, ...updates } : f));
  }, []);

  const removeFile = useCallback((id: string) => {
    setFiles(prev => prev.filter(f => f.id !== id));
  }, []);

  const clearFiles = useCallback(() => {
    setFiles([]);
  }, []);

  // --- Upload logic: automatically upload queued files, but only if user is authenticated ---
  React.useEffect(() => {
    if (!user) return; // Do not upload if not authenticated
    const uploadQueuedFiles = async () => {
      for (const fileObj of files) {
        if (fileObj.status === 'queued') {
          updateFile(fileObj.id, { status: 'uploading', progress: 0 });
          try {
            const formData = new FormData();
            formData.append('photos', fileObj.file);
            const urlParams = new URLSearchParams(window.location.search);
            const albumId = urlParams.get('album');
            if (albumId) {
              formData.append('albumId', albumId);
            }
            // Add Authorization header with JWT for upload
            const token = localStorage.getItem('authToken');
            const response = await fetch('/api/photos/upload', {
              method: 'POST',
              body: formData,
              credentials: 'include',
              headers: token ? { 'Authorization': `Bearer ${token}` } : {},
            });
            if (response.ok) {
              updateFile(fileObj.id, { progress: 100, status: 'done' });
            } else {
              updateFile(fileObj.id, { status: 'error', error: response.statusText });
              throw new Error(response.statusText);
            }

            // After upload, fetch the photo and run tagging/EXIF extraction
            if (albumId) {
              const refreshedPhotos = await photoService.getPhotosByAlbum(Number(albumId));
              const latestPhoto = refreshedPhotos.find((p) => p.fileName === fileObj.file.name);
              if (latestPhoto) {
                await autoTagPhotoFromFilenameAndFaces({
                  photo: latestPhoto,
                  rosterPlayers: [],
                  photoService,
                  handleDetectPlayers: () => {},
                  detectionByPhotoId: {},
                  setDetectionByPhotoId: () => {},
                  setUploadMessage: () => {},
                  onTagged: () => {},
                });
              }
            }
          } catch (err) {
            updateFile(fileObj.id, { status: 'error', error: (err as Error).message });
          }
        }
      }
    };
    if (files.some(f => f.status === 'queued')) {
      uploadQueuedFiles();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files, user]);

  return (
    <UploadContext.Provider value={{ files, addFiles, updateFile, removeFile, clearFiles }}>
      {children}
    </UploadContext.Provider>
  );
};
