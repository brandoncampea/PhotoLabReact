import React, { useEffect, useState } from 'react';
import { useSasUrl } from '../hooks/useSasUrl';
import { Watermark } from '../types';
import { watermarkService } from '../services/watermarkService';
import { getBlobUrl } from '../utils/getBlobUrl';

interface WatermarkedImageProps {
  src: string;
  alt: string;
  className?: string;
  style?: React.CSSProperties;
  fill?: boolean;
}

const WatermarkedImage: React.FC<WatermarkedImageProps> = ({ src, alt, className, style, fill = true }) => {
  const [watermark, setWatermark] = useState<Watermark | null>(null);
  const [imageKey, setImageKey] = useState(Date.now());

  useEffect(() => {
    loadWatermark();
    // Reload watermark every 60 seconds to catch updates
    const interval = setInterval(() => {
      loadWatermark();
      setImageKey(Date.now());
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  const loadWatermark = async () => {
    try {
      const defaultWatermark = await watermarkService.getDefaultWatermark(1);
      setWatermark(defaultWatermark);
    } catch (error) {
      console.error('Failed to load watermark:', error);
    }
  };

  const getWatermarkStyle = (): React.CSSProperties => {
    if (!watermark) return {};

    const baseStyle: React.CSSProperties = {
      position: 'absolute',
      opacity: watermark.opacity,
      pointerEvents: 'none',
      zIndex: 1,
    };

    if (watermark.tiled) {
      // Tiled watermark - repeat across the entire image
      return {
        ...baseStyle,
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundImage: `url(${watermark.imageUrl})`,
        backgroundRepeat: 'repeat',
        backgroundSize: '200px auto',
        backgroundPosition: 'center',
      };
    } else {
      // Single positioned watermark
      const positionStyles: Record<string, React.CSSProperties> = {
        center: {
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
        },
        'top-left': {
          top: '10px',
          left: '10px',
        },
        'top-right': {
          top: '10px',
          right: '10px',
        },
        'bottom-left': {
          bottom: '10px',
          left: '10px',
        },
        'bottom-right': {
          bottom: '10px',
          right: '10px',
        },
      };

      return {
        ...baseStyle,
        ...positionStyles[watermark.position],
        maxWidth: '40%',
        maxHeight: '40%',
      };
    }
  };
  const containerStyle: React.CSSProperties = fill
    ? { position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'hidden' }
    : { position: 'relative', width: '100%', height: 'auto', overflow: 'hidden' };

  const imageStyle: React.CSSProperties = fill
    ? { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', ...style }
    : { width: '100%', height: 'auto', display: 'block', objectFit: 'contain', ...style };

  // If src is a full URL, use it directly. If it's a legacy /uploads/ path or API route, use as-is. Otherwise, use SAS URL for Azure Blob Storage.
  const isFullUrl = src.startsWith('http://') || src.startsWith('https://');
  const isApiOrUploads = src.startsWith('/api/') || src.startsWith('/uploads/');
  const sasUrl = !isFullUrl && !isApiOrUploads ? useSasUrl(src) : null;
  const resolvedSrc = isFullUrl || isApiOrUploads ? src : (sasUrl || '');
  // For watermark, if watermark.imageUrl starts with /uploads/, strip it before getBlobUrl
  let watermarkUrl = watermark?.imageUrl || '';
  if (watermarkUrl.startsWith('/uploads/')) {
    watermarkUrl = watermarkUrl.replace(/^\/uploads\//, '');
  }
  return (
    <div style={containerStyle}>
      <img
        src={resolvedSrc}
        alt={alt}
        className={className}
        style={imageStyle}
      />
      {watermark && (
        <div style={getWatermarkStyle()}>
          {!watermark.tiled && (
            <img 
              key={imageKey}
              src={getBlobUrl(watermarkUrl)} 
              alt="Watermark" 
              style={{ 
                width: '100%', 
                height: '100%', 
                objectFit: 'contain',
                display: 'block' 
              }} 
            />
          )}
        </div>
      )}
    </div>
  );
};

export default WatermarkedImage;
