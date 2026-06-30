import { Photo } from '../types';
import FaceDetectionWorker from '../workers/faceDetection.worker?worker';

export type FaceTagBox = {
  id: string;
  leftPct: number;
  topPct: number;
  widthPct: number;
  heightPct: number;
  playerName?: string | null;
  playerNumber?: string | null;
};

type WorkerResponse = { id: string; faceBoxes: FaceTagBox[]; error: string | null };
type PendingEntry = { resolve: (r: { faceBoxes: FaceTagBox[]; error: string | null }) => void; reject: (e: Error) => void };

let worker: Worker | null = null;
let reqId = 0;
const pending = new Map<string, PendingEntry>();

function getWorker(): Worker {
  if (!worker) {
    worker = new FaceDetectionWorker();
    worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const entry = pending.get(e.data.id);
      if (entry) {
        pending.delete(e.data.id);
        entry.resolve({ faceBoxes: e.data.faceBoxes, error: e.data.error });
      }
    };
    worker.onerror = () => {
      pending.forEach(e => e.reject(new Error('Face detection worker failed')));
      pending.clear();
      worker = null;
    };
  }
  return worker;
}

export async function detectFaceBoxes(
  photo: Photo,
  resolvePhotoImageUrl: (photo: Photo) => Promise<string | null>
): Promise<{ faceBoxes: FaceTagBox[]; error?: string | null }> {
  try {
    const imageUrl = await resolvePhotoImageUrl(photo);
    if (!imageUrl) return { faceBoxes: [], error: 'Could not resolve image URL' };

    const id = String(++reqId);
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      getWorker().postMessage({ id, imageUrl });
    });
  } catch {
    return { faceBoxes: [], error: 'Face detection failed' };
  }
}

// Delegates to the worker via an in-memory data URL — kept for backward compatibility
export async function detectFaceBoxesFromImageElement(
  image: HTMLImageElement
): Promise<{ faceBoxes: FaceTagBox[]; error?: string | null }> {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth || image.width;
    canvas.height = image.naturalHeight || image.height;
    canvas.getContext('2d')!.drawImage(image, 0, 0);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    const id = String(++reqId);
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      getWorker().postMessage({ id, imageUrl: dataUrl });
    });
  } catch {
    return { faceBoxes: [], error: 'Face detection failed' };
  }
}
