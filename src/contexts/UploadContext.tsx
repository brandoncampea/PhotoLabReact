import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
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
  const filesRef = useRef<UploadFile[]>([]);
  const { user } = useAuth();
  const uploadingRef = useRef(false);
  // Incremented each time new files are queued; effect depends on this instead of `files`
  // to avoid re-running on every individual file status update.
  const [uploadTick, setUploadTick] = useState(0);

  const addFiles = useCallback((newFiles: File[]) => {
    setFiles(prev => {
      // Deduplicate by name, size, lastModified
      const existingKeys = new Set(prev.map(f => `${f.file.name}-${f.file.size}-${f.file.lastModified}`));
      const deduped = newFiles.filter(file => {
        const key = `${file.name}-${file.size}-${file.lastModified}`;
        return !existingKeys.has(key);
      });
      if (deduped.length === 0) return prev;
      const next = [
        ...prev,
        ...deduped.map(file => ({
          id: `${file.name}-${file.size}-${file.lastModified}-${Math.random()}`,
          file,
          previewUrl: URL.createObjectURL(file),
          progress: 0,
          status: 'queued' as UploadFileStatus,
        }))
      ];
      filesRef.current = next;
      return next;
    });
    setUploadTick(t => t + 1);
  }, []);

  const updateFile = useCallback((id: string, updates: Partial<UploadFile>) => {
    setFiles(prev => {
      const next = prev.map(f => f.id === id ? { ...f, ...updates } : f);
      filesRef.current = next;
      return next;
    });
  }, []);

  const removeFile = useCallback((id: string) => {
    setFiles(prev => prev.filter(f => f.id !== id));
  }, []);

  const clearFiles = useCallback(() => {
    filesRef.current = [];
    setFiles([]);
  }, []);

  // --- Upload logic: automatically upload queued files with up to 5 concurrent uploads ---
  // Triggered by uploadTick (incremented when files are added) rather than `files` state,
  // so status updates (queued→uploading→done) don't spawn redundant pool instances.
  // uploadingRef prevents a second pool from starting while one is already running.
  React.useEffect(() => {
    if (!user || uploadingRef.current) return;

    const startPool = () => {
      const queued = filesRef.current.filter(f => f.status === 'queued');
      if (queued.length === 0) return;

      uploadingRef.current = true;

      const CONCURRENCY = 5;
      const token = localStorage.getItem('authToken');
      const urlParams = new URLSearchParams(window.location.search);
      const albumId = urlParams.get('album');

      const uploadOne = (fileObj: UploadFile): Promise<void> => {
        updateFile(fileObj.id, { status: 'uploading', progress: 0 });
        return new Promise<void>((resolve) => {
          const formData = new FormData();
          formData.append('photos', fileObj.file);
          if (albumId) formData.append('albumId', albumId);

          const xhr = new XMLHttpRequest();
          xhr.open('POST', '/api/photos/upload');
          xhr.withCredentials = true;
          if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);

          xhr.upload.onprogress = (event) => {
            if (event.lengthComputable) {
              updateFile(fileObj.id, { progress: Math.round((event.loaded / event.total) * 100) });
            }
          };

          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              updateFile(fileObj.id, { progress: 100, status: 'done' });
              // Use the photo returned in the upload response — avoids a full album fetch
              try {
                const uploaded: any[] = JSON.parse(xhr.responseText);
                const photo = Array.isArray(uploaded) ? uploaded[0] : uploaded;
                if (photo?.id) {
                  autoTagPhotoFromFilenameAndFaces({
                    photo,
                    rosterPlayers: [],
                    photoService,
                    handleDetectPlayers: () => {},
                    detectionByPhotoId: {},
                    setDetectionByPhotoId: () => {},
                    setUploadMessage: () => {},
                    onTagged: () => {},
                  }).catch(() => {});
                }
              } catch {
                // non-fatal — tagging will be skipped
              }
            } else {
              updateFile(fileObj.id, { status: 'error', error: xhr.statusText });
            }
            resolve();
          };

          xhr.onerror = () => {
            updateFile(fileObj.id, { status: 'error', error: xhr.statusText });
            resolve();
          };

          xhr.send(formData);
        });
      };

      const runPool = async () => {
        let idx = 0;
        const worker = async () => {
          while (idx < queued.length) {
            const fileObj = queued[idx++];
            await uploadOne(fileObj);
          }
        };
        await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queued.length) }, worker));
        uploadingRef.current = false;
        // If more files were added while the pool was running, start another pool for them
        startPool();
      };

      runPool();
    };

    startPool();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uploadTick, user]);

  return (
    <UploadContext.Provider value={{ files, addFiles, updateFile, removeFile, clearFiles }}>
      {children}
    </UploadContext.Provider>
  );
};
