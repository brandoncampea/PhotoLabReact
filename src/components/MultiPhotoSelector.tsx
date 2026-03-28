import React, { useState, useRef } from 'react';
// import { useSasUrl } from '../hooks/useSasUrl';
// SlotImage import removed; component not found.
import { Photo, Product, ProductSize, CropData } from '../types';
import Cropper, { ReactCropperElement } from 'react-cropper';

interface PhotoSlot {
  position: number;
  photo: Photo | null;
  cropData: CropData | null;
}

interface MultiPhotoSelectorProps {
  product: Product;
  selectedSize: ProductSize;
  availablePhotos: Photo[];
  initialPhoto?: Photo;
  onComplete: (photos: { photo: Photo; cropData: CropData; position: number }[]) => void;
  onCancel: () => void;
}

const MultiPhotoSelector: React.FC<MultiPhotoSelectorProps> = ({
  product,
  selectedSize,
  availablePhotos,
  initialPhoto,
  onComplete,
  onCancel,
}) => {
  const minPhotos = product.minPhotos || 2;
  const maxPhotos = product.maxPhotos || minPhotos;
  
  // Initialize slots
  const [slots, setSlots] = useState<PhotoSlot[]>(() => {
    const initialSlots = Array.from({ length: maxPhotos }, (_, i) => ({
      position: i + 1,
      photo: i === 0 && initialPhoto ? initialPhoto : null,
      cropData: null,
    }));
    return initialSlots;
  });

  const [activeSlotIndex, setActiveSlotIndex] = useState<number | null>(
    initialPhoto ? 0 : null
  );
  const cropperRef = useRef<ReactCropperElement>(null);

  const handlePhotoSelect = (photo: Photo, slotIndex: number) => {
    const newSlots = [...slots];
    newSlots[slotIndex] = {
      ...newSlots[slotIndex],
      photo,
      cropData: null, // Reset crop when changing photo
    };
    setSlots(newSlots);
    setActiveSlotIndex(slotIndex);
  };

  const handleSaveCrop = () => {
    if (activeSlotIndex === null || !cropperRef.current?.cropper) return;

    const cropper = cropperRef.current.cropper;
    const rawCropData = cropper.getData();
    const imageData = cropper.getImageData();
    
    // Normalize to percentages
    const toPercent = (value: number, dimension: number) => (value / dimension) * 100;

    const newSlots = [...slots];
    newSlots[activeSlotIndex] = {
      ...newSlots[activeSlotIndex],
      cropData: {
        x: toPercent(rawCropData.x, imageData.naturalWidth),
        y: toPercent(rawCropData.y, imageData.naturalHeight),
        width: toPercent(rawCropData.width, imageData.naturalWidth),
        height: toPercent(rawCropData.height, imageData.naturalHeight),
        rotate: rawCropData.rotate || 0,
        scaleX: rawCropData.scaleX || 1,
        scaleY: rawCropData.scaleY || 1,
      },
    };
    setSlots(newSlots);
    setActiveSlotIndex(null);
  };

  const handleComplete = () => {
    const filledSlots = slots.filter(slot => slot.photo && slot.cropData);
    
    if (filledSlots.length < minPhotos) {
      alert(`Please select and crop at least ${minPhotos} photos`);
      return;
    }

    const result = filledSlots.map(slot => ({
      photo: slot.photo!,
      cropData: slot.cropData!,
      position: slot.position,
    }));

    onComplete(result);
  };

  const filledCount = slots.filter(slot => slot.photo && slot.cropData).length;
  const canComplete = filledCount >= minPhotos;

  // Get current slot being edited
  const activeSlot = activeSlotIndex !== null ? slots[activeSlotIndex] : null;

  return (
    <div className="multi-photo-selector-container">
      {/* Header */}
      <div className="multi-photo-selector-header">
        <h3 className="multi-photo-selector-title">
          {product.name} - {selectedSize.name}
        </h3>
        <div className="multi-photo-selector-header-row">
          <div className="multi-photo-selector-header-desc">
            📸 {filledCount} of {minPhotos === maxPhotos ? minPhotos : `${minPhotos}-${maxPhotos}`} photos selected
          </div>
          <div className="multi-photo-selector-header-price">
            ${selectedSize.price.toFixed(2)}
          </div>
        </div>
      </div>

      {/* Cropper Area or Slot Preview */}
      <div className="multi-photo-selector-crop-area">
        {activeSlot && activeSlot.photo ? (
          <>
            <Cropper
              ref={cropperRef}
              src={activeSlot.photo.fullImageUrl}
              className="multi-photo-selector-cropper"
              aspectRatio={selectedSize.width / selectedSize.height}
              guides={true}
              viewMode={1}
              minCropBoxHeight={10}
              minCropBoxWidth={10}
              background={false}
              responsive={true}
              autoCropArea={1}
              checkOrientation={false}
            />
            <div className="multi-photo-selector-crop-label">
              Cropping Photo #{activeSlot.position}
            </div>
            <div className="multi-photo-selector-crop-actions">
              <button
                onClick={() => setActiveSlotIndex(null)}
                className="btn btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveCrop}
                className="btn btn-primary"
              >
                ✓ Save Crop
              </button>
            </div>
          </>
        ) : (
          <div className="multi-photo-selector-crop-empty">
            Select a photo slot below to begin
          </div>
        )}
      </div>

      {/* Photo Slots */}
      <div className="multi-photo-selector-slots-section">
        <h4 className="multi-photo-selector-slots-title">Photo Slots</h4>
        <div className="multi-photo-selector-slots-grid">
          {slots.map((slot, index) => (
            <div
              key={slot.position}
              style={{
                border: activeSlotIndex === index ? '3px solid #2196f3' : '2px solid #ddd',
                borderRadius: '8px',
                overflow: 'hidden',
                cursor: 'pointer',
                position: 'relative',
                aspectRatio: `${selectedSize.width} / ${selectedSize.height}`,
                backgroundColor: '#f5f5f5',
              }}
              onClick={() => slot.photo && setActiveSlotIndex(index)}
            >
              {slot.photo ? (
                <>
                  {/* <SlotImage blobName={slot.photo.thumbnailUrl} alt={`Slot ${slot.position}`} /> */}
                  {slot.cropData && (
                    <div style={{
                      position: 'absolute',
                      top: '4px',
                      right: '4px',
                      backgroundColor: '#4caf50',
                      color: 'white',
                      borderRadius: '50%',
                      width: '24px',
                      height: '24px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '14px',
                    }}>
                      ✓
                    </div>
                  )}
                  <div style={{
                    position: 'absolute',
                    bottom: '0',
                    left: '0',
                    right: '0',
                    backgroundColor: 'rgba(0,0,0,0.7)',
                    color: 'white',
                    padding: '4px',
                    fontSize: '12px',
                    textAlign: 'center',
                  }}>
                    #{slot.position}
                  </div>
                </>
              ) : (
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: '100%',
                  color: '#999',
                }}>
                  <div style={{ fontSize: '2rem' }}>+</div>
                  <div style={{ fontSize: '12px' }}>#{slot.position}</div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Available Photos Grid */}
      {activeSlotIndex === null && (
        <div style={{ padding: '1rem', borderTop: '1px solid #ddd', maxHeight: '200px', overflowY: 'auto' }}>
          <h4 style={{ margin: '0 0 1rem 0' }}>Select Photos from Album</h4>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))',
            gap: '0.5rem',
          }}>
            {availablePhotos.map(photo => {
              const isSelected = slots.some(slot => slot.photo?.id === photo.id);
              return (
                <div
                  key={photo.id}
                  style={{
                    position: 'relative',
                    cursor: 'pointer',
                    border: isSelected ? '2px solid #2196f3' : '1px solid #ddd',
                    borderRadius: '4px',
                    overflow: 'hidden',
                    aspectRatio: '1',
                  }}
                  onClick={() => {
                    // Find first empty slot or replace last slot
                    const emptySlotIndex = slots.findIndex(s => !s.photo);
                    const targetIndex = emptySlotIndex !== -1 ? emptySlotIndex : slots.length - 1;
                    handlePhotoSelect(photo, targetIndex);
                  }}
                >
                  {/* <SlotImage blobName={photo.thumbnailUrl} alt={photo.fileName} /> */}
                  {isSelected && (
                    <div style={{
                      position: 'absolute',
                      top: '2px',
                      right: '2px',
                      backgroundColor: '#2196f3',
                      color: 'white',
                      borderRadius: '50%',
                      width: '20px',
                      height: '20px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '12px',
                    }}>
                      ✓
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div style={{
        padding: '1rem',
        borderTop: '1px solid #ddd',
        display: 'flex',
        justifyContent: 'space-between',
        gap: '1rem',
      }}>
        <button
          onClick={onCancel}
          className="btn btn-secondary"
          style={{ flex: 1 }}
        >
          Cancel
        </button>
        <button
          onClick={handleComplete}
          className="btn btn-primary"
          style={{ flex: 1 }}
          disabled={!canComplete}
        >
          {canComplete ? '✓ Add to Cart' : `Select ${minPhotos - filledCount} more photo(s)`}
        </button>
      </div>
    </div>
  );
};

export default MultiPhotoSelector;
