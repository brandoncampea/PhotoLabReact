import React, { useEffect, useState } from 'react';
import { useSasUrl } from '../../hooks/useSasUrl';
import api from '../../services/api';
import { Album, PriceList } from '../../types';
import { categoryService } from '../../services/categoryService';
import { albumAdminService } from '../../services/albumAdminService';
import AdminLayout from '../../components/AdminLayout';
import './AdminAlbums.css';

// Helper component for SAS-protected album covers
function AlbumSasCover({ src, alt }: { src: string, alt: string }) {
  // Only use SAS if src is a blob name, not a full URL or API endpoint
  const isBlobName = src && !src.startsWith('/') && !src.startsWith('http');
  const sasUrl = isBlobName ? useSasUrl(src) : null;
  return (
    <img
      src={isBlobName ? (sasUrl || '') : src}
      alt={alt}
      className="table-thumbnail"
      style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 6, background: '#222' }}
    />
  );
}

const AdminAlbums: React.FC = () => {
    // Load albums from API
    const loadAlbums = async () => {
      try {
        const res = await api.get('/albums');
        console.log('Albums API response:', res.data);
        setAlbums(res.data || []);
        setLoading(false);
      } catch (error) {
        setLoading(false);
        console.error('Failed to load albums:', error);
      }
    };

    // Load categories from API
    const loadCategories = async () => {
      try {
        const categories = await categoryService.getCategories();
        setCategories(categories || []);
      } catch (error) {
        console.error('Failed to load categories:', error);
      }
    };

    // Load price lists from API
    const loadPriceLists = async () => {
      try {
        const res = await api.get('/price-lists');
        const allPriceLists = Array.isArray(res.data) ? res.data : (res.data?.priceLists || []);
        const selectablePriceLists = allPriceLists.filter((pl: any) => {
          const name = String(pl?.name || '').trim().toLowerCase();
          const description = String(pl?.description || '').trim().toLowerCase();
          // Hide internal/system bridge price lists from album assignment UI.
          if (name === 'whcc import bridge') return false;
          if (description.includes('system bridge price list')) return false;
          return true;
        });
        setPriceLists(selectablePriceLists);
      } catch (error) {
        console.error('Failed to load price lists:', error);
      }
    };
    const handleCreate = () => {};
    const handleAddCategory = () => {};
    const handleEdit = (album: Album) => {
      setEditingAlbum(album);
      setFormData({
        name: album.name || '',
        description: album.description || '',
        category: album.category || '',
        priceListId: album.priceListId,
        isPasswordProtected: album.isPasswordProtected || false,
        password: album.password || '',
        passwordHint: album.passwordHint || '',
        coverType: '',
        paperType: '',
        albumSize: '',
      });
      setShowModal(true);
    };
    const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); };
  const [albums, setAlbums] = useState<Album[]>([]);
  const [priceLists, setPriceLists] = useState<PriceList[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingAlbum, setEditingAlbum] = useState<Album | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  // const [showNewCategory, setShowNewCategory] = useState(false);
  const [newCategory, setNewCategory] = useState('');
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    category: '',
    priceListId: undefined as number | undefined,
    isPasswordProtected: false,
    password: '',
    passwordHint: '',
    coverType: '',
    paperType: '',
    albumSize: '',
  });

  // const [albumStyles, setAlbumStyles] = useState<{coverTypes: string[], paperTypes: string[], albumSizes: string[]} | null>(null);
  // Minimal stub for setShowModal to avoid errors if not present
  // (If setShowModal is already defined, ignore this)
  // const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    loadAlbums();
    loadCategories();
    loadPriceLists();
    loadAlbumStyles();
  }, []);

  const loadAlbumStyles = async () => {
    try {
      // Replace studioId with actual studio id from context/auth
      const studioId = localStorage.getItem('viewAsStudioId');
      if (!studioId) return;
      // const res = await api.get(`/studios/${studioId}/album-styles`);
      // const styles = res.data.albumStyles || {};
      // setAlbumStyles({
      //   coverTypes: styles.coverTypes || [],
      //   paperTypes: styles.paperTypes || [],
      //   albumSizes: styles.albumSizes || [],
      // });
    } catch (error) {
      console.error('Failed to load album styles:', error);
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
    return (
      <AdminLayout>
        <div className="loading">Loading albums...</div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="admin-orders-container admin-albums-page">
      <div className="page-header admin-orders-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <h1 className="gradient-text" style={{ margin: 0 }}>Manage Albums</h1>
        <button onClick={handleCreate} className="btn btn-primary" style={{ fontSize: 18, padding: '8px 24px' }}>
          + Create Album
        </button>
      </div>

      {/* Categories Card */}
      <div className="dashboard-card tallydark-card admin-orders-card" style={{ maxWidth: 480, margin: '0 auto 32px auto', padding: 24, background: 'var(--card-bg, #23233a)', boxShadow: '0 2px 12px #0002', borderRadius: 16 }}>
        <div className="categories-section">
          <h3 style={{ marginTop: 0, marginBottom: 16 }}>Categories ({categories.length})</h3>
          <div className="add-category-row" style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <input
              className="add-category-input"
              type="text"
              placeholder="Add new category"
              value={newCategory}
              onChange={e => setNewCategory(e.target.value)}
              onKeyPress={e => e.key === 'Enter' && (e.preventDefault(), handleAddCategory())}
              style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid #333', background: '#19192a', color: '#fff' }}
            />
            <button className="add-category-btn" onClick={handleAddCategory} style={{ padding: '8px 16px', borderRadius: 8, background: 'var(--primary, #7b61ff)', color: '#fff', border: 'none', fontWeight: 500 }}>Add</button>
          </div>
          {categories.length > 0 && (
            <div className="category-tags" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {categories.map((category) => (
                <div key={category} className="category-tag" style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#19192a', borderRadius: 8, padding: '4px 12px', color: '#fff', fontWeight: 500 }}>
                  <span>{category}</span>
                  <button
                    onClick={() => handleDeleteCategory(category)}
                    className="category-tag-delete"
                    title="Delete category"
                    style={{ background: 'none', border: 'none', color: '#ff6b6b', fontSize: 18, cursor: 'pointer', marginLeft: 4 }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Albums Table Card */}
      <div className="dashboard-card tallydark-card admin-orders-card" style={{ width: '100%', maxWidth: 1200, margin: '0 auto', padding: 24, background: 'var(--card-bg, #23233a)', boxShadow: '0 2px 12px #0002', borderRadius: 16 }}>
        <div className="admin-table" style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0 }}>
            <thead>
              <tr style={{ background: 'transparent', color: '#fff', fontWeight: 700, fontSize: 16 }}>
                <th style={{ padding: '8px 12px', textAlign: 'left' }}>Cover</th>
                <th style={{ padding: '8px 12px', textAlign: 'left' }}>Name</th>
                <th style={{ padding: '8px 12px', textAlign: 'left' }}>Category</th>
                <th style={{ padding: '8px 12px', textAlign: 'left' }}>Price List</th>
                <th style={{ padding: '8px 12px', textAlign: 'left' }}>Description</th>
                <th style={{ padding: '8px 12px', textAlign: 'left' }}>Protected</th>
                <th style={{ padding: '8px 12px', textAlign: 'left' }}>Photos</th>
                <th style={{ padding: '8px 12px', textAlign: 'left' }}>Created</th>
                <th style={{ padding: '8px 12px', textAlign: 'left' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {albums.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: '2rem', color: '#aaa', fontSize: '1.1rem' }}>
                    No albums found.
                  </td>
                </tr>
              ) : (
                albums.map((album) => (
                  <tr key={album.id} style={{ borderBottom: '1px solid #29294a' }}>
                    <td style={{ padding: '8px 12px' }}>
                      <AlbumSasCover src={album.coverImageUrl || ''} alt={album.name} />
                    </td>
                    <td style={{ fontWeight: 500, padding: '8px 12px', color: '#fff' }}>{album.name}</td>
                    <td style={{ padding: '8px 12px', color: '#fff' }}>{album.category || '-'}</td>
                    <td style={{ padding: '8px 12px', color: '#fff' }}>{priceLists.find(pl => pl.id === album.priceListId)?.name || 'Default'}</td>
                    <td style={{ padding: '8px 12px', color: '#fff' }}>{album.description}</td>
                    <td style={{ padding: '8px 12px', color: '#fff' }}>{album.isPasswordProtected ? 'Yes' : 'No'}</td>
                    <td style={{ padding: '8px 12px', color: '#fff' }}>{album.photoCount}</td>
                    <td style={{ padding: '8px 12px', color: '#fff' }}>{new Date(album.createdDate).toLocaleDateString()}</td>
                    <td style={{ padding: '8px 12px' }}>
                      <div className="action-buttons" style={{ display: 'flex', gap: 8 }}>
                        <button onClick={() => handleEdit(album)} className="btn-icon">✏️</button>
                        <button onClick={() => handleDelete(album.id)} className="btn-icon">🗑️</button>
                        <button
                          onClick={() => window.location.href = `/admin/photos?album=${album.id}`}
                          className="btn-icon"
                          title="View Photos"
                        >
                          📷
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content admin-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header admin-modal-header">
              <h2>{editingAlbum ? 'Edit Album' : 'Create Album'}</h2>
              <button onClick={() => setShowModal(false)} className="btn-close">×</button>
            </div>
            <form onSubmit={handleSubmit} className="modal-body admin-modal-body" autoComplete="off">
              <div className="form-group">
                <label>Name</label>
                <input type="text" value={formData.name} onChange={e => setFormData(f => ({ ...f, name: e.target.value }))} required />
              </div>
              <div className="form-group">
                <label>Description</label>
                <textarea value={formData.description} onChange={e => setFormData(f => ({ ...f, description: e.target.value }))} />
              </div>
              <div className="form-group">
                <label>Category</label>
                <select value={formData.category} onChange={e => setFormData(f => ({ ...f, category: e.target.value }))}>
                  <option value="">Select category</option>
                  {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Price List</label>
                <select value={formData.priceListId ?? ''} onChange={e => setFormData(f => ({ ...f, priceListId: e.target.value ? Number(e.target.value) : undefined }))}>
                  <option value="">Default</option>
                  {priceLists.map(pl => <option key={pl.id} value={pl.id}>{pl.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Protected</label>
                <input type="checkbox" checked={formData.isPasswordProtected} onChange={e => setFormData(f => ({ ...f, isPasswordProtected: e.target.checked }))} />
              </div>
              {formData.isPasswordProtected && (
                <>
                  <div className="form-group">
                    <label>Password</label>
                    <input type="text" value={formData.password} onChange={e => setFormData(f => ({ ...f, password: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label>Password Hint</label>
                    <input type="text" value={formData.passwordHint} onChange={e => setFormData(f => ({ ...f, passwordHint: e.target.value }))} />
                  </div>
                </>
              )}
              <div className="form-group">
                <label>Cover Type</label>
                <input type="text" value={formData.coverType} onChange={e => setFormData(f => ({ ...f, coverType: e.target.value }))} />
              </div>
              <div className="form-group">
                <label>Paper Type</label>
                <input type="text" value={formData.paperType} onChange={e => setFormData(f => ({ ...f, paperType: e.target.value }))} />
              </div>
              <div className="form-group">
                <label>Album Size</label>
                <input type="text" value={formData.albumSize} onChange={e => setFormData(f => ({ ...f, albumSize: e.target.value }))} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 24 }}>
                <button type="button" className="btn" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Save</button>
              </div>
            </form>
          </div>
        </div>

      )}
    </div>
    </AdminLayout>
  );
};

export default AdminAlbums;
