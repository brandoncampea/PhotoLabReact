import React, { useEffect, useState } from 'react';
import { useSasUrl } from '../../hooks/useSasUrl';
import { Watermark } from '../../types';
import { watermarkService } from '../../services/watermarkService';
import './AdminWatermarks.css';
import AdminLayout from '../../components/AdminLayout';

// Helper component for SAS-protected watermark images
function WatermarkSasImage({ src, alt }: { src: string, alt: string }) {
  // Extract blob name from Azure or local URL
  let blobName = '';
  if (src?.startsWith('http') && src.includes('/watermarks/')) {
    blobName = src.split('/watermarks/')[1]?.split('?')[0] || '';
    blobName = `watermarks/${blobName}`;
  } else if (src?.startsWith('/uploads/')) {
    blobName = src.replace(/^\//, '');
  }
  const sasUrl = useSasUrl(blobName || src);
  return (
    <img
      src={sasUrl || ''}
      alt={alt}
      className="watermark-image"
      style={{ width: '72px', height: '72px', objectFit: 'contain', borderRadius: '8px', background: '#181825', border: '1px solid #393552', marginBottom: '0.75rem' }}
    />
  );
}

type WatermarkFormData = {
  name: string;
  image: File | null;
  position: Watermark['position'];
  opacity: number;
  isDefault: boolean;
  tiled: boolean;
};

const AdminWatermarks: React.FC = () => {
  const [watermarks, setWatermarks] = useState<Watermark[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingWatermark, setEditingWatermark] = useState<Watermark | null>(null);
  const [formData, setFormData] = useState<WatermarkFormData>({
    name: '',
    image: null,
    position: 'bottom-right',
    opacity: 1,
    isDefault: false,
    tiled: false,
  });
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const loadWatermarks = async () => {
    setLoading(true);
    try {
      const data = await watermarkService.getAll();
      setWatermarks(data || []);
    } catch (e) {
      setError('Failed to load watermarks.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadWatermarks();
  }, []);

  const resetModalState = () => {
    setEditingWatermark(null);
    setFormData({ name: '', image: null, position: 'bottom-right', opacity: 1, isDefault: false, tiled: false });
    setPreviewUrl(null);
  };

  const handleCreate = () => {
    resetModalState();
    setShowModal(true);
  };

  const handleEdit = (watermark: Watermark) => {
    setEditingWatermark(watermark);
    setFormData({
      name: watermark.name,
      image: null,
      position: watermark.position,
      opacity: watermark.opacity,
      isDefault: watermark.isDefault,
      tiled: watermark.tiled,
    });
    setPreviewUrl(watermark.imageUrl);
    setShowModal(true);
  };

  const handleDelete = async (id: number) => {
    try {
      setError('');
      setMessage('');
      await watermarkService.delete(id);
      setWatermarks(watermarks.filter(w => w.id !== id));
      setMessage('Watermark deleted.');
    } catch (error) {
      console.error('Failed to delete watermark:', error);
      setError('Failed to delete watermark. Please try again.');
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setFormData((prev) => ({ ...prev, image: file }));

    if (previewUrl && previewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(previewUrl);
    }

    if (file) {
      setPreviewUrl(URL.createObjectURL(file));
    } else if (editingWatermark?.imageUrl) {
      setPreviewUrl(editingWatermark.imageUrl);
    } else {
      setPreviewUrl(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    setSaving(true);
    setError('');
    setMessage('');

    try {
      const payload = {
        name: formData.name,
        imageUrl: editingWatermark?.imageUrl || '',
        position: formData.position,
        opacity: formData.opacity,
        isDefault: formData.isDefault,
        tiled: formData.tiled,
      };

      if (editingWatermark) {
        const updated = await watermarkService.update(editingWatermark.id, payload, formData.image || undefined);
        setWatermarks((prev) => prev.map((w) => (w.id === updated.id ? updated : w)));
        setMessage('Watermark updated.');
      } else {
        if (!formData.image) {
          setError('Please select an image file.');
          return;
        }
        const created = await watermarkService.create(payload as any, formData.image);
        setWatermarks((prev) => [created, ...prev]);
        setMessage('Watermark created.');
      }

      setShowModal(false);
      resetModalState();
    } catch (err) {
      console.error('Failed to save watermark:', err);
      setError('Failed to save watermark. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <AdminLayout>
        <div className="loading">Loading watermarks...</div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <>
      {message && <div className="success-message">{message}</div>}
      {error && <div className="error-message">{error}</div>}
      <div className="page-header">
        <h1>Manage Watermarks</h1>
        <button onClick={handleCreate} className="btn btn-primary">
          + Add Watermark
        </button>
      </div>

      <div className="watermarks-grid">
        {watermarks.map((watermark) => (
          <div key={watermark.id} className="watermark-card">
            <WatermarkSasImage src={watermark.imageUrl} alt={watermark.name} />

            <div className="watermark-info">
              <h3>{watermark.name}</h3>
              <p>Position: {watermark.tiled ? 'Tiled' : watermark.position}</p>
              <p>Opacity: {(watermark.opacity * 100).toFixed(0)}%</p>
              {watermark.isDefault && <span className="badge">Default</span>}
              {watermark.tiled && <span className="badge badge-success" style={{ marginLeft: '0.5rem' }}>Tiled</span>}
            </div>
            <div className="watermark-actions">
              <button onClick={() => handleEdit(watermark)} className="btn btn-secondary btn-sm">Edit</button>
              <button onClick={() => handleDelete(watermark.id)} className="btn btn-danger btn-sm">Delete</button>
            </div>
          </div>
        ))}
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content admin-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header admin-modal-header">
              <h2>{editingWatermark ? 'Edit Watermark' : 'Create Watermark'}</h2>
              <button onClick={() => setShowModal(false)} className="btn-close">×</button>
            </div>
            <form onSubmit={handleSubmit} className="modal-body admin-modal-body">
              <div className="form-group">
                <label>Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label>Watermark Image {!editingWatermark && <span className="danger-text">*</span>}</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileUpload}
                  required={!editingWatermark}
                  style={{ marginBottom: '0.5rem' }}
                />
                {editingWatermark && (
                  <p className="muted-text" style={{ fontSize: '0.85rem', margin: '0.5rem 0' }}>
                    Leave empty to keep current image
                  </p>
                )}
                {previewUrl && (
                  <div className="preview-box">
                    <p style={{ fontSize: '0.85rem', marginBottom: '0.5rem', fontWeight: 500 }}>Preview:</p>
                    <img 
                      src={previewUrl} 
                      alt="Watermark preview" 
                      style={{ maxWidth: '200px', maxHeight: '100px', objectFit: 'contain' }}
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                        const errorMsg = document.createElement('p');
                        errorMsg.textContent = 'Failed to load preview';
                        errorMsg.style.color = 'var(--error-color)';
                        errorMsg.style.fontSize = '0.85rem';
                        (e.target as HTMLImageElement).parentElement?.appendChild(errorMsg);
                      }}
                    />
                  </div>
                )}
              </div>
              <div className="form-group">
                <label>Position</label>
                <select
                  value={formData.position}
                  onChange={(e) => setFormData({ ...formData, position: e.target.value as Watermark['position'] })}
                  disabled={formData.tiled}
                >
                  <option value="center">Center</option>
                  <option value="top-left">Top Left</option>
                  <option value="top-right">Top Right</option>
                  <option value="bottom-left">Bottom Left</option>
                  <option value="bottom-right">Bottom Right</option>
                </select>
                {formData.tiled && (
                  <p className="muted-text" style={{ fontSize: '0.85rem', marginTop: '0.25rem' }}>
                    Position is ignored when tiling is enabled
                  </p>
                )}
              </div>
              <div className="form-group">
                <label>Opacity: {(formData.opacity * 100).toFixed(0)}%</label>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={formData.opacity}
                  onChange={(e) => setFormData({ ...formData, opacity: parseFloat(e.target.value) })}
                />
              </div>
              <div className="form-group">
                <label>
                  <input
                    type="checkbox"
                    checked={formData.isDefault}
                    onChange={(e) => setFormData({ ...formData, isDefault: e.target.checked })}
                  />
                  {' '}Set as default
                </label>
              </div>
              <div className="form-group">
                <label>
                  <input
                    type="checkbox"
                    checked={formData.tiled}
                    onChange={(e) => setFormData({ ...formData, tiled: e.target.checked })}
                  />
                  {' '}Tile watermark across image
                </label>
                {formData.tiled && (
                  <p className="muted-text" style={{ fontSize: '0.85rem', marginTop: '0.25rem' }}>
                    🔲 Watermark will repeat across the entire image in a grid pattern
                  </p>
                )}
              </div>
              <div className="modal-footer">
                <button type="button" onClick={() => setShowModal(false)} className="btn btn-secondary">
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Saving...' : editingWatermark ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      </>
    </AdminLayout>
  );
};

export default AdminWatermarks;
