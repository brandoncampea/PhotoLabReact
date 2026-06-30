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

  // Album-level player tag suggestions
  type AlbumPlayerSuggestion = {
    id: number;
    playerName: string;
    playerNumber?: string | null;
    notes?: string | null;
    submittedByName?: string | null;
    submittedByEmail?: string | null;
    status: 'pending' | 'approved' | 'rejected';
    submittedAt?: string;
    reviewedAt?: string | null;
    reviewNote?: string | null;
  };
  const [pendingPlayerTagCounts, setPendingPlayerTagCounts] = useState<Record<string, number>>({});
  const [playerTagReviewAlbum, setPlayerTagReviewAlbum] = useState<Album | null>(null);
  const [albumPlayerSuggestions, setAlbumPlayerSuggestions] = useState<AlbumPlayerSuggestion[]>([]);
  const [albumPlayerSuggestionsLoading, setAlbumPlayerSuggestionsLoading] = useState(false);
  const [albumPlayerSuggestionsActionId, setAlbumPlayerSuggestionsActionId] = useState<number | null>(null);
  const [albumPlayerSuggestionsMessage, setAlbumPlayerSuggestionsMessage] = useState('');

  // Per-album price overrides
  const [priceOverrides, setPriceOverrides] = useState<{ productSizeId: number; sizeName: string; productName: string; productId: number; price: number; overridePrice: number | null }[]>([]);
  const [overrideDrafts, setOverrideDrafts] = useState<Record<number, string>>({});
  const [overridesLoading, setOverridesLoading] = useState(false);
  const [overridesSaving, setOverridesSaving] = useState(false);
  const [showPriceOverrides, setShowPriceOverrides] = useState(false);

  // Share codes
  const [shareCodes, setShareCodes] = useState<{ id: number; code: string; label: string | null; createdAt: string; visits: number; orders: number }[]>([]);
  const [shareCodesLoading, setShareCodesLoading] = useState(false);
  const [newCodeLabel, setNewCodeLabel] = useState('');
  const [showShareCodes, setShowShareCodes] = useState(false);

  // Favorites stats
  const [favStatsAlbum, setFavStatsAlbum] = useState<Album | null>(null);
  const [favStats, setFavStats] = useState<{ photoId: number; favoriteCount: number; fileName: string }[]>([]);
  const [favStatsLoading, setFavStatsLoading] = useState(false);

  // Load albums from API
  const loadAlbums = async () => {
    try {
      const res = await api.get('/albums');
      setAlbums(res.data || []);
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

  const loadPendingPlayerTagCounts = async () => {
    try {
      const res = await api.get('/albums/player-suggestions/pending-counts');
      setPendingPlayerTagCounts(res.data?.counts || {});
    } catch {
      setPendingPlayerTagCounts({});
    }
  };

  const openPlayerTagReviewModal = async (album: Album) => {
    setPlayerTagReviewAlbum(album);
    setAlbumPlayerSuggestions([]);
    setAlbumPlayerSuggestionsMessage('');
    setAlbumPlayerSuggestionsLoading(true);
    try {
      const res = await api.get(`/albums/${album.id}/player-suggestions?status=pending`);
      setAlbumPlayerSuggestions(res.data?.suggestions || []);
    } catch {
      setAlbumPlayerSuggestionsMessage('Failed to load suggestions.');
    } finally {
      setAlbumPlayerSuggestionsLoading(false);
    }
  };

  const closePlayerTagReviewModal = () => {
    setPlayerTagReviewAlbum(null);
    setAlbumPlayerSuggestions([]);
    setAlbumPlayerSuggestionsMessage('');
    setAlbumPlayerSuggestionsActionId(null);
  };

  const handleReviewAlbumPlayerSuggestion = async (id: number, decision: 'approve' | 'reject') => {
    if (!playerTagReviewAlbum) return;
    try {
      setAlbumPlayerSuggestionsActionId(id);
      setAlbumPlayerSuggestionsMessage('');
      await api.post(`/albums/player-suggestions/${id}/review`, { decision });
      const res = await api.get(`/albums/${playerTagReviewAlbum.id}/player-suggestions?status=pending`);
      setAlbumPlayerSuggestions(res.data?.suggestions || []);
      await loadPendingPlayerTagCounts();
      setAlbumPlayerSuggestionsMessage(decision === 'approve' ? 'Approved.' : 'Rejected.');
    } catch {
      setAlbumPlayerSuggestionsMessage('Failed to process review.');
    } finally {
      setAlbumPlayerSuggestionsActionId(null);
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
  const loadPriceOverrides = async (albumId: number) => {
    setOverridesLoading(true);
    try {
      const overrides = await albumAdminService.getPriceOverrides(albumId);
      setPriceOverrides(overrides);
      const drafts: Record<number, string> = {};
      overrides.forEach(o => { drafts[o.productSizeId] = o.overridePrice != null ? String(o.overridePrice) : ''; });
      setOverrideDrafts(drafts);
    } catch { /* silent */ }
    setOverridesLoading(false);
  };

  const savePriceOverrides = async () => {
    if (!editingAlbum) return;
    setOverridesSaving(true);
    try {
      const overrides = Object.entries(overrideDrafts)
        .filter(([, v]) => v !== '' && !isNaN(parseFloat(v)))
        .map(([k, v]) => ({ productSizeId: Number(k), price: parseFloat(v) }));
      await albumAdminService.savePriceOverrides(editingAlbum.id, overrides);
      alert('Price overrides saved!');
    } catch { alert('Failed to save price overrides.'); }
    setOverridesSaving(false);
  };

  const loadShareCodes = async (albumId: number) => {
    setShareCodesLoading(true);
    try {
      const codes = await albumAdminService.getShareCodes(albumId);
      setShareCodes(codes);
    } catch { /* silent */ }
    setShareCodesLoading(false);
  };

  const createShareCode = async () => {
    if (!editingAlbum) return;
    try {
      await albumAdminService.createShareCode(editingAlbum.id, newCodeLabel || undefined);
      setNewCodeLabel('');
      await loadShareCodes(editingAlbum.id);
    } catch { alert('Failed to create share code.'); }
  };

  const openFavStats = async (album: Album) => {
    setFavStatsAlbum(album);
    setFavStatsLoading(true);
    try {
      const stats = await albumAdminService.getFavoriteStats(album.id);
      setFavStats(stats);
    } catch { setFavStats([]); }
    setFavStatsLoading(false);
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
    Promise.all([loadAlbums(), loadCategories(), loadPriceLists(), loadSchoolRoster(), loadPendingTagCounts(), loadPendingPlayerTagCounts()]);
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

  const labelStyle: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 700, color: '#a78bfa', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 };
  const inputStyle: React.CSSProperties = { width: '100%', padding: '9px 12px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(102,102,204,0.25)', borderRadius: 8, color: '#e4e4e7', fontSize: 13, outline: 'none', boxSizing: 'border-box' };
  const sectionStyle: React.CSSProperties = { paddingBottom: 18, marginBottom: 18, borderBottom: '1px solid rgba(102,102,204,0.1)' };
  const inlineAddBtnStyle: React.CSSProperties = { padding: '9px 14px', borderRadius: 8, border: '1px solid rgba(124,92,255,0.4)', background: 'rgba(124,92,255,0.15)', color: '#c4b5fd', fontWeight: 700, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 };
  const suggestionChipStyle: React.CSSProperties = { padding: '4px 10px', borderRadius: 20, border: '1px solid rgba(102,102,204,0.25)', background: 'rgba(255,255,255,0.03)', color: '#a1a1aa', fontSize: 12, cursor: 'pointer', fontWeight: 500 };
  const selectedChipStyle: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 5, background: 'rgba(124,92,255,0.18)', border: '1px solid rgba(124,92,255,0.45)', borderRadius: 20, padding: '4px 10px', fontSize: 12, color: '#c4b5fd', fontWeight: 600 };
  const chipRemoveBtnStyle: React.CSSProperties = { background: 'transparent', border: 'none', color: '#7c5cff', cursor: 'pointer', lineHeight: 1, fontSize: 15, padding: 0, fontWeight: 700 };
  const toggleRowStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 0', borderBottom: '1px solid rgba(102,102,204,0.07)', cursor: 'pointer' };

  const pendingTagReviewTotal = Object.values(pendingTagCounts).reduce((total, count) => total + Number(count || 0), 0);
  const hasPendingTagReviews = pendingTagReviewTotal > 0;

  const actionBtn = (label: string, color: string, onClick: () => void, title?: string): React.ReactNode => (
    <button
      type="button"
      title={title}
      onClick={onClick}
      style={{
        padding: '6px 4px',
        fontSize: '0.75rem',
        fontWeight: 700,
        borderRadius: 7,
        border: `1.5px solid ${color}33`,
        background: `${color}12`,
        color,
        cursor: 'pointer',
        transition: 'background 0.15s, border 0.15s',
        whiteSpace: 'nowrap',
        textAlign: 'center',
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
              const pendingPlayerCount = Number(pendingPlayerTagCounts[String(album.id)] || 0);
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
                  <div style={{ padding: '0.65rem 1rem 0.85rem', borderTop: '1px solid rgba(255,255,255,0.05)', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 5 }}>
                    {actionBtn('Edit', '#a78bfa', () => handleEdit(album))}
                    {actionBtn('Photos', '#79c0ff', () => { window.location.href = `/admin/photos?album=${album.id}`; }, 'View Photos')}
                    {actionBtn('Share', '#7ee787', () => { navigator.clipboard.writeText(shareUrl); alert('Link copied!'); }, 'Copy Share Link')}
                    {actionBtn('Favorites', '#f472b6', () => openFavStats(album), 'View favorited photos')}
                    {pendingCount > 0
                      ? actionBtn(`Tags (${pendingCount})`, '#fbbf24', () => openTagReviewModal(album), 'Review tag suggestions')
                      : actionBtn('Tags', '#4a4a6a', () => openTagReviewModal(album), 'Review tag suggestions')}
                    {pendingPlayerCount > 0
                      ? actionBtn(`Players (${pendingPlayerCount})`, '#34d399', () => openPlayerTagReviewModal(album), 'Review album player tags')
                      : actionBtn('Players', '#3a4a3a', () => openPlayerTagReviewModal(album), 'Review album player tags')}
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
      {/* Album-level player tag suggestion review modal */}
      {playerTagReviewAlbum && (
        <div className="modal-overlay" onClick={closePlayerTagReviewModal}>
          <div className="modal-content admin-modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header admin-modal-header">
              <h2>👤 Player Tag Suggestions</h2>
              <button onClick={closePlayerTagReviewModal} className="btn-close">×</button>
            </div>
            <div className="modal-body admin-modal-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
              <p style={{ marginTop: 0, color: '#bbb' }}>
                Album: <strong>{playerTagReviewAlbum.name}</strong>
              </p>
              <p style={{ marginTop: 0, fontSize: 12, color: '#666' }}>
                Customers spotted these players in this album. Approve to let them know you'll tag them going forward.
              </p>
              {albumPlayerSuggestionsMessage && (
                <div style={{ marginBottom: 12, color: albumPlayerSuggestionsMessage.toLowerCase().includes('failed') ? '#ff9a9a' : '#79d279' }}>
                  {albumPlayerSuggestionsMessage}
                </div>
              )}
              {albumPlayerSuggestionsLoading ? (
                <div style={{ color: '#aaa' }}>Loading…</div>
              ) : albumPlayerSuggestions.length === 0 ? (
                <div style={{ color: '#aaa' }}>No pending player tag suggestions for this album.</div>
              ) : (
                <div style={{ display: 'grid', gap: 10 }}>
                  {albumPlayerSuggestions.map(s => (
                    <div key={s.id} style={{ border: '1px solid #2d2b45', borderRadius: 8, padding: 12, background: '#19182a' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 6 }}>
                        <div>
                          <div style={{ fontWeight: 700, color: '#fff', fontSize: 14 }}>
                            {s.playerName}{s.playerNumber ? <span style={{ color: '#9ca3af', fontWeight: 400 }}> #{s.playerNumber}</span> : null}
                          </div>
                          {s.notes && <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>{s.notes}</div>}
                          {s.submittedByName && <div style={{ fontSize: 11, color: '#555', marginTop: 4 }}>Submitted by {s.submittedByName}</div>}
                        </div>
                        <div style={{ fontSize: 10, color: '#555', whiteSpace: 'nowrap' }}>
                          {s.submittedAt ? new Date(s.submittedAt).toLocaleDateString() : ''}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          className="btn"
                          style={{ background: '#166534', color: '#86efac', border: '1px solid rgba(134,239,172,0.3)', padding: '5px 12px', opacity: albumPlayerSuggestionsActionId === s.id ? 0.6 : 1, cursor: albumPlayerSuggestionsActionId === s.id ? 'not-allowed' : 'pointer' }}
                          disabled={albumPlayerSuggestionsActionId === s.id}
                          onClick={() => handleReviewAlbumPlayerSuggestion(s.id, 'approve')}
                        >
                          ✓ Approve
                        </button>
                        <button
                          className="btn"
                          style={{ background: '#7f1d1d', color: '#fca5a5', border: '1px solid rgba(252,165,165,0.3)', padding: '5px 12px', opacity: albumPlayerSuggestionsActionId === s.id ? 0.6 : 1, cursor: albumPlayerSuggestionsActionId === s.id ? 'not-allowed' : 'pointer' }}
                          disabled={albumPlayerSuggestionsActionId === s.id}
                          onClick={() => handleReviewAlbumPlayerSuggestion(s.id, 'reject')}
                        >
                          ✕ Reject
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
            <form onSubmit={handleSubmit} autoComplete="off" style={{ display: 'flex', flexDirection: 'column', gap: 0, overflowY: 'auto', maxHeight: '75vh', padding: '20px 24px 0' }}>

              {/* ── Basic info ── */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 20 }}>
                <div>
                  <label style={labelStyle}>Album Name</label>
                  <input style={inputStyle} type="text" value={formData.name} onChange={e => setFormData(f => ({ ...f, name: e.target.value }))} placeholder="e.g. 2026 Whitworth Football" required />
                </div>
                <div>
                  <label style={labelStyle}>Description <span style={{ fontWeight: 400, color: '#4a4a6a' }}>(optional)</span></label>
                  <textarea style={{ ...inputStyle, minHeight: 72, resize: 'vertical' }} value={formData.description} onChange={e => setFormData(f => ({ ...f, description: e.target.value }))} placeholder="Short description visible to customers" />
                </div>
              </div>

              {/* ── Category ── */}
              <div style={sectionStyle}>
                <label style={labelStyle}>Category</label>
                <select style={inputStyle} value={formData.category} onChange={e => setFormData(f => ({ ...f, category: e.target.value }))}>
                  <option value="">No category</option>
                  {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                </select>
                <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                  <input
                    style={{ ...inputStyle, flex: 1 }}
                    type="text"
                    placeholder="New category name…"
                    value={newModalCategory}
                    onChange={e => setNewModalCategory(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddCategoryFromModal(); } }}
                  />
                  <button type="button" onClick={handleAddCategoryFromModal} style={inlineAddBtnStyle}>+ Add</button>
                </div>
              </div>

              {/* ── Tagged Schools ── */}
              <div style={sectionStyle}>
                <label style={labelStyle}>Tagged Schools</label>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input
                    style={{ ...inputStyle, flex: 1 }}
                    type="text"
                    placeholder="Search or type a school name…"
                    value={newSchoolTag}
                    onChange={e => setNewSchoolTag(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addSchoolTag(newSchoolTag); } }}
                  />
                  <button type="button" onClick={() => addSchoolTag(newSchoolTag)} style={inlineAddBtnStyle}>+ Add</button>
                </div>
                {schoolSuggestions.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 8 }}>
                    {schoolSuggestions.map((school) => (
                      <button key={school} type="button" onClick={() => addSchoolTag(school)} style={suggestionChipStyle}>
                        + {school}
                      </button>
                    ))}
                  </div>
                )}
                {formData.schoolTags.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                    {formData.schoolTags.map((school) => (
                      <span key={school} style={selectedChipStyle}>
                        {school}
                        <button type="button" onClick={() => removeSchoolTag(school)} style={chipRemoveBtnStyle} aria-label={`Remove ${school}`}>×</button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* ── Price List ── */}
              <div style={sectionStyle}>
                <label style={labelStyle}>Price List</label>
                <select style={{ ...inputStyle, maxWidth: 220 }} value={formData.priceListId ?? ''} onChange={e => setFormData(f => ({ ...f, priceListId: e.target.value ? Number(e.target.value) : undefined }))}>
                  <option value="">Default</option>
                  {priceLists.map(pl => <option key={pl.id} value={pl.id}>{pl.name}</option>)}
                </select>
              </div>

              {/* ── Visibility & access ── */}
              <div style={{ ...sectionStyle, display: 'flex', flexDirection: 'column', gap: 0 }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: '#4a4a6a', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>Visibility &amp; Access</div>
                {([
                  { key: 'published', label: 'Published', desc: 'Customers can view and search this album' },
                  { key: 'hidden', label: 'Hidden', desc: 'Only accessible via direct share link' },
                  { key: 'isPasswordProtected', label: 'Password Protected', desc: 'Require a password to view' },
                  { key: 'batchShippingActive', label: 'Batch Shipping', desc: 'Enable batch shipping for this album' },
                  { key: 'albumPurchaseEnabled', label: 'Album Purchase', desc: 'Allow customers to buy the entire album' },
                ] as { key: keyof typeof formData; label: string; desc: string }[]).map(({ key, label, desc }) => (
                  <label key={key} style={toggleRowStyle}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#e4e4e7' }}>{label}</div>
                      <div style={{ fontSize: 11, color: '#4a4a6a', marginTop: 1 }}>{desc}</div>
                    </div>
                    <div
                      onClick={() => setFormData(f => ({ ...f, [key]: !f[key] }))}
                      style={{
                        width: 40, height: 22, borderRadius: 11, flexShrink: 0, cursor: 'pointer', position: 'relative',
                        background: formData[key] ? '#7c5cff' : 'rgba(255,255,255,0.1)',
                        transition: 'background 0.2s',
                      }}
                    >
                      <div style={{
                        position: 'absolute', top: 3, left: formData[key] ? 21 : 3,
                        width: 16, height: 16, borderRadius: '50%', background: '#fff',
                        transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
                      }} />
                    </div>
                  </label>
                ))}
              </div>

              {/* ── Password fields ── */}
              {formData.isPasswordProtected && (
                <div style={{ ...sectionStyle, display: 'flex', gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <label style={labelStyle}>Password</label>
                    <input style={inputStyle} type="text" value={formData.password} onChange={e => setFormData(f => ({ ...f, password: e.target.value }))} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={labelStyle}>Password Hint</label>
                    <input style={inputStyle} type="text" value={formData.passwordHint} onChange={e => setFormData(f => ({ ...f, passwordHint: e.target.value }))} />
                  </div>
                </div>
              )}

              {/* ── Share Links & Referral Tracking ── */}
              {editingAlbum ? (() => {
                const studioSlug = (editingAlbum as any).studioPublicSlug || localStorage.getItem('studioSlug') || '';
                const baseUrl = formData.hidden
                  ? getHiddenAlbumUrl(editingAlbum.id)
                  : studioSlug
                    ? `${window.location.origin}/albums/${editingAlbum.id}?studioSlug=${encodeURIComponent(studioSlug)}`
                    : `${window.location.origin}/albums/${editingAlbum.id}`;
                return (
                  <div style={sectionStyle}>
                    <label style={labelStyle}>Share Link</label>
                    <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                      <input type="text" value={baseUrl} readOnly style={{ ...inputStyle, flex: 1, color: '#a78bfa', fontSize: 12 }} />
                      <button type="button" onClick={() => navigator.clipboard.writeText(baseUrl).then(() => alert('Link copied!'))} style={inlineAddBtnStyle}>Copy</button>
                    </div>
                    {formData.hidden && <div style={{ fontSize: 11, color: '#6b6b80', marginBottom: 8 }}>Only users with this link can view the album.</div>}

                    {/* Referral tracking codes */}
                    <button
                      type="button"
                      style={{ ...suggestionChipStyle, fontSize: 12, padding: '5px 12px', marginBottom: showShareCodes ? 10 : 0 }}
                      onClick={() => {
                        if (!showShareCodes) loadShareCodes(editingAlbum.id);
                        setShowShareCodes(v => !v);
                      }}
                    >{showShareCodes ? 'Hide' : 'Track Referrals'}</button>

                    {showShareCodes && (
                      <div style={{ background: 'rgba(124,92,255,0.06)', border: '1px solid rgba(124,92,255,0.2)', borderRadius: 8, padding: '10px 12px', marginTop: 8 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#a78bfa', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Referral Codes</div>
                        {shareCodesLoading ? (
                          <div style={{ fontSize: 12, color: '#6b6b80' }}>Loading…</div>
                        ) : (
                          <>
                            {shareCodes.length === 0 && <div style={{ fontSize: 12, color: '#6b6b80', marginBottom: 8 }}>No codes yet. Generate one to track visits and orders from a specific link.</div>}
                            {shareCodes.map(c => {
                              const refUrl = `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}ref=${c.code}`;
                              return (
                                <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                                  <span style={{ fontSize: 11, background: 'rgba(0,0,0,0.3)', borderRadius: 4, padding: '2px 8px', color: '#c4b5fd', fontFamily: 'monospace' }}>{c.code}</span>
                                  {c.label && <span style={{ fontSize: 11, color: '#9ca3af' }}>{c.label}</span>}
                                  <span style={{ fontSize: 11, color: '#6b7280' }}>{c.visits} visits · {c.orders} orders</span>
                                  <button type="button" onClick={() => navigator.clipboard.writeText(refUrl).then(() => alert('Referral link copied!'))} style={{ ...suggestionChipStyle, fontSize: 10, padding: '2px 8px' }}>Copy Link</button>
                                </div>
                              );
                            })}
                            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                              <input
                                type="text"
                                placeholder="Label (e.g. Instagram)"
                                value={newCodeLabel}
                                onChange={e => setNewCodeLabel(e.target.value)}
                                style={{ ...inputStyle, flex: 1, fontSize: 12, padding: '6px 10px' }}
                              />
                              <button type="button" onClick={createShareCode} style={inlineAddBtnStyle}>+ New Code</button>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })() : (
                <div style={{ fontSize: 11, color: '#4a4a6a', marginBottom: 8 }}>Share link available after saving.</div>
              )}

              {/* ── Per-Album Price Overrides ── */}
              {editingAlbum && (
                <div style={sectionStyle}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: showPriceOverrides ? 10 : 0 }}>
                    <label style={labelStyle}>Price Overrides</label>
                    <button
                      type="button"
                      style={{ ...suggestionChipStyle, fontSize: 12, padding: '5px 12px' }}
                      onClick={() => {
                        if (!showPriceOverrides) loadPriceOverrides(editingAlbum.id);
                        setShowPriceOverrides(v => !v);
                      }}
                    >{showPriceOverrides ? 'Hide' : 'Edit Prices'}</button>
                  </div>
                  {showPriceOverrides && (
                    <div style={{ background: 'rgba(124,92,255,0.06)', border: '1px solid rgba(124,92,255,0.2)', borderRadius: 8, padding: '10px 12px' }}>
                      <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 10 }}>Set a price override for specific product sizes in this album. Leave blank to use the default price list price.</div>
                      {overridesLoading ? (
                        <div style={{ fontSize: 12, color: '#6b6b80' }}>Loading…</div>
                      ) : priceOverrides.length === 0 ? (
                        <div style={{ fontSize: 12, color: '#6b6b80' }}>No overridable sizes found. Add products to this album's price list first.</div>
                      ) : (
                        <>
                          {Object.entries(
                            priceOverrides.reduce((acc: Record<string, typeof priceOverrides>, o) => {
                              if (!acc[o.productName]) acc[o.productName] = [];
                              acc[o.productName].push(o);
                              return acc;
                            }, {})
                          ).map(([productName, sizes]) => (
                            <div key={productName} style={{ marginBottom: 10 }}>
                              <div style={{ fontSize: 11, fontWeight: 700, color: '#a78bfa', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{productName}</div>
                              {sizes.map(o => (
                                <div key={o.productSizeId} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                                  <span style={{ flex: 1, fontSize: 12, color: '#d1d5db' }}>{o.sizeName}</span>
                                  <span style={{ fontSize: 11, color: '#6b7280' }}>Default: ${o.price.toFixed(2)}</span>
                                  <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    placeholder="Override"
                                    value={overrideDrafts[o.productSizeId] ?? ''}
                                    onChange={e => setOverrideDrafts(d => ({ ...d, [o.productSizeId]: e.target.value }))}
                                    style={{ ...inputStyle, width: 90, padding: '4px 8px', fontSize: 12 }}
                                  />
                                </div>
                              ))}
                            </div>
                          ))}
                          <button type="button" disabled={overridesSaving} onClick={savePriceOverrides} style={{ ...inlineAddBtnStyle, fontSize: 12, marginTop: 4 }}>
                            {overridesSaving ? 'Saving…' : 'Save Overrides'}
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* ── Actions ── */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '16px 0 20px', position: 'sticky', bottom: 0, background: 'rgba(18,18,30,0.98)', marginTop: 4 }}>
                <button type="button" onClick={() => setShowModal(false)} style={{ padding: '9px 20px', borderRadius: 8, border: '1px solid rgba(102,102,204,0.3)', background: 'transparent', color: '#a1a1aa', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>Cancel</button>
                <button type="submit" style={{ padding: '9px 24px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg,#7c5cff,#6366f1)', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>Save Album</button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Favorites stats modal */}
      {favStatsAlbum && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ background: '#16162a', border: '1px solid rgba(124,92,255,0.3)', borderRadius: 16, padding: 24, maxWidth: 520, width: '100%', maxHeight: '80vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#fff' }}>Favorited Photos</div>
                <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>{favStatsAlbum.name}</div>
              </div>
              <button type="button" onClick={() => setFavStatsAlbum(null)} style={{ background: 'transparent', border: 'none', color: '#9ca3af', fontSize: 20, cursor: 'pointer', lineHeight: 1 }}>×</button>
            </div>
            {favStatsLoading ? (
              <div style={{ color: '#6b7280', fontSize: 14 }}>Loading…</div>
            ) : favStats.length === 0 ? (
              <div style={{ color: '#6b7280', fontSize: 14 }}>No favorites yet for this album.</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ color: '#9ca3af', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    <th style={{ textAlign: 'left', padding: '6px 0' }}>Photo</th>
                    <th style={{ textAlign: 'right', padding: '6px 0' }}>Favorites</th>
                  </tr>
                </thead>
                <tbody>
                  {favStats.map(s => (
                    <tr key={s.photoId} style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                      <td style={{ padding: '7px 0', color: '#e4e4e7' }}>{s.fileName || `Photo #${s.photoId}`}</td>
                      <td style={{ padding: '7px 0', textAlign: 'right', color: '#f472b6', fontWeight: 700 }}>♥ {s.favoriteCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </AdminLayout>
  );
}

export default AdminAlbums;
