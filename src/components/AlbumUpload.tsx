import React, { useState } from 'react';
import Papa from 'papaparse';
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
    const [players, setPlayers] = useState<Player[]>([]);
    const [csvFile, setCsvFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [csvError, setCsvError] = useState<string>('');

  // Handle image drag-and-drop
  const handleImageDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
    setImages(prev => [...prev, ...files.map(file => ({ file }))]);
  };

  // Handle CSV upload
  const handleCsvUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
      setCsvFile(file);
      Papa.parse(file, {
      header: true,
      complete: (results: Papa.ParseResult<Player>) => {
        if (results.errors.length) {
          setCsvError('CSV parsing error');
          return;
        }
        setPlayers(results.data as Player[]);
        setCsvError('');
      },
    });
  };

  // Match images to players by filename
  const matchImagesToPlayers = () => {
    return images.map(img => {
      const baseName = img.file.name.replace(/\.[^.]+$/, '');
      const player = players.find(p => baseName.includes(p.number) || baseName.includes(p.name));
      return { ...img, player };
    });
  };

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
      // If not found by number, try face matching (simple demo)
      if (!player && detections.length && players.length) {
        // In production, you'd compare face descriptors to known player descriptors
        // Here, just tag as 'Face detected' for demo
        player = { name: 'Face detected', number: '' };
      }
      detectedPlayers.push(player || { name: 'Unknown', number: '' });
      formData.append('photos', img.file);
      URL.revokeObjectURL(url);
      setUploadProgress(Math.round(((i + 1) / images.length) * 100));
    }
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
      <h2>Album Upload</h2>
      <div
        onDrop={handleImageDrop}
        onDragOver={e => e.preventDefault()}
        className="album-upload-dropzone"
      >
        Drag and drop images here
      </div>
      <input type="file" accept=".csv" onChange={handleCsvUpload} />
      {csvError && <div className="album-upload-csv-error">{csvError}</div>}
      <button onClick={handleUpload} disabled={!images.length || !players.length}>Upload Album</button>
      <div>Upload Progress: {uploadProgress}%</div>
      <ul>
        {matchImagesToPlayers().map((img, idx) => (
          <li key={idx}>
            {img.file.name} {img.player ? `→ ${img.player.name} (#${img.player.number})` : '(no match)'}
          </li>
        ))}
      </ul>
    </div>
  );
}
