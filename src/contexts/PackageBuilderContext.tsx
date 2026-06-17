import React, { createContext, useContext, useState, useCallback } from 'react';
import { Package, Product, Photo, CropData, PackageSlot } from '../types';

interface PackageBuilderState {
  activePackage: Package | null;
  slots: PackageSlot[];
  currentSlotIndex: number;
  albumInfo?: { albumId?: number; albumName?: string; albumCoverImageUrl?: string };
}

export interface PackageBuilderContextType {
  activePackage: Package | null;
  slots: PackageSlot[];
  currentSlotIndex: number;
  isActive: boolean;
  isComplete: boolean;
  currentSlot: PackageSlot | null;
  albumInfo?: { albumId?: number; albumName?: string; albumCoverImageUrl?: string };
  startPackage: (
    pkg: Package,
    products: Product[],
    albumInfo?: { albumId?: number; albumName?: string; albumCoverImageUrl?: string }
  ) => void;
  cancelPackage: () => void;
  fillCurrentSlot: (photo: Photo, cropData: CropData) => void;
  goToSlot: (index: number) => void;
}

const PackageBuilderContext = createContext<PackageBuilderContextType | undefined>(undefined);

export const PackageBuilderProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<PackageBuilderState>({
    activePackage: null,
    slots: [],
    currentSlotIndex: 0,
  });

  const startPackage = useCallback((
    pkg: Package,
    products: Product[],
    albumInfo?: { albumId?: number; albumName?: string; albumCoverImageUrl?: string }
  ) => {
    const slots: PackageSlot[] = [];
    let slotIndex = 0;
    for (const item of pkg.items) {
      const product = products.find(p => p.id === item.productId);
      const size = product?.sizes.find(s => s.id === item.productSizeId);
      const productName = product?.name || `Product ${item.productId}`;
      const sizeName = size?.name || '';
      const isDigital = !!(product?.isDigital);
      const variantId = item.variantId ?? null;
      const variant = variantId != null
        ? (size?.whccVariants?.find((v: any) => Number(v.id) === variantId) ?? null)
        : null;
      const variantDisplayName: string | undefined = variant?.displayName || undefined;
      const whccItemAttributeUIDs: number[] | undefined =
        Array.isArray(variant?.whccItemAttributeUIDs) && variant.whccItemAttributeUIDs.length > 0
          ? variant.whccItemAttributeUIDs.map(Number).filter(Number.isFinite)
          : undefined;
      for (let q = 0; q < item.quantity; q++) {
        slots.push({
          slotIndex: slotIndex++,
          productId: item.productId,
          productSizeId: item.productSizeId,
          variantId,
          variantDisplayName,
          whccItemAttributeUIDs,
          productName,
          sizeName,
          width: size?.width,
          height: size?.height,
          isDigital,
          filled: false,
        });
      }
    }
    setState({ activePackage: pkg, slots, currentSlotIndex: 0, albumInfo });
  }, []);

  const cancelPackage = useCallback(() => {
    setState({ activePackage: null, slots: [], currentSlotIndex: 0 });
  }, []);

  const fillCurrentSlot = useCallback((photo: Photo, cropData: CropData) => {
    setState(prev => {
      const newSlots = prev.slots.map((slot, i) =>
        i === prev.currentSlotIndex ? { ...slot, photo, cropData, filled: true } : slot
      );
      // Advance to next unfilled slot after the current one, wrapping to first unfilled
      const nextAfter = newSlots.findIndex((s, i) => i > prev.currentSlotIndex && !s.filled);
      const anyUnfilled = nextAfter !== -1 ? nextAfter : newSlots.findIndex(s => !s.filled);
      const nextIndex = anyUnfilled !== -1 ? anyUnfilled : prev.currentSlotIndex;
      return { ...prev, slots: newSlots, currentSlotIndex: nextIndex };
    });
  }, []);

  const goToSlot = useCallback((index: number) => {
    setState(prev => {
      if (index < 0 || index >= prev.slots.length) return prev;
      return { ...prev, currentSlotIndex: index };
    });
  }, []);

  const isActive = !!state.activePackage;
  const isComplete = isActive && state.slots.length > 0 && state.slots.every(s => s.filled);
  const currentSlot = isActive ? (state.slots[state.currentSlotIndex] || null) : null;

  return (
    <PackageBuilderContext.Provider value={{
      activePackage: state.activePackage,
      slots: state.slots,
      currentSlotIndex: state.currentSlotIndex,
      isActive,
      isComplete,
      currentSlot,
      albumInfo: state.albumInfo,
      startPackage,
      cancelPackage,
      fillCurrentSlot,
      goToSlot,
    }}>
      {children}
    </PackageBuilderContext.Provider>
  );
};

export const usePackageBuilder = () => {
  const ctx = useContext(PackageBuilderContext);
  if (!ctx) throw new Error('usePackageBuilder must be used within PackageBuilderProvider');
  return ctx;
};
