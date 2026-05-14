import React from 'react';

/**
 * Renders product attributes/finishes (lustre, pearl, etc.) consistently.
 * Accepts a string or array of strings.
 */
export default function ProductAttributes({ attributes }: { attributes?: string | string[] }) {
  if (!attributes) return null;
  if (Array.isArray(attributes)) {
    return (
      <div style={{ marginTop: 4, marginBottom: 4 }}>
        {attributes.map((attr, idx) => (
          <div key={idx} style={{ fontSize: 12, color: '#7b61ff' }}>{attr}</div>
        ))}
      </div>
    );
  }
  return (
    <div style={{ marginTop: 4, marginBottom: 4 }}>
      <div style={{ fontSize: 12, color: '#7b61ff' }}>{attributes}</div>
    </div>
  );
}