import React, { useEffect, useState } from 'react';
import { Album } from '../../types';
import { albumService } from '../../services/albumService';
import { adminMockApi } from '../../services/adminMockApi';

const AdminAlbums: React.FC = () => {
  const [albums, setAlbums] = useState<Album[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingAlbum, setEditingAlbum] = useState<Album | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    coverImageUrl: '',
  });

  useEffect(() => {
    loadAlbums();
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

  const handleCreate = () => {
    setEditingAlbum(null);
    setFormData({ name: '', description: '', coverImageUrl: '' });
    setShowModal(true);
  };

  const handleEdit = (album: Album) => {
    setEditingAlbum(album);
    setFormData({
      name: album.name,
      description: album.description,
      coverImageUrl: album.coverImageUrl,
    });
    setShowModal(true);
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
                <label>Cover Image URL</label>
                <input
                  type="url"
                  value={formData.coverImageUrl}
                  onChange={(e) => setFormData({ ...formData, coverImageUrl: e.target.value })}
                  required
                />
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
