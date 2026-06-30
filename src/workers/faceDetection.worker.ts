import * as tf from '@tensorflow/tfjs';

type FaceTagBox = {
  id: string;
  leftPct: number;
  topPct: number;
  widthPct: number;
  heightPct: number;
  playerName?: string | null;
  playerNumber?: string | null;
};

const clampPercent = (v: number) => Math.max(0, Math.min(100, v));

let modelPromise: Promise<any> | null = null;

async function getModel() {
  if (!modelPromise) {
    await tf.setBackend('cpu');
    await tf.ready();
    const blazeface = await import('@tensorflow-models/blazeface');
    modelPromise = blazeface.load();
  }
  return modelPromise;
}

async function detect(imageUrl: string): Promise<{ faceBoxes: FaceTagBox[]; error: string | null }> {
  try {
    const resp = await fetch(imageUrl);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const blob = await resp.blob();

    const bitmap = await createImageBitmap(blob);
    const { width, height } = bitmap;
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();

    const imageData = ctx.getImageData(0, 0, width, height);
    const rgba = imageData.data;
    const rgb = new Uint8Array(width * height * 3);
    for (let i = 0, j = 0; i < rgba.length; i += 4, j += 3) {
      rgb[j] = rgba[i];
      rgb[j + 1] = rgba[i + 1];
      rgb[j + 2] = rgba[i + 2];
    }

    const tensor = tf.tensor3d(rgb, [height, width, 3], 'int32');
    const model = await getModel();

    let predictions: any[];
    try {
      predictions = await model.estimateFaces(tensor) as any[];
    } finally {
      tensor.dispose();
    }

    const faceBoxes: FaceTagBox[] = (predictions || [])
      .map((pred: any, i: number): FaceTagBox => {
        const tl = Array.isArray(pred.topLeft) ? pred.topLeft : (pred.topLeft?.arraySync?.() ?? [0, 0]);
        const br = Array.isArray(pred.bottomRight) ? pred.bottomRight : (pred.bottomRight?.arraySync?.() ?? [0, 0]);
        const x1 = Number(tl[0] ?? 0);
        const y1 = Number(tl[1] ?? 0);
        const x2 = Number(br[0] ?? 0);
        const y2 = Number(br[1] ?? 0);
        return {
          id: `face-${i + 1}`,
          leftPct: clampPercent((x1 / width) * 100),
          topPct: clampPercent((y1 / height) * 100),
          widthPct: clampPercent(((x2 - x1) / width) * 100),
          heightPct: clampPercent(((y2 - y1) / height) * 100),
        };
      })
      .filter(b => b.widthPct > 0 && b.heightPct > 0);

    return { faceBoxes, error: null };
  } catch (err) {
    return {
      faceBoxes: [],
      error: err instanceof Error ? err.message : 'Face detection failed',
    };
  }
}

self.onmessage = async (event: MessageEvent<{ id: string; imageUrl: string }>) => {
  const { id, imageUrl } = event.data;
  const result = await detect(imageUrl);
  (self as any).postMessage({ id, ...result });
};
