import React, { useEffect, useMemo, useState } from 'react';
import WatermarkedImage from './WatermarkedImage';

interface AlbumCoverCarouselProps {
  albumId: number;
  albumName: string;
  coverImageUrl?: string;
  previewImageUrls?: string[];
}

const AlbumCoverCarousel: React.FC<AlbumCoverCarouselProps> = ({
  albumId,
  albumName,
  coverImageUrl,
  previewImageUrls = [],
}) => {
  const images = useMemo(() => {
    const items = previewImageUrls.length > 0 ? previewImageUrls : coverImageUrl ? [coverImageUrl] : [];
    const deduped = Array.from(new Set(items.filter(Boolean)));
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
    <div className="album-cover-carousel">
      {images.map((image, index) => (
        <div
          key={`${image}-${index}`}
          className={`album-cover-slide ${index === activeIndex ? 'active' : ''}`}
          aria-hidden={index !== activeIndex}
        >
          <WatermarkedImage
            src={image}
            alt={albumName}
            fill
          />
        </div>
      ))}
      {images.length > 1 && (
        <div className="album-cover-dots">
          {images.map((_, index) => (
            <span
              key={index}
              className={`album-cover-dot ${index === activeIndex ? 'active' : ''}`}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default AlbumCoverCarousel;
