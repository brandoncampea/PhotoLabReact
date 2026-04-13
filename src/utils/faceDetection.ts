import { Photo } from '../types';

export type FaceTagBox = {
  id: string;
  leftPct: number;
  topPct: number;
  widthPct: number;
  heightPct: number;
  playerName?: string | null;
  playerNumber?: string | null;
};

const clampPercent = (value: number) => Math.max(0, Math.min(100, value));

const loadImageElement = (src: string) => new Promise<HTMLImageElement>((resolve, reject) => {
  const image = new Image();
  image.crossOrigin = 'anonymous';
  image.onload = () => resolve(image);
  image.onerror = () => reject(new Error('Failed to load image for face detection'));
  image.src = src;
});


import * as tf from '@tensorflow/tfjs';

const getBlazeFaceModel = async () => {
  // Ensure tf is ready and backend is set
  await tf.ready();
  const backend = tf.getBackend();
  if (backend !== 'webgl' && backend !== 'cpu') {
    // Try to set to webgl, fallback to cpu
    try {
      await tf.setBackend('webgl');
    } catch {
      await tf.setBackend('cpu');
    }
  }
  // @ts-ignore
  if (!window._blazeFaceModelPromise) {
    // @ts-ignore
    window._blazeFaceModelPromise = import('@tensorflow-models/blazeface').then((blazeface) => blazeface.load());
  }
  // @ts-ignore
  return window._blazeFaceModelPromise;
};

export async function detectFaceBoxesFromImageElement(image: HTMLImageElement): Promise<{ faceBoxes: FaceTagBox[]; error?: string | null }> {
  try {
    const width = Number(image.naturalWidth || image.width || 0);
    const height = Number(image.naturalHeight || image.height || 0);
    if (!width || !height) {
      return { faceBoxes: [], error: 'Image dimensions were unavailable for face detection.' };
    }

    const model = await getBlazeFaceModel();
    const predictions = await model.estimateFaces(image, false);
    const mappedFaceBoxes: FaceTagBox[] = (predictions || []).map((prediction: any, index: number): FaceTagBox => {
      const topLeft = Array.isArray(prediction.topLeft)
        ? prediction.topLeft
        : (prediction.topLeft?.arraySync?.() || [0, 0]);
      const bottomRight = Array.isArray(prediction.bottomRight)
        ? prediction.bottomRight
        : (prediction.bottomRight?.arraySync?.() || [0, 0]);
      const x1 = Number(topLeft?.[0] || 0);
      const y1 = Number(topLeft?.[1] || 0);
      const x2 = Number(bottomRight?.[0] || 0);
      const y2 = Number(bottomRight?.[1] || 0);
      const boxWidth = Math.max(0, x2 - x1);
      const boxHeight = Math.max(0, y2 - y1);
      return {
        id: `face-${index + 1}`,
        leftPct: clampPercent((x1 / width) * 100),
        topPct: clampPercent((y1 / height) * 100),
        widthPct: clampPercent((boxWidth / width) * 100),
        heightPct: clampPercent((boxHeight / height) * 100),
      };
    });

    const faceBoxes: FaceTagBox[] = mappedFaceBoxes.filter((box) => box.widthPct > 0 && box.heightPct > 0);
    return { faceBoxes, error: null };
  } catch (error) {
    console.error('Client-side face box detection failed:', error);
    return { faceBoxes: [], error: 'Face boxes could not be detected for this image.' };
  }
}

export async function detectFaceBoxes(photo: Photo, resolvePhotoImageUrl: (photo: Photo) => Promise<string | null>): Promise<{ faceBoxes: FaceTagBox[]; error?: string | null }> {
  try {
    const imageUrl = await resolvePhotoImageUrl(photo);
    if (!imageUrl) {
      return { faceBoxes: [], error: 'Could not load image for face detection.' };
    }
    const image = await loadImageElement(imageUrl);
    return detectFaceBoxesFromImageElement(image);
  } catch (error) {
    console.error('Client-side face box detection failed:', error);
    return { faceBoxes: [], error: 'Face boxes could not be detected for this image.' };
  }
}
