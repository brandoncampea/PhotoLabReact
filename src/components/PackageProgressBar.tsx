import React from 'react';
import { usePackageBuilder } from '../contexts/PackageBuilderContext';
import { PackageSlot } from '../types';
import './PackageProgressBar.css';

interface PackageProgressBarProps {
  onCommit: () => void;
}

const slotLabel = (slot: PackageSlot): string =>
  slot.sizeName ? `${slot.sizeName} ${slot.productName}` : slot.productName;

const PackageProgressBar: React.FC<PackageProgressBarProps> = ({ onCommit }) => {
  const {
    activePackage,
    slots,
    currentSlotIndex,
    isActive,
    isComplete,
    currentSlot,
    cancelPackage,
    goToSlot,
  } = usePackageBuilder();

  if (!isActive || !activePackage) return null;

  const filledCount = slots.filter(s => s.filled).length;

  return (
    <div className={`pkg-bar${isComplete ? ' is-complete' : ''}`} role="status" aria-label="Package builder progress">
      {/* Header row */}
      <div className="pkg-bar-header">
        <span className="pkg-bar-icon">📦</span>
        <span className="pkg-bar-name">{activePackage.name}</span>
        <span className="pkg-bar-price">${Number(activePackage.packagePrice || 0).toFixed(2)}</span>
        {isComplete && (
          <span className="pkg-bar-complete-badge">✓ All photos selected!</span>
        )}
        <div className="pkg-bar-actions">
          {isComplete && (
            <button className="pkg-bar-commit" onClick={onCommit}>
              Add to Cart →
            </button>
          )}
          <button className="pkg-bar-cancel" onClick={cancelPackage} aria-label="Cancel package">
            ✕ Cancel
          </button>
        </div>
      </div>

      {/* Slot chips */}
      <div className="pkg-bar-slots" role="list" aria-label="Package slots">
        {slots.map((slot, i) => {
          const isCurrent = i === currentSlotIndex && !isComplete;
          const isFilled = slot.filled;
          const statusClass = isFilled ? 'slot-filled' : isCurrent ? 'slot-current' : 'slot-pending';
          const label = slotLabel(slot);

          return (
            <button
              key={i}
              role="listitem"
              className={`pkg-bar-slot ${statusClass}`}
              onClick={() => goToSlot(i)}
              title={`${isFilled ? '✓ Filled: ' : isCurrent ? 'Picking: ' : 'Pending: '}${label}`}
              aria-label={label}
              aria-current={isCurrent ? 'step' : undefined}
            >
              {isFilled && slot.photo ? (
                <img
                  src={`/api/photos/${slot.photo.id}/asset?variant=thumbnail`}
                  alt=""
                  className="pkg-bar-slot-thumb"
                />
              ) : (
                <span className="pkg-bar-slot-icon" aria-hidden>
                  {isFilled ? '✓' : isCurrent ? '📷' : '○'}
                </span>
              )}
              <span className="pkg-bar-slot-label">
                {slot.sizeName || slot.productName}
              </span>
            </button>
          );
        })}
      </div>

      {/* Instruction line */}
      {!isComplete && currentSlot && (
        <div className="pkg-bar-instruction">
          Slot {currentSlotIndex + 1} of {slots.length} — pick a photo for{' '}
          <strong>{slotLabel(currentSlot)}</strong>
          {filledCount > 0 && ` (${filledCount} done)`}
        </div>
      )}
    </div>
  );
};

export default PackageProgressBar;
