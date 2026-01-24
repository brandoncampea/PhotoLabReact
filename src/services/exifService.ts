import { PhotoMetadata } from '../types';

// Simulated EXIF reading - in production, use a library like exifr or exif-js
export const exifService = {
  async extractMetadata(file: File): Promise<PhotoMetadata> {
    return new Promise((resolve) => {
      const reader = new FileReader();
      
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          // In a real implementation, you would use an EXIF library here
          // For demo purposes, we'll generate simulated metadata
          const metadata: PhotoMetadata = {
            cameraMake: 'Canon',
            cameraModel: 'EOS R5',
            dateTaken: new Date().toISOString(),
            iso: '400',
            aperture: 'f/2.8',
            shutterSpeed: '1/250',
            focalLength: '50mm',
            width: img.width,
            height: img.height,
            fileSize: file.size,
          };
          
          console.log('📷 EXIF extracted:', metadata);
          resolve(metadata);
        };
        
        img.onerror = () => {
          // Return basic metadata if image fails to load
          resolve({
            dateTaken: new Date().toISOString(),
            fileSize: file.size,
          });
        };
        
        if (e.target?.result) {
          img.src = e.target.result as string;
        }
      };
      
      reader.onerror = () => {
        resolve({
          dateTaken: new Date().toISOString(),
          fileSize: file.size,
        });
      };
      
      reader.readAsDataURL(file);
    });
  },

  searchInMetadata(photo: { fileName: string; metadata?: PhotoMetadata }, searchTerm: string): boolean {
    if (!searchTerm) return true;
    
    const term = searchTerm.toLowerCase();
    
    // Search in filename
    if (photo.fileName.toLowerCase().includes(term)) return true;
    
    if (!photo.metadata) return false;
    
    // Search in metadata fields
    const searchableFields = [
      photo.metadata.cameraMake,
      photo.metadata.cameraModel,
      photo.metadata.iso,
      photo.metadata.aperture,
      photo.metadata.shutterSpeed,
      photo.metadata.focalLength,
    ];
    
    return searchableFields.some(field => 
      field?.toLowerCase().includes(term)
    );
  },
};
