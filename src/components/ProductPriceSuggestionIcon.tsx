import React, { useState } from 'react';


// Compact icon + tooltip for price suggestions
const ProductPriceSuggestionIcon: React.FC<{ productName: string; sizeLabel: string }> = ({ productName, sizeLabel }) => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<Array<{ source: string; price: string; url: string }>>([]);
  const [error, setError] = useState<string | null>(null);

  const handleOpen = async () => {
    setOpen(true);
    if (suggestions.length === 0 && !loading) {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/price-suggestions?productName=${encodeURIComponent(productName)}&sizeLabel=${encodeURIComponent(sizeLabel)}`);
        if (!res.ok) throw new Error('Failed to fetch');
        const data = await res.json();
        setSuggestions(data.suggestions || []);
      } catch (e) {
        setError('Failed to fetch suggestions');
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <span style={{ marginLeft: 6 }}>
      <span
        style={{ cursor: 'pointer', color: '#1976d2' }}
        onMouseEnter={handleOpen}
        onMouseLeave={() => setOpen(false)}
        tabIndex={0}
        aria-label="Show price suggestions"
      >
        ℹ️
      </span>
      {open && (
        <div style={{
          position: 'absolute',
          background: '#fff',
          border: '1px solid #ccc',
          borderRadius: 4,
          padding: 10,
          zIndex: 1000,
          minWidth: 220,
          boxShadow: '0 2px 8px rgba(0,0,0,0.15)'
        }}>
          {loading && <div>Loading suggestions...</div>}
          {error && <div style={{ color: 'red' }}>{error}</div>}
          {!loading && !error && suggestions.length === 0 && <div>No suggestions found.</div>}
          {!loading && suggestions.length > 0 && (
            <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
              {suggestions.map((s, i) => (
                <li key={i} style={{ marginBottom: 6 }}>
                  <a href={s.url} target="_blank" rel="noopener noreferrer" style={{ color: '#1976d2', textDecoration: 'underline' }}>
                    {s.source}
                  </a>: <b>{s.price}</b>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </span>
  );
};

export default ProductPriceSuggestionIcon;
