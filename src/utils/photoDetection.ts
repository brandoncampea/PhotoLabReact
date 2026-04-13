import { Photo } from '../types';
import { detectFaceBoxesFromImageElement, FaceTagBox } from './faceDetection';

export type ServerPhotoDetection = {
  photoId: number;
  detectedNumbers: string[];
  usedCachedDetections?: boolean;
  detectedNumbersUpdatedAt?: string | null;
  numberMatchingAvailable?: boolean;
  rosterPlayersWithNumbersCount?: number;
  faceMatchingAvailable?: boolean;
  faceMatches: Array<{ playerName: string; playerNumber?: string | null; distance: number }>;
  numberMatches: Array<{ playerName: string; playerNumber?: string | null; matchedNumber: string }>;
  suggestions: Array<{ playerName: string; playerNumber?: string | null; reasons: string[]; confidence: number }>;
};

export async function runPhotoDetection(params: {
  photo: Photo;
  imageElement: HTMLImageElement | null;
  getPhotoDetections: (photoId: number) => Promise<ServerPhotoDetection>;
}): Promise<{ server: ServerPhotoDetection; face: { faceBoxes: FaceTagBox[]; error?: string | null } }> {
  const { photo, imageElement, getPhotoDetections } = params;

  const [server, face] = await Promise.all([
    getPhotoDetections(photo.id),
    imageElement
      ? detectFaceBoxesFromImageElement(imageElement)
      : Promise.resolve({ faceBoxes: [] as FaceTagBox[], error: 'Main image not available for detection.' }),
  ]);

  return { server, face };
}
