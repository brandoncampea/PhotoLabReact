import React from 'react';

/**
 * Renders product attributes/finishes (lustre, pearl, etc.) consistently.
 * Accepts a string or array of strings.
 */
export default function ProductAttributes({ attributes, productOptionsSnapshot }: { attributes?: string[] | number[], productOptionsSnapshot?: string }) {
  if (!attributes || attributes.length === 0) return null;


  // If attributes are numbers, resolve to display names using productOptionsSnapshot
  let resolvedNames: string[] = [];
  let attrUIDs: number[] = [];
  if (typeof attributes[0] === 'number') {
    attrUIDs = attributes as number[];
    let snapshot: any = productOptionsSnapshot;
    if (typeof snapshot === 'string') {
      try { snapshot = JSON.parse(snapshot); } catch { snapshot = {}; }
    }
    // Debug log removed
    // Try to resolve using WHCC variant structure
    if (
      snapshot &&
      Array.isArray(attrUIDs) &&
      Array.isArray(snapshot.whccVariants) &&
      typeof snapshot.whccSelectedVariantId !== 'undefined'
    ) {
      // Debug log removed
      const selectedVariant = snapshot.whccVariants.find(
        (v: any) => v.id === snapshot.whccSelectedVariantId
      );
      // Debug log removed
      if (selectedVariant && Array.isArray(selectedVariant.whccItemAttributeUIDs)) {
        // For WHCC, always show displayName if UID matches selectedVariant's UID(s)
        for (const uid of attrUIDs) {
          if (selectedVariant.whccItemAttributeUIDs.includes(uid) || selectedVariant.id === uid || selectedVariant.whccProductUID === uid) {
            resolvedNames.push(selectedVariant.displayName);
          } else {
            resolvedNames.push(String(uid)); // fallback
          }
        }
      } else {
        resolvedNames = attrUIDs.map(String);
      }
    } else {
      // Debug log removed
      resolvedNames = attrUIDs.map(String);
    }
  } else {
    resolvedNames = attributes as string[];
  }

  return (
    <div style={{ marginTop: 4, marginBottom: 4 }}>
      {resolvedNames.map((attr, idx) => (
        <div key={idx} style={{ fontSize: 12, color: '#7b61ff' }}>{attr}</div>
      ))}
    </div>
  );
}