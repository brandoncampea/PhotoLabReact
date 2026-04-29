import React, { useEffect, useState } from 'react';
import { Watermark } from '../types';
import { watermarkService } from '../services/watermarkService';
import { getBlobUrl } from '../utils/getBlobUrl';

interface WatermarkedImageProps {
  src: string;
  alt: string;
  className?: string;
  style?: React.CSSProperties;
  fill?: boolean;
  studioId?: number;
}


// Simple in-memory cache for watermark per studioId
const watermarkCache: Record<string, Watermark | null> = {};

const WatermarkedImage: React.FC<WatermarkedImageProps> = ({ src, alt, className, style, fill = true, studioId }) => {
  const [watermark, setWatermark] = useState<Watermark | null>(null);
  const [watermarkLoaded, setWatermarkLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);

  // Always use backend proxy for watermark overlay images
  const resolveWatermarkUrl = (raw: string): string => {
    return watermarkService.getProxiedImageUrl(raw) || '';
  };

  useEffect(() => {
    let cancelled = false;
    const cacheKey = String(studioId || 'default');
    if (cacheKey in watermarkCache) {
      setWatermark(watermarkCache[cacheKey]);
      setWatermarkLoaded(true);
      return;
    }
    watermarkService.getDefaultWatermark(studioId ?? 0)
      .then(wm => {
        watermarkCache[cacheKey] = wm;
        if (!cancelled) setWatermark(wm);
      })
      .catch(() => {
        watermarkCache[cacheKey] = null;
        if (!cancelled) setWatermark(null);
      })
      .finally(() => { if (!cancelled) setWatermarkLoaded(true); });
    return () => { cancelled = true; };
  }, [studioId]);

  const getWatermarkStyle = (): React.CSSProperties => {
    // Always use the default watermark if watermark is missing or failed to load
    if (watermarkLoaded && !watermark) {
      return {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        opacity: 0.18,
        pointerEvents: 'none',
        zIndex: 1,
        backgroundImage: 'url(/watermark-default.png)',
        backgroundRepeat: 'repeat',
        backgroundSize: '180px auto',
        backgroundPosition: 'center',
      };
    }
    if (!watermark) return {};
    const watermarkUrl = resolveWatermarkUrl(watermark.imageUrl);
    if (!watermarkUrl) return {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      opacity: 0.18,
      pointerEvents: 'none',
      zIndex: 1,
      backgroundImage: 'url(/watermark-default.png)',
      backgroundRepeat: 'repeat',
      backgroundSize: '180px auto',
      backgroundPosition: 'center',
    };

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
        backgroundImage: `url(${watermarkUrl})`,
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
    ? { position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }
    : { position: 'relative', width: '100%', height: 'auto', overflow: 'hidden' };

  const imageStyle: React.CSSProperties = fill
    ? { width: '100%', height: '100%', objectFit: 'cover', display: 'block', ...style }
    : { width: '100%', height: 'auto', display: 'block', objectFit: 'contain', ...style };

  // If src is a full URL, use it directly. If it's a legacy /uploads/ path or API route, use as-is. Otherwise, use SAS URL for Azure Blob Storage.
  // Always use proxy endpoint for Azure blob paths (e.g., albums/68/filename.jpg)
  // Only allow /api/ and /uploads/ as direct paths, never direct blob URLs
  let resolvedSrc = '';
  if (src.startsWith('/api/') || src.startsWith('/uploads/')) {
    resolvedSrc = src;
  } else if (/^albums\//.test(src)) {
    // If it's a blob path, always use the proxy endpoint
    // Optionally, support thumbnails if needed
    resolvedSrc = `/api/photos/asset?blobName=${encodeURIComponent(src)}`;
  } else {
    // Fallback: never allow direct blob URLs
    resolvedSrc = '';
  }
  // (removed unused watermarkUrl)

  return (
    <div style={containerStyle}>
      {imgError ? (
        <div style={{
          width: '100%', height: '100%', background: '#232336', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#aaa', fontSize: 18, position: 'relative', zIndex: 0
        }}>
          <span>Image not found</span>
        </div>
      ) : (
        <img
          src={resolvedSrc}
          alt={alt}
          className={className}
          style={imageStyle}
          onContextMenu={e => e.preventDefault()}
          draggable={false}
          onError={() => setImgError(true)}
        />
      )}
      {/* Always render overlay for stacking consistency */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 2,
      }}>
        <div style={getWatermarkStyle()} />
      </div>
    </div>
  );
};

export default WatermarkedImage;
