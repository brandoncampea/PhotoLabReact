import React, { useEffect, useState } from 'react';
import { Watermark } from '../../types';
import { adminMockApi } from '../../services/adminMockApi';

const AdminWatermarks: React.FC = () => {
  const [watermarks, setWatermarks] = useState<Watermark[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingWatermark, setEditingWatermark] = useState<Watermark | null>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [formData, setFormData] = useState({
    name: '',
    imageUrl: '',
    position: 'bottom-right' as Watermark['position'],
    opacity: 0.5,
    isDefault: false,
    tiled: false,
  });

  useEffect(() => {
    loadWatermarks();
  }, []);

  const loadWatermarks = async () => {
    try {
      const data = await adminMockApi.watermarks.getAll();
      setWatermarks(data);
    } catch (error) {
      console.error('Failed to load watermarks:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = () => {
    setEditingWatermark(null);
    setUploadedFile(null);
    setPreviewUrl('');
    setFormData({
      name: '',
      imageUrl: '',
      position: 'bottom-right',
      opacity: 0.5,
      isDefault: false,
      tiled: false,
    });
    setShowModal(true);
  };

  const handleEdit = (watermark: Watermark) => {
    setEditingWatermark(watermark);
    setUploadedFile(null);
    setPreviewUrl(watermark.imageUrl);
    setFormData({
      name: watermark.name,
      imageUrl: watermark.imageUrl,
      position: watermark.position,
      opacity: watermark.opacity,
      isDefault: watermark.isDefault,
      tiled: watermark.tiled,
    });
    setShowModal(true);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        alert('Please select an image file');
        return;
      }
      
      setUploadedFile(file);
      
      // Create preview URL and convert to base64
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        setPreviewUrl(base64String);
        setFormData({ ...formData, imageUrl: base64String });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingWatermark) {
        await adminMockApi.watermarks.update(editingWatermark.id, formData);
      } else {
        await adminMockApi.watermarks.create(formData);
      }
      setShowModal(false);
      loadWatermarks();
    } catch (error) {
      console.error('Failed to save watermark:', error);
    }
  };

  const handleDelete = async (id: number) => {
    if (confirm('Are you sure you want to delete this watermark?')) {
      try {
        await adminMockApi.watermarks.delete(id);
        loadWatermarks();
      } catch (error) {
        console.error('Failed to delete watermark:', error);
      }
    }
  };

  if (loading) {
    return <div className="loading">Loading watermarks...</div>;
  }

  return (
    <div className="admin-page">
      <div className="page-header">
        <h1>Manage Watermarks</h1>
        <button onClick={handleCreate} className="btn btn-primary">
          + Create Watermark
        </button>
      </div>

      <div className="watermarks-grid">
        {watermarks.map((watermark) => (
          <div key={watermark.id} className="watermark-card">
            <img src={watermark.imageUrl} alt={watermark.name} />
            <div className="watermark-info">
              <h3>{watermark.name}</h3>
              <p>Position: {watermark.tiled ? 'Tiled' : watermark.position}</p>
              <p>Opacity: {(watermark.opacity * 100).toFixed(0)}%</p>
              {watermark.isDefault && <span className="badge">Default</span>}
              {watermark.tiled && <span className="badge" style={{ backgroundColor: '#10b981', marginLeft: '0.5rem' }}>Tiled</span>}
            </div>
            <div className="action-buttons">
              <button onClick={() => handleEdit(watermark)} className="btn-icon">✏️</button>
              <button onClick={() => handleDelete(watermark.id)} className="btn-icon">🗑️</button>
            </div>
          </div>
        ))}
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingWatermark ? 'Edit Watermark' : 'Create Watermark'}</h2>
              <button onClick={() => setShowModal(false)} className="btn-close">×</button>
            </div>
            <form onSubmit={handleSubmit} className="modal-body">
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
                <label>Upload Watermark Image</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileUpload}
                  style={{ marginBottom: '0.5rem' }}
                />
                <p style={{ fontSize: '0.85rem', color: '#666', margin: '0.5rem 0' }}>Or enter an image URL:</p>
                <input
                  type="url"
                  placeholder="https://example.com/watermark.png"
                  value={formData.imageUrl}
                  onChange={(e) => {
                    setFormData({ ...formData, imageUrl: e.target.value });
                    setPreviewUrl(e.target.value);
                  }}
                />
                {previewUrl && (
                  <div style={{ marginTop: '0.75rem', padding: '1rem', background: '#f5f5f5', borderRadius: '4px', textAlign: 'center' }}>
                    <p style={{ fontSize: '0.85rem', marginBottom: '0.5rem', fontWeight: 500 }}>Preview:</p>
                    <img 
                      src={previewUrl} 
                      alt="Watermark preview" 
                      style={{ maxWidth: '200px', maxHeight: '100px', objectFit: 'contain' }}
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                        const errorMsg = document.createElement('p');
                        errorMsg.textContent = 'Failed to load preview';
                        errorMsg.style.color = '#d32f2f';
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
                  <p style={{ fontSize: '0.85rem', color: '#666', marginTop: '0.25rem' }}>
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
                  <p style={{ fontSize: '0.85rem', color: '#666', marginTop: '0.25rem' }}>
                    🔲 Watermark will repeat across the entire image in a grid pattern
                  </p>
                )}
              </div>
              <div className="modal-footer">
                <button type="button" onClick={() => setShowModal(false)} className="btn btn-secondary">
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  {editingWatermark ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminWatermarks;
