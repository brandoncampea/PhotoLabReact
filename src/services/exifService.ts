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

  /**
   * Search in photo metadata and return matching field name
   * @returns { matches: boolean, matchField?: string } - matches and optionally the field that matched
   */
  searchInMetadataWithField(
    photo: { fileName: string; metadata?: PhotoMetadata; playerNames?: string; description?: string },
    searchTerm: string
  ): { matches: boolean; matchField?: string } {
    if (!searchTerm) return { matches: true };
    
    const term = searchTerm.toLowerCase();
    
    // Search in filename
    if (photo.fileName.toLowerCase().includes(term)) {
      return { matches: true, matchField: 'Filename' };
    }
    
    // Search in description
    if (photo.description?.toLowerCase().includes(term)) {
      return { matches: true, matchField: 'Description' };
    }
    
    // Search in player names
    if (photo.playerNames?.toLowerCase().includes(term)) {
      return { matches: true, matchField: 'Player' };
    }
    
    if (!photo.metadata) {
      return { matches: false };
    }
    
    // Search in metadata fields
    const metadataFields: { [key: string]: string | undefined } = {
      'Camera Make': photo.metadata.cameraMake,
      'Camera Model': photo.metadata.cameraModel,
      'ISO': photo.metadata.iso,
      'Aperture': photo.metadata.aperture,
      'Shutter Speed': photo.metadata.shutterSpeed,
      'Focal Length': photo.metadata.focalLength,
      'Date': photo.metadata.dateTaken,
      'Resolution': photo.metadata.width && photo.metadata.height 
        ? `${photo.metadata.width}x${photo.metadata.height}`
        : undefined,
    };
    
    for (const [fieldName, fieldValue] of Object.entries(metadataFields)) {
      if (fieldValue?.toLowerCase().includes(term)) {
        return { matches: true, matchField: fieldName };
      }
    }
    
    return { matches: false };
  },

  // Backward compatibility - original function still works
  searchInMetadata(photo: { fileName: string; metadata?: PhotoMetadata; playerNames?: string }, searchTerm: string): boolean {
    return this.searchInMetadataWithField(photo, searchTerm).matches;
  },

  /**
   * Get all metadata fields formatted for display
   */
  getMetadataDisplay(metadata: PhotoMetadata | undefined): Array<{ label: string; value: string }> {
    if (!metadata) return [];
    
    const fields: Array<{ label: string; value: string }> = [];
    
    if (metadata.cameraMake) fields.push({ label: '📷 Camera', value: `${metadata.cameraMake} ${metadata.cameraModel || ''}`.trim() });
    if (metadata.iso) fields.push({ label: '🔆 ISO', value: metadata.iso });
    if (metadata.aperture) fields.push({ label: '🔎 Aperture', value: metadata.aperture });
    if (metadata.shutterSpeed) fields.push({ label: '⏱️ Shutter Speed', value: metadata.shutterSpeed });
    if (metadata.focalLength) fields.push({ label: '🎯 Focal Length', value: metadata.focalLength });
    if (metadata.dateTaken) {
      fields.push({ 
        label: '📅 Date', 
        value: new Date(metadata.dateTaken).toLocaleDateString() 
      });
    }
    if (metadata.width && metadata.height) {
      fields.push({ label: '📐 Resolution', value: `${metadata.width}x${metadata.height}` });
    }
    
    return fields;
  },

  /**
   * Format metadata for database storage/retrieval
   */
  formatMetadataForDisplay(metadata: PhotoMetadata | undefined): string {
    if (!metadata) return '';
    
    const parts = [];
    if (metadata.cameraMake) parts.push(`📷 ${metadata.cameraMake}${metadata.cameraModel ? ` ${metadata.cameraModel}` : ''}`);
    if (metadata.iso) parts.push(`ISO ${metadata.iso}`);
    if (metadata.aperture) parts.push(metadata.aperture);
    if (metadata.shutterSpeed) parts.push(metadata.shutterSpeed);
    if (metadata.focalLength) parts.push(metadata.focalLength);
    
    return parts.join(' • ');
  },
};
