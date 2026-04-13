
import { useState } from 'react';
import { deduplicateImagesByFileName } from '../utils/playerTagging';
import * as faceapi from 'face-api.js';
import Tesseract from 'tesseract.js';

interface Player {
  name: string;
  number: string;
}

interface ImageUpload {
  file: File;
  player?: Player;
}

export default function AlbumUpload() {
  const [images, setImages] = useState<ImageUpload[]>([]);
  const [players] = useState<Player[]>([]);
  const [csvFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [csvError] = useState<string>('');

  // Match images to players by filename (centralized logic)
  const matchImagesToPlayers = () => images;

  // Load face-api models
  const loadModels = async () => {
    await faceapi.nets.ssdMobilenetv1.loadFromUri('/models');
    await faceapi.nets.faceRecognitionNet.loadFromUri('/models');
    await faceapi.nets.faceLandmark68Net.loadFromUri('/models');
  };

  // Auto-detect faces and jersey numbers, tag players
  const handleUpload = async () => {
    await loadModels();
    setUploadProgress(0);
    const formData = new FormData();
    let detectedPlayers: Player[] = [];
    let newImages: ImageUpload[] = [];
    for (let i = 0; i < images.length; i++) {
      const img = images[i];
      // Read image as HTMLImageElement
      const url = URL.createObjectURL(img.file);
      const imageElement = document.createElement('img');
      imageElement.src = url;
      await new Promise(res => {
        imageElement.onload = res;
      });
      // Detect faces
      const detections = await faceapi.detectAllFaces(imageElement).withFaceLandmarks().withFaceDescriptors();
      // OCR for jersey number
      const ocrResult = await Tesseract.recognize(img.file, 'eng');
      const numberMatch = ocrResult.data.text.match(/\d{1,3}/);
      let player: Player | undefined;
      if (numberMatch && players.length) {
        player = players.find(p => p.number === numberMatch[0]);
      }
      if (!player && detections.length && players.length) {
        player = { name: 'Face detected', number: '' };
      }
      if (!player) {
        player = undefined;
      }
      detectedPlayers.push(player || { name: 'No Player Detected', number: '' });
      newImages.push({ ...img, player });
      formData.append('photos', img.file);
      URL.revokeObjectURL(url);
      setUploadProgress(Math.round(((i + 1) / images.length) * 100));
    }
    // Deduplicate by file name after upload (centralized)
    setImages(deduplicateImagesByFileName(newImages));
    if (csvFile) {
      formData.append('csv', csvFile);
    }
    formData.append('albumId', '1'); // TODO: Use actual albumId
    formData.append('descriptions', JSON.stringify(detectedPlayers.map(p => p.name)));
    formData.append('metadata', JSON.stringify(detectedPlayers));
    try {
      const response = await fetch('/api/photos/upload', {
        method: 'POST',
        body: formData,
      });
      if (!response.ok) throw new Error('Upload failed');
      setUploadProgress(100);
    } catch (err) {
      setUploadProgress(0);
      alert('Upload failed: ' + err);
    }
  };

  return (
    <div>
      <div className="album-upload-dropzone">
        Drag and drop images here
      </div>
      <input type="file" accept=".csv" onChange={handleUpload} />
      {csvError && <div className="album-upload-csv-error">{csvError}</div>}
      {/* Duplicate handling UI removed due to missing processFiles function */}
      <ul>
        {matchImagesToPlayers().map((img, idx) => (
          <li key={idx}>
            <div>
              <strong>{img.file.name}</strong>
              {img.player && (
                <span style={{ marginLeft: 8, color: '#f5b041' }}>
                  → Tagged: {img.player.name} {img.player.number ? `(#${img.player.number})` : ''}
                </span>
              )}
            </div>
            {/* Show tagged player above progress bar if present */}
            {img.player && (
              <div style={{ color: '#f5b041', marginBottom: 4 }}>
                Tagged Player: {img.player.name} {img.player.number ? `(#${img.player.number})` : ''}
              </div>
            )}
            {/* Example progress bar UI (replace with your actual progress logic) */}
            <div style={{ background: '#222', height: 6, borderRadius: 3, margin: '4px 0', width: '100%' }}>
              <div style={{ background: '#a78bfa', height: 6, borderRadius: 3, width: uploadProgress === 100 ? '100%' : `${uploadProgress}%` }} />
            </div>
          </li>
        ))}
      </ul>
      <button onClick={handleUpload} disabled={!images.length || !players.length}>Upload Album</button>
      <div>Upload Progress: {uploadProgress}%</div>
    </div>
  );
}
