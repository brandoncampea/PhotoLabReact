// Backup: verify and fix album photo count
import React, { useEffect, useState } from 'react';
import { useSasUrl } from '../../hooks/useSasUrl';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../services/api';
import { Album, PriceList } from '../../types';
import { categoryService } from '../../services/categoryService';
import { albumAdminService } from '../../services/albumAdminService';
import { studioPriceListService } from '../../services/studioPriceListService';
import { photoService } from '../../services/photoService';
import AdminLayout from '../../components/AdminLayout';
import './AdminAlbums.css';

type TagSuggestion = {
  id: number;
  photoId: number;
  fileName?: string;
  playerName: string;
  status: 'pending' | 'approved' | 'rejected';
  submittedByName?: string | null;
  submittedAt?: string;
  reviewedAt?: string | null;
  reviewNote?: string | null;
};

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
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', background: '#222' }}
      onError={e => { (e.target as HTMLImageElement).style.opacity = '0'; }}
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
  const [pendingTagCounts, setPendingTagCounts] = useState<Record<string, number>>({});
  const [tagReviewAlbum, setTagReviewAlbum] = useState<Album | null>(null);
  const [tagSuggestions, setTagSuggestions] = useState<TagSuggestion[]>([]);
  const [tagSuggestionsLoading, setTagSuggestionsLoading] = useState(false);
  const [tagSuggestionsActionId, setTagSuggestionsActionId] = useState<number | null>(null);
  const [tagSuggestionsMessage, setTagSuggestionsMessage] = useState('');

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

  const loadPendingTagCounts = async () => {
    try {
      const counts = await photoService.getPendingTagSuggestionCounts();
      setPendingTagCounts(counts || {});
    } catch (error) {
      console.error('Failed to load pending tag suggestion counts:', error);
      setPendingTagCounts({});
    }
  };

  const openTagReviewModal = async (album: Album) => {
    setTagReviewAlbum(album);
    setTagSuggestions([]);
    setTagSuggestionsMessage('');
    setTagSuggestionsLoading(true);
    try {
      const suggestions = await photoService.getAlbumTagSuggestions(album.id, 'pending');
      setTagSuggestions(suggestions as TagSuggestion[]);
    } catch (error) {
      console.error('Failed to load tag suggestions:', error);
      setTagSuggestionsMessage('Failed to load tag suggestions.');
    } finally {
      setTagSuggestionsLoading(false);
    }
  };

  const closeTagReviewModal = () => {
    setTagReviewAlbum(null);
    setTagSuggestions([]);
    setTagSuggestionsMessage('');
    setTagSuggestionsActionId(null);
  };

  const handleReviewTagSuggestion = async (suggestionId: number, decision: 'approve' | 'reject') => {
    if (!tagReviewAlbum) return;
    try {
      setTagSuggestionsActionId(suggestionId);
      setTagSuggestionsMessage('');
      await photoService.reviewTagSuggestion(suggestionId, decision);
      const suggestions = await photoService.getAlbumTagSuggestions(tagReviewAlbum.id, 'pending');
      setTagSuggestions(suggestions as TagSuggestion[]);
      await loadPendingTagCounts();
      setTagSuggestionsMessage(decision === 'approve' ? 'Tag approved.' : 'Tag rejected.');
    } catch (error) {
      console.error('Failed to review tag suggestion:', error);
      setTagSuggestionsMessage('Failed to process tag review.');
    } finally {
      setTagSuggestionsActionId(null);
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
  const getHiddenAlbumUrl = (albumId: number) => {
    const studioSlug = (editingAlbum as any)?.studioPublicSlug || localStorage.getItem('studioSlug') || '';
    return studioSlug
      ? `${window.location.origin}/albums/${albumId}?studioSlug=${encodeURIComponent(studioSlug)}&hidden=1`
      : `${window.location.origin}/albums/${albumId}?hidden=1`;
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
      await Promise.all([loadAlbums(), loadSchoolRoster(), loadPendingTagCounts()]);
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
        await Promise.all([loadAlbums(), loadPendingTagCounts()]);
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
    Promise.all([loadAlbums(), loadCategories(), loadPriceLists(), loadSchoolRoster(), loadPendingTagCounts()]);
  }, [effectiveStudioId]);

  const PAGE_SIZE = 12;
  const [page, setPage] = useState(1);

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

  const totalPages = Math.max(1, Math.ceil(filteredAlbums.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pagedAlbums = filteredAlbums.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

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

  const pendingTagReviewTotal = Object.values(pendingTagCounts).reduce((total, count) => total + Number(count || 0), 0);
  const hasPendingTagReviews = pendingTagReviewTotal > 0;

  const actionBtn = (label: string, color: string, onClick: () => void, title?: string): React.ReactNode => (
    <button
      type="button"
      title={title}
      onClick={onClick}
      style={{
        flex: 1,
        padding: '6px 0',
        fontSize: '0.75rem',
        fontWeight: 700,
        borderRadius: 7,
        border: `1.5px solid ${color}33`,
        background: `${color}12`,
        color,
        cursor: 'pointer',
        transition: 'background 0.15s, border 0.15s',
        minWidth: 0,
        whiteSpace: 'nowrap',
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = `${color}22`; (e.currentTarget as HTMLButtonElement).style.borderColor = `${color}66`; }}
      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = `${color}12`; (e.currentTarget as HTMLButtonElement).style.borderColor = `${color}33`; }}
    >
      {label}
    </button>
  );

  return (
    <AdminLayout>
      <div className="admin-albums-page" style={{ padding: '0 1rem 2rem' }}>

        {/* Page header */}
        <div style={{ marginBottom: '1.25rem' }}>
          <h1 style={{ fontSize: '1.65rem', fontWeight: 800, color: '#fff', margin: '0 0 0.3rem', letterSpacing: '-0.01em' }}>Albums</h1>
          <p style={{ color: '#6b6b80', fontSize: '0.9rem', margin: 0 }}>
            Manage your photo albums — publish, hide, tag, and share sessions with customers
          </p>
        </div>

        {/* Pending tag review banner */}
        {hasPendingTagReviews && (
          <div style={{ marginBottom: 16, padding: '12px 16px', borderRadius: 10, border: '1px solid rgba(251,191,36,0.4)', background: 'rgba(251,191,36,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: '0.95rem', color: '#fde68a' }}>
                ⚠️ {pendingTagReviewTotal} player tag suggestion{pendingTagReviewTotal === 1 ? '' : 's'} need review
              </div>
              <div style={{ fontSize: '0.8rem', color: '#ca8a04', marginTop: 2 }}>
                Open an album's review panel to approve or reject suggested player tags.
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                const first = filteredAlbums.find((a) => Number(pendingTagCounts[String(a.id)] || 0) > 0);
                if (first) openTagReviewModal(first);
              }}
              disabled={!filteredAlbums.some((a) => Number(pendingTagCounts[String(a.id)] || 0) > 0)}
              style={{ padding: '7px 18px', borderRadius: 8, background: 'rgba(251,191,36,0.2)', border: '1.5px solid rgba(251,191,36,0.5)', color: '#fde68a', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', whiteSpace: 'nowrap' }}
            >
              Review now
            </button>
          </div>
        )}

        {/* Search + Create */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
          <input
            type="text"
            placeholder="Search albums by name, category, description, or school…"
            value={albumSearch}
            onChange={(e) => { setAlbumSearch(e.target.value); setPage(1); }}
            style={{ flex: '1 1 300px', padding: '9px 14px', borderRadius: 9, border: '1.5px solid rgba(124,92,255,0.25)', background: 'rgba(22,22,35,0.9)', color: '#fff', fontSize: '0.9rem', outline: 'none' }}
          />
          <button
            onClick={handleCreate}
            style={{ padding: '9px 22px', borderRadius: 9, background: 'linear-gradient(135deg,#7c5cff,#6366f1)', border: 'none', color: '#fff', fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer', whiteSpace: 'nowrap' }}
          >
            + Create Album
          </button>
        </div>

        {/* Album count + pagination top */}
        {filteredAlbums.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
            <div style={{ fontSize: '0.78rem', color: '#4a4a6a', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              {filteredAlbums.length} album{filteredAlbums.length !== 1 ? 's' : ''}
              {albumSearch ? ` matching "${albumSearch}"` : ''}
              {totalPages > 1 && ` · page ${safePage} of ${totalPages}`}
            </div>
            {totalPages > 1 && (
              <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                <button
                  onClick={() => setPage(1)}
                  disabled={safePage === 1}
                  style={{ padding: '4px 9px', borderRadius: 6, border: '1.5px solid rgba(124,92,255,0.25)', background: 'none', color: safePage === 1 ? '#3a3a50' : '#7c5cff', fontWeight: 700, fontSize: '0.75rem', cursor: safePage === 1 ? 'default' : 'pointer' }}
                >«</button>
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={safePage === 1}
                  style={{ padding: '4px 9px', borderRadius: 6, border: '1.5px solid rgba(124,92,255,0.25)', background: 'none', color: safePage === 1 ? '#3a3a50' : '#7c5cff', fontWeight: 700, fontSize: '0.75rem', cursor: safePage === 1 ? 'default' : 'pointer' }}
                >‹</button>
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter(p => p === 1 || p === totalPages || Math.abs(p - safePage) <= 1)
                  .reduce<(number | '…')[]>((acc, p, i, arr) => {
                    if (i > 0 && p - (arr[i - 1] as number) > 1) acc.push('…');
                    acc.push(p);
                    return acc;
                  }, [])
                  .map((p, i) =>
                    p === '…' ? (
                      <span key={`ellipsis-${i}`} style={{ color: '#3a3a50', fontSize: '0.75rem', padding: '0 2px' }}>…</span>
                    ) : (
                      <button
                        key={p}
                        onClick={() => setPage(p as number)}
                        style={{ padding: '4px 9px', borderRadius: 6, border: '1.5px solid rgba(124,92,255,0.25)', background: safePage === p ? 'rgba(124,92,255,0.25)' : 'none', color: safePage === p ? '#c4b5fd' : '#7c5cff', fontWeight: 700, fontSize: '0.75rem', cursor: 'pointer', minWidth: 30 }}
                      >
                        {p}
                      </button>
                    )
                  )}
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={safePage === totalPages}
                  style={{ padding: '4px 9px', borderRadius: 6, border: '1.5px solid rgba(124,92,255,0.25)', background: 'none', color: safePage === totalPages ? '#3a3a50' : '#7c5cff', fontWeight: 700, fontSize: '0.75rem', cursor: safePage === totalPages ? 'default' : 'pointer' }}
                >›</button>
                <button
                  onClick={() => setPage(totalPages)}
                  disabled={safePage === totalPages}
                  style={{ padding: '4px 9px', borderRadius: 6, border: '1.5px solid rgba(124,92,255,0.25)', background: 'none', color: safePage === totalPages ? '#3a3a50' : '#7c5cff', fontWeight: 700, fontSize: '0.75rem', cursor: safePage === totalPages ? 'default' : 'pointer' }}
                >»</button>
              </div>
            )}
          </div>
        )}

        {/* Album cards grid */}
        {filteredAlbums.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: '#4a4a6a', fontSize: '1rem' }}>
            {albums.length === 0 ? 'No albums yet. Create your first album above.' : 'No albums match your search.'}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(270px, 1fr))', gap: '1rem' }}>
            {pagedAlbums.map((album) => {
              const studioSlug = (album as any).studioPublicSlug || localStorage.getItem('studioSlug') || '';
              const shareUrl = studioSlug
                ? `${window.location.origin}/albums/${album.id}?studioSlug=${encodeURIComponent(studioSlug)}`
                : `${window.location.origin}/albums/${album.id}`;
              const coverSrc =
                album.coverImageUrl && String(album.coverImageUrl).match(/^\d+$/)
                  ? `/api/photos/${album.coverImageUrl}/asset?variant=thumbnail`
                  : album.coverImageUrl || '/default-cover.png';
              const pendingCount = Number(pendingTagCounts[String(album.id)] || 0);
              const priceListName = priceLists.find(pl => pl.id === album.priceListId)?.name;

              return (
                <div
                  key={album.id}
                  style={{ background: 'rgba(22,22,35,0.95)', border: '1px solid rgba(124,92,255,0.15)', borderRadius: 14, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
                >
                  {/* Cover image — click navigates to photos */}
                  <div
                    onClick={() => { window.location.href = `/admin/photos?album=${album.id}`; }}
                    style={{ position: 'relative', height: 160, background: '#111', overflow: 'hidden', flexShrink: 0, cursor: 'pointer' }}
                    title="View photos in this album"
                  >
                    <AlbumSasCover src={coverSrc} alt={album.name} />
                    {/* Status badges overlay */}
                    <div style={{ position: 'absolute', top: 8, left: 8, display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '0.65rem', fontWeight: 800, padding: '2px 7px', borderRadius: 999, ...(album.published ? { background: 'rgba(34,197,94,0.85)', color: '#fff' } : { background: 'rgba(245,158,11,0.85)', color: '#fff' }) }}>
                        {album.published ? 'Published' : 'Draft'}
                      </span>
                      {album.hidden && <span style={{ fontSize: '0.65rem', fontWeight: 800, padding: '2px 7px', borderRadius: 999, background: 'rgba(0,0,0,0.7)', color: '#9ca3af' }}>Hidden</span>}
                      {album.isPasswordProtected && <span style={{ fontSize: '0.65rem', fontWeight: 800, padding: '2px 7px', borderRadius: 999, background: 'rgba(99,102,241,0.85)', color: '#fff' }}>🔒</span>}
                    </div>
                    {/* Pending tag badge */}
                    {pendingCount > 0 && (
                      <div style={{ position: 'absolute', top: 8, right: 8, background: 'rgba(251,191,36,0.9)', color: '#1a1a00', borderRadius: 999, fontSize: '0.7rem', fontWeight: 800, padding: '2px 8px' }}>
                        {pendingCount} tag{pendingCount !== 1 ? 's' : ''}
                      </div>
                    )}
                  </div>

                  {/* Card body */}
                  <div style={{ padding: '0.9rem 1rem', flex: 1, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <div>
                      <div style={{ fontSize: '0.98rem', fontWeight: 700, color: '#fff', lineHeight: 1.3, marginBottom: '0.15rem' }}>{album.name}</div>
                      {album.category && (
                        <div style={{ fontSize: '0.75rem', color: '#7c5cff', fontWeight: 600 }}>{album.category}</div>
                      )}
                      {album.description && (
                        <div style={{ fontSize: '0.78rem', color: '#5a5a72', marginTop: '0.2rem', lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                          {album.description}
                        </div>
                      )}
                    </div>

                    {/* Stats row */}
                    <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '0.5rem' }}>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '0.9rem', fontWeight: 800, color: '#a78bfa' }}>{album.photoCount ?? 0}</div>
                        <div style={{ fontSize: '0.65rem', color: '#4a4a6a', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Photos</div>
                      </div>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '0.9rem', fontWeight: 800, color: '#79c0ff' }}>{Number(album.viewCount || 0).toLocaleString()}</div>
                        <div style={{ fontSize: '0.65rem', color: '#4a4a6a', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Views</div>
                      </div>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '0.9rem', fontWeight: 800, color: '#7ee787' }}>${typeof album.netRevenue === 'number' ? album.netRevenue.toFixed(2) : '0.00'}</div>
                        <div style={{ fontSize: '0.65rem', color: '#4a4a6a', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Revenue</div>
                      </div>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '0.9rem', fontWeight: 800, color: '#fbbf24' }}>{album.productCount ?? 0}</div>
                        <div style={{ fontSize: '0.65rem', color: '#4a4a6a', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Orders</div>
                      </div>
                    </div>

                    {/* Price list + created */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.73rem', color: '#4a4a6a' }}>
                      <span>Price list: <span style={{ color: '#6b6b80' }}>{priceListName || 'Default'}</span></span>
                      <span>{new Date(album.createdDate).toLocaleDateString()}</span>
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div style={{ padding: '0.65rem 1rem 0.85rem', borderTop: '1px solid rgba(255,255,255,0.05)', display: 'flex', gap: 6 }}>
                    {actionBtn('Edit', '#a78bfa', () => handleEdit(album))}
                    {actionBtn('Photos', '#79c0ff', () => { window.location.href = `/admin/photos?album=${album.id}`; }, 'View Photos')}
                    {actionBtn('Share', '#7ee787', () => { navigator.clipboard.writeText(shareUrl); alert('Link copied!'); }, 'Copy Share Link')}
                    {pendingCount > 0
                      ? actionBtn(`Tags (${pendingCount})`, '#fbbf24', () => openTagReviewModal(album), 'Review tag suggestions')
                      : actionBtn('Tags', '#4a4a6a', () => openTagReviewModal(album), 'Review tag suggestions')}
                    {actionBtn('Delete', '#f87171', () => handleDelete(album.id))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      {tagReviewAlbum && (
        <div className="modal-overlay" onClick={closeTagReviewModal}>
          <div className="modal-content admin-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header admin-modal-header">
              <h2>Review Photo Tag Suggestions</h2>
              <button onClick={closeTagReviewModal} className="btn-close">×</button>
            </div>
            <div className="modal-body admin-modal-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
              <p style={{ marginTop: 0, color: '#bbb' }}>
                Album: <strong>{tagReviewAlbum.name}</strong>
              </p>

              {tagSuggestionsMessage && (
                <div style={{ marginBottom: 12, color: tagSuggestionsMessage.toLowerCase().includes('failed') ? '#ff9a9a' : '#79d279' }}>
                  {tagSuggestionsMessage}
                </div>
              )}

              {tagSuggestionsLoading ? (
                <div style={{ color: '#aaa' }}>Loading suggestions...</div>
              ) : tagSuggestions.length === 0 ? (
                <div style={{ color: '#aaa' }}>No pending tag suggestions for this album.</div>
              ) : (
                <div style={{ display: 'grid', gap: 10 }}>
                  {tagSuggestions.map((suggestion) => (
                    <div
                      key={suggestion.id}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '72px 1fr auto',
                        gap: 10,
                        alignItems: 'center',
                        border: '1px solid #2d2b45',
                        borderRadius: 8,
                        padding: 10,
                        background: '#19182a',
                      }}
                    >
                      <img
                        src={`/api/photos/${suggestion.photoId}/asset?variant=thumbnail`}
                        alt={suggestion.fileName || `Photo ${suggestion.photoId}`}
                        style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 6, background: '#111' }}
                      />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 700, color: '#fff' }}>{suggestion.playerName}</div>
                        <div style={{ fontSize: 12, color: '#b9b9c9' }}>
                          Photo: {suggestion.fileName || `#${suggestion.photoId}`}
                        </div>
                        <div style={{ fontSize: 12, color: '#9ca3af' }}>
                          Submitted {suggestion.submittedAt ? new Date(suggestion.submittedAt).toLocaleString() : 'recently'}
                          {suggestion.submittedByName ? ` by ${suggestion.submittedByName}` : ''}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <button
                          type="button"
                          className="btn"
                          style={{
                            background: '#16a34a',
                            color: '#fff',
                            border: 'none',
                            padding: '6px 10px',
                            opacity: tagSuggestionsActionId === suggestion.id ? 0.7 : 1,
                            cursor: tagSuggestionsActionId === suggestion.id ? 'not-allowed' : 'pointer',
                          }}
                          disabled={tagSuggestionsActionId === suggestion.id}
                          onClick={() => handleReviewTagSuggestion(suggestion.id, 'approve')}
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          className="btn"
                          style={{
                            background: '#dc2626',
                            color: '#fff',
                            border: 'none',
                            padding: '6px 10px',
                            opacity: tagSuggestionsActionId === suggestion.id ? 0.7 : 1,
                            cursor: tagSuggestionsActionId === suggestion.id ? 'not-allowed' : 'pointer',
                          }}
                          disabled={tagSuggestionsActionId === suggestion.id}
                          onClick={() => handleReviewTagSuggestion(suggestion.id, 'reject')}
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
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
              {editingAlbum ? (
                <div className="form-group">
                  <label>Share Link</label>
                  {(() => {
                    const studioSlug = (editingAlbum as any).studioPublicSlug || localStorage.getItem('studioSlug') || '';
                    const shareUrl = formData.hidden
                      ? getHiddenAlbumUrl(editingAlbum.id)
                      : studioSlug
                        ? `${window.location.origin}/albums/${editingAlbum.id}?studioSlug=${encodeURIComponent(studioSlug)}`
                        : `${window.location.origin}/albums/${editingAlbum.id}`;
                    return (
                      <>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <input
                            type="text"
                            value={shareUrl}
                            readOnly
                            style={{ flex: 1, fontSize: 13, background: '#222', color: '#fff', border: '1px solid #444', borderRadius: 4, padding: '4px 8px' }}
                          />
                          <button
                            type="button"
                            className="btn"
                            onClick={() => navigator.clipboard.writeText(shareUrl).then(() => alert('Link copied!'))}
                          >Copy</button>
                        </div>
                        {formData.hidden && (
                          <div style={{ fontSize: 12, color: '#aaa', marginTop: 4 }}>
                            Only users with this link can view the album.
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
              ) : (
                <div style={{ fontSize: 12, color: '#6b6b80', marginTop: 4 }}>
                  The share link will be available after saving the album.
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
