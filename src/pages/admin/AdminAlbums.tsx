import React, { useEffect, useState } from 'react';
import { Album, Photo } from '../../types';
import { albumService } from '../../services/albumService';
import { photoService } from '../../services/photoService';
import { adminMockApi } from '../../services/adminMockApi';

const AdminAlbums: React.FC = () => {
  const [albums, setAlbums] = useState<Album[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingAlbum, setEditingAlbum] = useState<Album | null>(null);
  const [albumPhotos, setAlbumPhotos] = useState<Photo[]>([]);
  const [showPhotoSelector, setShowPhotoSelector] = useState(false);
  const [categories, setCategories] = useState<string[]>([]);
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [newCategory, setNewCategory] = useState('');
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    coverImageUrl: '',
    category: '',
  });

  useEffect(() => {
    loadAlbums();
    loadCategories();
  }, []);

  const loadAlbums = async () => {
    try {
      const data = await albumService.getAlbums();
      setAlbums(data);
    } catch (error) {
      console.error('Failed to load albums:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadCategories = async () => {
    try {
      const data = await adminMockApi.albums.getCategories();
      setCategories(data);
    } catch (error) {
      console.error('Failed to load categories:', error);
    }
  };

  const handleCreate = () => {
    setEditingAlbum(null);
    setFormData({ name: '', description: '', coverImageUrl: '', category: '' });
    setShowNewCategory(false);
    setNewCategory('');
    setShowModal(true);
  };

  const handleEdit = (album: Album) => {
    setEditingAlbum(album);
    setFormData({
      name: album.name,
      description: album.description,
      coverImageUrl: album.coverImageUrl || '',
      category: album.category || '',
    });
    setShowNewCategory(false);
    setNewCategory('');
    setShowModal(true);
    // Load photos for this album
    if (album.id) {
      loadAlbumPhotos(album.id);
    }
  };

  const loadAlbumPhotos = async (albumId: number) => {
    try {
      const photos = await photoService.getPhotosByAlbum(albumId);
      setAlbumPhotos(photos);
    } catch (error) {
      console.error('Failed to load album photos:', error);
      setAlbumPhotos([]);
    }
  };

  const handleSelectPhotoAsCover = (photoUrl: string) => {
    setFormData({ ...formData, coverImageUrl: photoUrl });
    setShowPhotoSelector(false);
  };

  const handleAddCategory = async () => {
    if (newCategory.trim()) {
      try {
        const updatedCategories = await adminMockApi.albums.addCategory(newCategory.trim());
        setCategories(updatedCategories);
        setFormData({ ...formData, category: newCategory.trim() });
        setNewCategory('');
        setShowNewCategory(false);
      } catch (error) {
        console.error('Failed to add category:', error);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingAlbum) {
        await adminMockApi.albums.update(editingAlbum.id, formData);
      } else {
        await adminMockApi.albums.create(formData);
      }
      setShowModal(false);
      loadAlbums();
    } catch (error) {
      console.error('Failed to save album:', error);
    }
  };

  const handleDelete = async (id: number) => {
    if (confirm('Are you sure you want to delete this album?')) {
      try {
        await adminMockApi.albums.delete(id);
        loadAlbums();
      } catch (error) {
        console.error('Failed to delete album:', error);
      }
    }
  };

  if (loading) {
    return <div className="loading">Loading albums...</div>;
  }

  return (
    <div className="admin-page">
      <div className="page-header">
        <h1>Manage Albums</h1>
        <button onClick={handleCreate} className="btn btn-primary">
          + Create Album
        </button>
      </div>

      <div className="admin-table">
        <table>
          <thead>
            <tr>
              <th>Cover</th>
              <th>Name</th>
              <th>Category</th>
              <th>Description</th>
              <th>Photos</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {albums.map((album) => (
              <tr key={album.id}>
                <td>
                  <img src={album.coverImageUrl} alt={album.name} className="table-thumbnail" />
                </td>
                <td>{album.name}</td>
                <td>{album.category || '-'}</td>
                <td>{album.description}</td>
                <td>{album.photoCount}</td>
                <td>{new Date(album.createdDate).toLocaleDateString()}</td>
                <td>
                  <div className="action-buttons">
                    <button onClick={() => handleEdit(album)} className="btn-icon">✏️</button>
                    <button onClick={() => handleDelete(album.id)} className="btn-icon">🗑️</button>
                    <a href={`/admin/photos?album=${album.id}`} className="btn-icon">📷</a>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingAlbum ? 'Edit Album' : 'Create Album'}</h2>
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
                <label>Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={3}
                />
              </div>
              <div className="form-group">
                <label>Category</label>
                <select
                  value={formData.category}
                  onChange={(e) => {
                    if (e.target.value === '__add_new__') {
                      setShowNewCategory(true);
                      setFormData({ ...formData, category: '' });
                    } else {
                      setFormData({ ...formData, category: e.target.value });
                      setShowNewCategory(false);
                    }
                  }}
                >
                  <option value="">No Category</option>
                  {categories.map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                  <option value="__add_new__">+ Add New Category</option>
                </select>
                {showNewCategory && (
                  <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem' }}>
                    <input
                      type="text"
                      placeholder="Enter new category"
                      value={newCategory}
                      onChange={(e) => setNewCategory(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddCategory())}
                      style={{ flex: 1 }}
                    />
                    <button
                      type="button"
                      onClick={handleAddCategory}
                      className="btn btn-primary"
                      style={{ padding: '0.5rem 1rem' }}
                    >
                      Add
                    </button>
                    <button
                      type="button"
                      onClick={() => { setShowNewCategory(false); setNewCategory(''); }}
                      className="btn btn-secondary"
                      style={{ padding: '0.5rem 1rem' }}
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
              <div className="form-group">
                <label>Cover Image URL</label>
                <input
                  type="url"
                  value={formData.coverImageUrl}
                  onChange={(e) => setFormData({ ...formData, coverImageUrl: e.target.value })}
                  placeholder="Leave empty for default placeholder"
                />
                {editingAlbum && albumPhotos.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowPhotoSelector(!showPhotoSelector)}
                    className="btn btn-secondary"
                    style={{ marginTop: '0.5rem', width: '100%' }}
                  >
                    {showPhotoSelector ? 'Hide Photos' : 'Select from Album Photos'}
                  </button>
                )}
                {showPhotoSelector && (
                  <div style={{
                    marginTop: '1rem',
                    padding: '1rem',
                    backgroundColor: '#f5f5f5',
                    borderRadius: '8px',
                    maxHeight: '300px',
                    overflowY: 'auto'
                  }}>
                    <p style={{ marginBottom: '0.5rem', fontWeight: 500 }}>Select a photo as cover:</p>
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))',
                      gap: '0.5rem'
                    }}>
                      {albumPhotos.map((photo) => (
                        <div
                          key={photo.id}
                          onClick={() => handleSelectPhotoAsCover(photo.fullImageUrl)}
                          style={{
                            cursor: 'pointer',
                            border: formData.coverImageUrl === photo.fullImageUrl ? '3px solid #4169E1' : '2px solid #ddd',
                            borderRadius: '4px',
                            overflow: 'hidden',
                            aspectRatio: '1',
                            transition: 'all 0.2s'
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
                          onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                        >
                          <img
                            src={photo.thumbnailUrl}
                            alt={photo.fileName}
                            style={{
                              width: '100%',
                              height: '100%',
                              objectFit: 'cover'
                            }}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <div className="modal-footer">
                <button type="button" onClick={() => setShowModal(false)} className="btn btn-secondary">
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  {editingAlbum ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminAlbums;
