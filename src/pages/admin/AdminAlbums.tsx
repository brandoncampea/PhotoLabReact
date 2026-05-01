import React, { useEffect, useState } from 'react';
import { useSasUrl } from '../../hooks/useSasUrl';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../services/api';
import { Album, PriceList } from '../../types';
import { categoryService } from '../../services/categoryService';
import { albumAdminService } from '../../services/albumAdminService';
import { studioPriceListService } from '../../services/studioPriceListService';
import AdminLayout from '../../components/AdminLayout';
import './AdminAlbums.css';

// Helper component for SAS-protected album covers
function AlbumSasCover({ src, alt }: { src: string, alt: string }) {
  // Always use SAS for Azure blob images, even if src is a full URL or blob path
  function extractBlobName(url: string): string | null {
    if (!url) return null;
    // Match Azure blob URLs (with or without query)
    const azureMatch = url.match(/^https?:\/\/[^/]+\/(.+?)(\?.*)?$/);
    if (azureMatch) {
      return decodeURIComponent(azureMatch[1]);
    }
    // If it's already a blob name (not a URL or API endpoint)
    if (!url.startsWith('/') && !url.startsWith('http')) {
      return url;
    }
    return null;
  }
  const blobName = extractBlobName(src);
  // If src is an API endpoint, use it directly. Otherwise, use SAS if blobName is valid.
  const isApiEndpoint = src && src.startsWith('/api/photos/');
  const sasUrl = blobName && !isApiEndpoint ? useSasUrl(blobName) : null;
  return (
    <img
      src={isApiEndpoint ? src : (sasUrl || src)}
      alt={alt}
      className="table-thumbnail"
      style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 6, background: '#222' }}
    />
  );
}

const AdminAlbums: React.FC = () => {
  const { user } = useAuth();
  const effectiveStudioId = Number(localStorage.getItem('viewAsStudioId') || user?.studioId || 0);
  const emptyFormData = {
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
    batchShippingActive: false,
  };
  const [albums, setAlbums] = useState<Album[]>([]);
  const [priceLists, setPriceLists] = useState<PriceList[]>([]);
  const [, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingAlbum, setEditingAlbum] = useState<Album | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [newModalCategory, setNewModalCategory] = useState('');
  const [albumSearch, setAlbumSearch] = useState('');
  const [formData, setFormData] = useState(emptyFormData);

  // Load albums from API
  const loadAlbums = async () => {
    try {
      const res = await api.get('/albums');
      setAlbums(res.data || []);
      if (Array.isArray(res.data)) {
        const uniqueCategories = Array.from(new Set(res.data.map((album: any) => album.category).filter(Boolean)));
        setCategories(uniqueCategories);
      }
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
    if (!effectiveStudioId) {
      setPriceLists([]);
      return;
    }

    try {
      const lists = await studioPriceListService.getLists(effectiveStudioId);
      setPriceLists(Array.isArray(lists) ? lists : []);
    } catch (error) {
      console.error('Failed to load price lists:', error);
      setPriceLists([]);
    }
  };
  const handleCreate = () => {
    setEditingAlbum(null);
    setFormData(emptyFormData);
    setNewModalCategory('');
    setShowModal(true);
  };
  const handleEdit = (album: Album) => {
    setEditingAlbum(album);
    setNewModalCategory('');
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
      batchShippingActive: !!album.batchShippingActive,
    });
    setShowModal(true);
  };
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      name: formData.name.trim(),
      description: formData.description?.trim() || '',
      category: formData.category || undefined,
      priceListId: formData.priceListId,
      isPasswordProtected: !!formData.isPasswordProtected,
      password: formData.isPasswordProtected ? formData.password : undefined,
      passwordHint: formData.isPasswordProtected ? formData.passwordHint : undefined,
      batchShippingActive: !!formData.batchShippingActive,
    };
    if (!payload.name) {
      alert('Album name is required.');
      return;
    }
    try {
      if (editingAlbum) {
        await albumAdminService.updateAlbum(editingAlbum.id, payload);
      } else {
        await albumAdminService.createAlbum(payload);
      }
      setShowModal(false);
      setEditingAlbum(null);
      setNewModalCategory('');
      setFormData(emptyFormData);
      await loadAlbums();
    } catch (error: any) {
      console.error('Failed to save album:', error);
      const message = error?.response?.data?.error || 'Failed to save album. Please try again.';
      alert(message);
    }
  };
  const handleDelete = async (id: number) => {
    if (confirm('Are you sure you want to delete this album?')) {
      try {
        await albumAdminService.deleteAlbum(id);
        setAlbums(albums.filter(a => a.id !== id));
        await loadAlbums();
      } catch (error) {
        console.error('Failed to delete album:', error);
      }
    }
  };
  const handleAddCategoryFromModal = async () => {
    const category = newModalCategory.trim();
    if (!category) return;
    try {
      const updatedCategories = await categoryService.addCategory(category);
      setCategories(updatedCategories || []);
      setFormData((f) => ({ ...f, category }));
      setNewModalCategory('');
    } catch (error) {
      console.error('Failed to add category from modal:', error);
      alert('Failed to add category. Please try again.');
    }
  };

  useEffect(() => {
    loadAlbums();
    loadCategories();
    loadPriceLists();
  }, [effectiveStudioId]);

  const normalizedSearch = albumSearch.trim().toLowerCase();
  const filteredAlbums = normalizedSearch
    ? albums.filter((album) => {
        const name = String(album.name || '').toLowerCase();
        const category = String(album.category || '').toLowerCase();
        const description = String(album.description || '').toLowerCase();
        return name.includes(normalizedSearch)
          || category.includes(normalizedSearch)
          || description.includes(normalizedSearch);
      })
    : albums;

  return (
    <AdminLayout>
      <div className="admin-albums-page">
        {/* Search + Create Album */}
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
          <input
            type="text"
            placeholder="Search albums by name, category, or description"
            value={albumSearch}
            onChange={(e) => setAlbumSearch(e.target.value)}
            style={{ minWidth: 320, flex: '1 1 420px' }}
          />
          <button className="btn btn-primary" onClick={handleCreate}>+ Create Album</button>
        </div>

        {/* Albums Table Card */}
        <div className="dashboard-card tallydark-card admin-orders-card">
          <div className="admin-table" style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0 }}>
              <thead>
                <tr style={{ background: 'transparent', color: '#fff', fontWeight: 700, fontSize: 16 }}>
                  <th style={{ padding: '8px 12px', textAlign: 'left' }}>Actions</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left' }}>Cover</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left' }}>Name</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left' }}>Category</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left' }}>Price List</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left' }}>Description</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left' }}>Protected</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left' }}>Photos</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left' }}>Engagement</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left' }}>Products Ordered</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left' }}>Est. Net Revenue</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left' }}>Created</th>
                </tr>
              </thead>
            <tbody>
              {filteredAlbums.length === 0 ? (
                <tr>
                  <td colSpan={12} style={{ textAlign: 'center', padding: '2rem', color: '#aaa', fontSize: '1.1rem' }}>
                    {albums.length === 0 ? 'No albums found.' : 'No matching albums found.'}
                  </td>
                </tr>
              ) : (
                filteredAlbums.map((album) => {
                  // Always link directly to the customer album page
                  // Use the real public_slug from the studio (returned by the API)
                  const studioSlug = (album as any).studioPublicSlug || localStorage.getItem('studioSlug') || '';
                  const shareUrl = studioSlug
                    ? `${window.location.origin}/albums/${album.id}?studioSlug=${encodeURIComponent(studioSlug)}`
                    : `${window.location.origin}/albums/${album.id}`;
                  // Use the same logic as public albums for cover image
                  const coverSrc =
                    album.coverImageUrl && String(album.coverImageUrl).match(/^\d+$/)
                      ? `/api/photos/${album.coverImageUrl}/asset?variant=thumbnail`
                      : album.coverImageUrl || '/default-cover.png';
                  return (
                    <tr key={album.id} style={{ borderBottom: '1px solid #29294a' }}>
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
                          <button
                            className="btn-icon"
                            title="Copy Share Link"
                            onClick={() => {
                              navigator.clipboard.writeText(shareUrl);
                              alert('Share link copied to clipboard!');
                            }}
                          >🔗</button>
                        </div>
                      </td>
                      <td style={{ padding: '8px 12px' }}>
                        <AlbumSasCover src={coverSrc} alt={album.name} />
                      </td>
                      <td style={{ fontWeight: 500, padding: '8px 12px', color: '#fff' }}>{album.name}</td>
                      <td style={{ padding: '8px 12px', color: '#fff' }}>{album.category || '-'}</td>
                      <td style={{ padding: '8px 12px', color: '#fff' }}>{priceLists.find(pl => pl.id === album.priceListId)?.name || 'Default'}</td>
                      <td style={{ padding: '8px 12px', color: '#fff' }}>{album.description}</td>
                      <td style={{ padding: '8px 12px', color: '#fff' }}>{album.isPasswordProtected ? 'Yes' : 'No'}</td>
                      <td style={{ padding: '8px 12px', color: '#fff' }}>{album.photoCount}</td>
                      <td style={{ padding: '8px 12px', color: '#fff', minWidth: 140 }}>
                        <div style={{ display: 'grid', gap: 2 }}>
                          <span>Opens: {Number(album.viewOpenCount || 0).toLocaleString()}</span>
                          <span>Clicks: {Number(album.viewClickCount || 0).toLocaleString()}</span>
                          <strong>Total: {Number(album.viewCount || 0).toLocaleString()}</strong>
                        </div>
                      </td>
                      <td style={{ padding: '8px 12px', color: '#fff' }}>{album.productCount ?? 0}</td>
                      <td style={{ padding: '8px 12px', color: '#fff' }}>
                        {typeof album.netRevenue === 'number' ? `$${album.netRevenue.toFixed(2)}` : '$0.00'}
                      </td>
                      <td style={{ padding: '8px 12px', color: '#fff' }}>{new Date(album.createdDate).toLocaleDateString()}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
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
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <input
                    type="text"
                    placeholder="Add new category"
                    value={newModalCategory}
                    onChange={e => setNewModalCategory(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddCategoryFromModal();
                      }
                    }}
                  />
                  <button type="button" className="btn" onClick={handleAddCategoryFromModal}>Add</button>
                </div>
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
                <label>Batch Shipping</label>
                <input type="checkbox" checked={!!formData.batchShippingActive} onChange={e => setFormData(f => ({ ...f, batchShippingActive: e.target.checked }))} />
                <span style={{ marginLeft: 8, fontSize: '0.92em', color: '#aaa' }}>
                  Enable batch shipping for this album
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 24 }}>
                <button type="button" className="btn" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Save</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}

export default AdminAlbums;
