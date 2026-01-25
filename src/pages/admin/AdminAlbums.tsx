import React, { useEffect, useState } from 'react';
import { Album, PriceList } from '../../types';
import { albumService } from '../../services/albumService';
import { categoryService } from '../../services/categoryService';
import { albumAdminService } from '../../services/albumAdminService';

const AdminAlbums: React.FC = () => {
  const [albums, setAlbums] = useState<Album[]>([]);
  const [priceLists, setPriceLists] = useState<PriceList[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingAlbum, setEditingAlbum] = useState<Album | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [newCategory, setNewCategory] = useState('');
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    category: '',
    priceListId: undefined as number | undefined,
    isPasswordProtected: false,
    password: '',
    passwordHint: '',
  });

  useEffect(() => {
    loadAlbums();
    loadCategories();
    loadPriceLists();
  }, []);

  useEffect(() => {
    console.log('AdminAlbums: albums state changed to', albums.length, 'albums');
  }, [albums]);

  const loadAlbums = async () => {
    try {
      const data = await albumService.getAlbums();
      console.log('AdminAlbums: Loaded', data.length, 'albums:', data);
      setAlbums(data);
      console.log('AdminAlbums: State set to', data.length, 'albums');
    } catch (error) {
      console.error('Failed to load albums:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadCategories = async () => {
    try {
      const data = await categoryService.getCategories();
      setCategories(data);
    } catch (error) {
      console.error('Failed to load categories:', error);
    }
  };

  const loadPriceLists = async () => {
    try {
      const data = await albumAdminService.getPriceLists();
      setPriceLists(data);
    } catch (error) {
      console.error('Failed to load price lists:', error);
    }
  };

  const handleCreate = () => {
    setEditingAlbum(null);
    setFormData({ name: '', description: '', category: '', priceListId: undefined, isPasswordProtected: false, password: '', passwordHint: '' });
    setShowNewCategory(false);
    setNewCategory('');
    setShowModal(true);
  };

  const handleEdit = (album: Album) => {
    setEditingAlbum(album);
    setFormData({
      name: album.name,
      description: album.description || '',
      category: album.category || '',
      priceListId: album.priceListId,
      isPasswordProtected: !!album.isPasswordProtected,
      password: album.isPasswordProtected ? album.password || '' : '',
      passwordHint: album.isPasswordProtected ? album.passwordHint || '' : '',
    });
    setShowNewCategory(false);
    setNewCategory('');
    setShowModal(true);
  };

  const handleAddCategory = async () => {
    if (newCategory.trim()) {
      try {
        const updatedCategories = await categoryService.addCategory(newCategory.trim());
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
      const payload = {
        ...formData,
        password: formData.isPasswordProtected ? formData.password : '',
        passwordHint: formData.isPasswordProtected ? formData.passwordHint : '',
      };
      if (editingAlbum) {
        await albumAdminService.updateAlbum(editingAlbum.id, payload);
      } else {
        await albumAdminService.createAlbum(payload);
      }
      await loadAlbums();
      setShowModal(false);
    } catch (error) {
      console.error('Failed to save album:', error);
    }
  };

  const handleDelete = async (id: number) => {
    if (confirm('Are you sure you want to delete this album?')) {
      try {
        await albumAdminService.deleteAlbum(id);
        // Immediately remove from UI
        setAlbums(albums.filter(a => a.id !== id));
        // Then reload to ensure sync with backend
        await loadAlbums();
      } catch (error) {
        console.error('Failed to delete album:', error);
      }
    }
  };

  const handleDeleteCategory = async (category: string) => {
    if (confirm(`Delete category "${category}"? Albums with this category will have it removed.`)) {
      try {
        await categoryService.deleteCategory(category);
        loadCategories();
      } catch (error) {
        console.error('Failed to delete category:', error);
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

      {categories.length > 0 && (
        <div style={{ marginBottom: '2rem', padding: '1rem', backgroundColor: '#f9f9f9', borderRadius: '8px' }}>
          <h3 style={{ marginTop: 0, marginBottom: '0.75rem' }}>Categories ({categories.length})</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            {categories.map((category) => (
              <div
                key={category}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  backgroundColor: '#e8f4f8',
                  border: '1px solid #0066cc',
                  borderRadius: '20px',
                  padding: '0.5rem 0.75rem',
                  gap: '0.5rem'
                }}
              >
                <span>{category}</span>
                <button
                  onClick={() => handleDeleteCategory(category)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#d32f2f',
                    cursor: 'pointer',
                    fontSize: '1rem',
                    padding: 0,
                    lineHeight: 1
                  }}
                  title="Delete category"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="admin-table">
        <table>
          <thead>
            <tr>
              <th>Cover</th>
              <th>Name</th>
              <th>Category</th>
              <th>Price List</th>
              <th>Description</th>
              <th>Protected</th>
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
                <td>{priceLists.find(pl => pl.id === album.priceListId)?.name || 'Default'}</td>
                <td>{album.description}</td>
                <td>{album.isPasswordProtected ? 'Yes' : 'No'}</td>
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
                  value={formData.description || ''}
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
                <label>Price List</label>
                <select
                  value={formData.priceListId || ''}
                  onChange={(e) => setFormData({ ...formData, priceListId: e.target.value ? parseInt(e.target.value) : undefined })}
                >
                  <option value="">Use Default Pricing</option>
                  {priceLists.map((pl) => (
                    <option key={pl.id} value={pl.id}>{pl.name}</option>
                  ))}
                </select>
                <a href="/admin/price-lists" style={{ fontSize: '0.85rem', color: '#0066cc', marginTop: '0.5rem', display: 'block' }}>
                  Manage price lists →
                </a>
              </div>
              <div className="form-group">
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <input
                    type="checkbox"
                    checked={formData.isPasswordProtected}
                    onChange={(e) => {
                      const isProtected = e.target.checked;
                      setFormData({
                        ...formData,
                        isPasswordProtected: isProtected,
                        password: isProtected ? formData.password : '',
                        passwordHint: isProtected ? formData.passwordHint : '',
                      });
                    }}
                  />
                  Require password to view album
                </label>
                {formData.isPasswordProtected && (
                  <div style={{ marginTop: '0.75rem', display: 'grid', gap: '0.75rem' }}>
                    <input
                      type="text"
                      placeholder="Album password"
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      required
                    />
                    <input
                      type="text"
                      placeholder="Optional hint (e.g. Couple's last name)"
                      value={formData.passwordHint}
                      onChange={(e) => setFormData({ ...formData, passwordHint: e.target.value })}
                    />
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
