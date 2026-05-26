// Backup: verify and fix album photo count
async function verifyAndFixAlbumPhotoCount(albumId: number) {
  try {
    const res = await api.get(`/photos/album/${albumId}`);
    const photos = Array.isArray(res.data) ? res.data : [];
    const albumRes = await api.get(`/albums/${albumId}`);
    const album = albumRes.data;
    if (album && typeof album.photoCount === 'number' && album.photoCount !== photos.length) {
      // Always send photoCount in the update payload
      await albumAdminService.updateAlbum(albumId, { photoCount: photos.length });
    }
  } catch (err) {
    // Silent fail
  }
}
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
  // Show a small square thumbnail (original admin style)
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
    schoolTags: [] as string[],
    priceListId: undefined as number | undefined,
    isPasswordProtected: false,
    password: '',
    passwordHint: '',
    coverType: '',
    paperType: '',
    albumSize: '',
    batchShippingActive: false,
    albumPurchaseEnabled: true,
    published: false,
    hidden: false,
  };
  const [albums, setAlbums] = useState<Album[]>([]);
  const [priceLists, setPriceLists] = useState<PriceList[]>([]);
  const [, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingAlbum, setEditingAlbum] = useState<Album | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [newModalCategory, setNewModalCategory] = useState('');
  const [newSchoolTag, setNewSchoolTag] = useState('');
  const [studioSchoolRoster, setStudioSchoolRoster] = useState<string[]>([]);
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
        // Backup: verify and fix photo count for each album
        await Promise.all(res.data.map((album: any) => verifyAndFixAlbumPhotoCount(album.id)));
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

  const loadSchoolRoster = async () => {
    try {
      const res = await api.get('/albums/school-roster');
      const names = Array.isArray(res.data)
        ? Array.from(new Set(res.data.map((row: any) => String(row?.schoolName || '').trim()).filter(Boolean)))
        : [];
      setStudioSchoolRoster(names);
    } catch (error) {
      console.error('Failed to load school roster:', error);
      setStudioSchoolRoster([]);
    }
  };

  const normalizeSchoolTag = (value: string) => value.trim().replace(/\s+/g, ' ');

  const addSchoolTag = (rawValue: string) => {
    const next = normalizeSchoolTag(rawValue);
    if (!next) return;

    setFormData((prev) => {
      const exists = prev.schoolTags.some((tag) => tag.toLowerCase() === next.toLowerCase());
      if (exists) return prev;
      return {
        ...prev,
        schoolTags: [...prev.schoolTags, next].slice(0, 30),
      };
    });
    setNewSchoolTag('');
  };

  const removeSchoolTag = (tagToRemove: string) => {
    setFormData((prev) => ({
      ...prev,
      schoolTags: prev.schoolTags.filter((tag) => tag !== tagToRemove),
    }));
  };
  const handleCreate = () => {
    setEditingAlbum(null);
    setFormData(emptyFormData);
    setNewModalCategory('');
    setNewSchoolTag('');
    setShowModal(true);
  };
  const handleEdit = (album: Album) => {
    console.log('[AdminAlbums] handleEdit album:', album);
    setEditingAlbum(album);
    setNewModalCategory('');
    setNewSchoolTag('');
    setFormData({
      name: album.name || '',
      description: album.description || '',
      category: album.category || '',
      schoolTags: Array.isArray(album.schoolTags) ? album.schoolTags.filter(Boolean) : [],
      priceListId: album.priceListId,
      isPasswordProtected: album.isPasswordProtected || false,
      password: album.password || '',
      passwordHint: album.passwordHint || '',
      coverType: '',
      paperType: '',
      albumSize: '',
      batchShippingActive: !!album.batchShippingActive,
      albumPurchaseEnabled: album.albumPurchaseEnabled !== false,
      published: album.published === undefined || album.published === null ? true : !!album.published,
      hidden: album.hidden ?? false,
    });
    setShowModal(true);
  };
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      name: formData.name.trim(),
      description: formData.description?.trim() || '',
      category: formData.category || undefined,
      schoolTags: formData.schoolTags,
      priceListId: formData.priceListId,
      isPasswordProtected: !!formData.isPasswordProtected,
      password: formData.isPasswordProtected ? formData.password : undefined,
      passwordHint: formData.isPasswordProtected ? formData.passwordHint : undefined,
      batchShippingActive: !!formData.batchShippingActive,
      albumPurchaseEnabled: formData.albumPurchaseEnabled !== false,
      published: !!formData.published,
      hidden: !!formData.hidden,
    };
      // Helper for unique hidden album URL
      const getHiddenAlbumUrl = (albumId: number) => {
        const studioSlug = (editingAlbum as any)?.studioPublicSlug || localStorage.getItem('studioSlug') || '';
        return studioSlug
          ? `${window.location.origin}/albums/${albumId}?studioSlug=${encodeURIComponent(studioSlug)}&hidden=1`
          : `${window.location.origin}/albums/${albumId}?hidden=1`;
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
      setNewSchoolTag('');
      setFormData(emptyFormData);
      // Always reload albums from backend to get latest published/hidden state
      await loadAlbums();
      await loadSchoolRoster();
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
    loadSchoolRoster();
  }, [effectiveStudioId]);

  const normalizedSearch = albumSearch.trim().toLowerCase();
  const filteredAlbums = normalizedSearch
    ? albums.filter((album) => {
        const name = String(album.name || '').toLowerCase();
        const category = String(album.category || '').toLowerCase();
        const description = String(album.description || '').toLowerCase();
        const schools = Array.isArray(album.schoolTags) ? album.schoolTags.join(' ').toLowerCase() : '';
        return name.includes(normalizedSearch)
          || category.includes(normalizedSearch)
          || description.includes(normalizedSearch)
          || schools.includes(normalizedSearch);
      })
    : albums;

  const schoolSuggestions = newSchoolTag.trim()
    ? studioSchoolRoster.filter((school) => {
        const lower = school.toLowerCase();
        const q = newSchoolTag.trim().toLowerCase();
        const selected = formData.schoolTags.some((tag) => tag.toLowerCase() === lower);
        return !selected && lower.includes(q);
      }).slice(0, 8)
    : studioSchoolRoster
        .filter((school) => !formData.schoolTags.some((tag) => tag.toLowerCase() === school.toLowerCase()))
        .slice(0, 8);

  return (
    <AdminLayout>
      <div className="admin-albums-page">
        {/* Search + Create Album */}
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
          <input
            type="text"
            placeholder="Search albums by name, category, description, or school"
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
                <label>Tagged Schools</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    type="text"
                    placeholder="Add school (e.g., Riverside High School)"
                    value={newSchoolTag}
                    onChange={e => setNewSchoolTag(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addSchoolTag(newSchoolTag);
                      }
                    }}
                  />
                  <button type="button" className="btn" onClick={() => addSchoolTag(newSchoolTag)}>Add</button>
                </div>

                {schoolSuggestions.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                    {schoolSuggestions.map((school) => (
                      <button
                        key={school}
                        type="button"
                        className="btn"
                        style={{ padding: '4px 8px', fontSize: 12 }}
                        onClick={() => addSchoolTag(school)}
                      >
                        + {school}
                      </button>
                    ))}
                  </div>
                )}

                {formData.schoolTags.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                    {formData.schoolTags.map((school) => (
                      <span
                        key={school}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          background: 'rgba(123, 97, 255, 0.2)',
                          border: '1px solid rgba(123, 97, 255, 0.5)',
                          borderRadius: 999,
                          padding: '4px 10px',
                          fontSize: 13,
                        }}
                      >
                        {school}
                        <button
                          type="button"
                          onClick={() => removeSchoolTag(school)}
                          style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', lineHeight: 1 }}
                          aria-label={`Remove ${school}`}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}
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
              <div className="form-group">
                <label>Album Purchase</label>
                <input type="checkbox" checked={formData.albumPurchaseEnabled !== false} onChange={e => setFormData(f => ({ ...f, albumPurchaseEnabled: e.target.checked }))} />
                <span style={{ marginLeft: 8, fontSize: '0.92em', color: '#aaa' }}>
                  Allow customers to buy the entire album (enabled by default)
                </span>
              </div>
              <div className="form-group">
                <label>Published</label>
                <input
                  type="checkbox"
                  checked={!!formData.published}
                  onChange={e => setFormData(f => ({ ...f, published: e.target.checked }))}
                />
                <span style={{ marginLeft: 8, fontSize: '0.92em', color: '#aaa' }}>
                  Customers can view and search this album when published
                </span>
              </div>
              <div className="form-group">
                <label>Hidden</label>
                <input
                  type="checkbox"
                  checked={!!formData.hidden}
                  onChange={e => setFormData(f => ({ ...f, hidden: e.target.checked }))}
                />
                <span style={{ marginLeft: 8, fontSize: '0.92em', color: '#aaa' }}>
                  Hide this album from your public albums page and search
                </span>
              </div>
              {formData.hidden && editingAlbum && (
                <div className="form-group">
                  <label>Unique Shareable URL</label>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input
                      type="text"
                      value={getHiddenAlbumUrl(editingAlbum.id)}
                      readOnly
                      style={{ flex: 1, fontSize: 13, background: '#222', color: '#fff', border: '1px solid #444', borderRadius: 4, padding: '4px 8px' }}
                    />
                    <button
                      type="button"
                      className="btn"
                      onClick={() => {
                        navigator.clipboard.writeText(getHiddenAlbumUrl(editingAlbum.id));
                        alert('Hidden album link copied to clipboard!');
                      }}
                    >Copy</button>
                  </div>
                  <div style={{ fontSize: 12, color: '#aaa', marginTop: 4 }}>
                    Only users with this link can view the album. It will not appear in search or album lists.
                  </div>
                </div>
              )}
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
