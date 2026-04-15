import React, { useEffect, useMemo, useState } from 'react';
import WatermarkedImage from './WatermarkedImage';

interface AlbumCoverCarouselProps {
  albumId: number;
  albumName: string;
  coverImageUrl?: string;
  previewImageUrls?: string[];
  studioId?: number;
}

const AlbumCoverCarousel: React.FC<AlbumCoverCarouselProps> = ({
  albumId,
  albumName,
  coverImageUrl,
  previewImageUrls = [],
  studioId,
}) => {
  const images = useMemo(() => {
    // Always show coverImageUrl first if present, then unique previewImageUrls (excluding duplicates)
    const cover = coverImageUrl ? [coverImageUrl] : [];
    const previews = (previewImageUrls || []).filter(Boolean).filter(url => url !== coverImageUrl);
    const deduped = Array.from(new Set([...cover, ...previews]));
    if (deduped.length > 0) {
      return deduped;
    }
    return [`https://picsum.photos/seed/album${albumId}/400/300`];
  }, [albumId, coverImageUrl, previewImageUrls]);

  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    setActiveIndex(0);
  }, [images]);

  useEffect(() => {
    if (images.length <= 1) {
      return;
    }

    const interval = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % images.length);
    }, 2500);

    return () => window.clearInterval(interval);
  }, [images]);

  return (
    <div
      className="album-cover-carousel"
      style={{ position: 'relative', width: '100%', height: '100%', minHeight: 0 }}
    >
      {images.map((image, index) => (
        <div
          key={`${image}-${index}`}
          className={`album-cover-slide${index === activeIndex ? ' active' : ''}`}
          aria-hidden={index !== activeIndex}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%' }}
        >
          <WatermarkedImage
            src={image}
            alt={albumName}
            fill
            studioId={studioId}
          />
        </div>
      ))}
      {images.length > 1 && (
        <div className="album-cover-dots">
          {images.map((_, index) => (
            <span
              key={index}
              className={`album-cover-dot${index === activeIndex ? ' active' : ''}`}
              onClick={e => {
                e.stopPropagation();
                setActiveIndex(index);
              }}
              tabIndex={0}
              aria-label={`Go to slide ${index + 1}`}
              role="button"
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default AlbumCoverCarousel;
