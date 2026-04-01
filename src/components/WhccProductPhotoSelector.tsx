import React, { useEffect, useState } from 'react';
import { Photo } from '../types';
import { whccService } from '../services/whccService';

interface WhccProductPhotoSelectorProps {
  whccProductId: string;
  availablePhotos: Photo[];
  onChange: (selected: { [nodeId: string]: Photo | null }) => void;
  initialSelection?: { [nodeId: string]: Photo | null };
}

/**
 * Component to select one photo per node for a WHCC product.
 * Fetches product nodes and displays a photo picker for each node.
 */
const WhccProductPhotoSelector: React.FC<WhccProductPhotoSelectorProps> = ({
  whccProductId,
  availablePhotos,
  onChange,
  initialSelection = {},
}) => {
  const [nodes, setNodes] = useState<{ nodeId: number; name: string }[]>([]);
  const [selected, setSelected] = useState<{ [nodeId: string]: Photo | null }>(initialSelection);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function fetchNodes() {
      setLoading(true);
      setError('');
      try {
        const catalog = await whccService.getProductCatalog();
        const product = (catalog.products || catalog) // support both array and object
          .find((p: any) => p._id === whccProductId || p.productUID === whccProductId || p.productUID === Number(whccProductId));
        if (product && Array.isArray(product.nodes)) {
          setNodes(product.nodes.map((n: any) => ({ nodeId: n.nodeId, name: n.name })));
        } else {
          setNodes([]);
          setError('Product nodes not found.');
        }
      } catch (e) {
        setError('Failed to load product nodes.');
      } finally {
        setLoading(false);
      }
    }
    fetchNodes();
  }, [whccProductId]);

  useEffect(() => {
    onChange(selected);
  }, [selected, onChange]);

  const handlePhotoSelect = (nodeId: number, photo: Photo | null) => {
    setSelected((prev) => ({ ...prev, [nodeId]: photo }));
  };

  if (loading) return <div>Loading product details...</div>;
  if (error) return <div className="error-message">{error}</div>;
  if (!nodes.length) return <div>No nodes found for this product.</div>;

  return (
    <div className="whcc-photo-selector">
      <h4>Select a photo for each product area:</h4>
      {nodes.map((node) => (
        <div key={node.nodeId} className="whcc-node-photo-row">
          <label>
            <strong>{node.name || `Node ${node.nodeId}`}</strong>
            <select
              value={selected[node.nodeId]?.id || ''}
              onChange={(e) => {
                const photo = availablePhotos.find((p) => String(p.id) === e.target.value) || null;
                handlePhotoSelect(node.nodeId, photo);
              }}
            >
              <option value="">Select photo...</option>
              {availablePhotos.map((photo) => (
                <option key={photo.id} value={photo.id}>
                  {photo.fileName || `Photo ${photo.id}`}
                </option>
              ))}
            </select>
            {selected[node.nodeId] && (
              <img
                src={selected[node.nodeId]?.thumbnailUrl}
                alt={selected[node.nodeId]?.fileName}
                style={{ width: 60, height: 60, objectFit: 'cover', marginLeft: 8, borderRadius: 4, border: '1px solid #ccc' }}
              />
            )}
          </label>
        </div>
      ))}
    </div>
  );
};

export default WhccProductPhotoSelector;
