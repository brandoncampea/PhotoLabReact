import { useEffect, useState, useRef } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import AdminLayout from '../../components/AdminLayout';

interface SmugMugAlbumOption {
  albumKey: string;
  name: string;
  description?: string;
  imageCount?: number;
  webUri?: string;
  imported?: boolean;
  localAlbumId?: number | null;
  importedAt?: string | null;
}

interface SmugMugImportPhotoProgress {
  timestamp: string;
  albumKey: string;
  albumName: string;
  fileName: string;
  status: 'imported' | 'skipped' | 'failed';
  detail?: string;
}

interface SmugMugImportAlbumProgress {
  albumKey: string;
  name: string;
  status: 'pending' | 'preparing' | 'importing' | 'completed';
  photosTotal: number;
  photosProcessed: number;
  photosImported: number;
  photosSkipped: number;
  photosFailed: number;
}

interface SmugMugImportProgress {
  jobId: string;
  status: 'running' | 'completed' | 'failed';
  currentAlbumKey: string | null;
  currentAlbumName: string;
  storageMode?: 'azure' | 'smugmug-source';
  totals: {
    albumsTotal: number;
    albumsCompleted: number;
    photosTotal: number;
    photosProcessed: number;
    photosImported: number;
    photosSkipped: number;
    photosFailed: number;
  };
  albums: SmugMugImportAlbumProgress[];
  recentPhotos: SmugMugImportPhotoProgress[];
  error?: string | null;
}

const AdminSmugMug: React.FC<{ embedded?: boolean }> = ({ embedded = false }) => {
  const { user } = useAuth();
  const effectiveStudioId = Number(localStorage.getItem('viewAsStudioId')) || user?.studioId;

  const [smugmugNickname, setSmugmugNickname] = useState('');
  const [smugmugApiKey, setSmugmugApiKey] = useState('');
  const [smugmugApiSecret, setSmugmugApiSecret] = useState('');
    // --- OAuth Connect Flow ---
    const [smugmugOAuthLoading, setSmugmugOAuthLoading] = useState(false);
    const [smugmugOAuthError, setSmugmugOAuthError] = useState('');
    const [smugmugConnected, setSmugmugConnected] = useState(false);
    // Removed unused oauthPolling state
    const oauthPollingRef = useRef<NodeJS.Timeout | null>(null);


    // Check if already connected (look for access token in config or ?connected=1)
    useEffect(() => {
      // Check for ?connected=1 in URL (after OAuth callback)
      const params = new URLSearchParams(window.location.search);
      if (params.get('connected') === '1') {
        setSmugmugConnected(true);
        // Optionally, remove the query param from the URL
        window.history.replaceState({}, document.title, window.location.pathname);
        return;
      }
      // Otherwise, will be set by fetchSmugmugConfig
      setSmugmugConnected(false);
    }, [effectiveStudioId]);

    // Start OAuth flow
    const startSmugmugOAuth = async () => {
      setSmugmugOAuthLoading(true);
      setSmugmugOAuthError('');
      try {
        // Always use backend API URL for OAuth endpoints (prevents port mismatch)
        let apiBase = import.meta.env.VITE_API_URL || 'http://localhost:3000';
        // Remove trailing /api if present
        apiBase = apiBase.replace(/\/api\/?$/, '');
        const callbackUrl = `${apiBase}/api/smugmug/oauth/callback`;
        const response = await fetch(`/api/smugmug/oauth/request-token`, {
          method: 'POST',
          headers: {
            ...getAuthHeaders(),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ callbackUrl }),
        });
        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.error || 'Failed to start SmugMug OAuth');
        }
        const data = await response.json();
        // Store requestTokenSecret in URL for callback (not secure, but demo)
        const url = `${data.authorizeUrl}&requestTokenSecret=${encodeURIComponent(data.requestTokenSecret)}`;
        // Open OAuth in a popup window
        console.log('[SmugMug OAuth] Opening popup:', url);
        const popup = window.open(url, '_blank', 'width=600,height=700');
        if (!popup) {
          console.error('[SmugMug OAuth] Failed to open popup window');
          return;
        }
        // Removed unused completed variable
        // Listen for message from popup (OAuth callback)
        const handleMessage = (event: MessageEvent) => {
          const allowedOrigins = [
            window.location.origin,
            (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')
          ];
          console.log('[SmugMug OAuth] Received postMessage:', event.data, 'from', event.origin);
          if (allowedOrigins.includes(event.origin)) {
            if (event.data === 'smugmug-oauth-success') {
              console.log('[SmugMug OAuth] Received success postMessage, waiting 1s before fetching config...');
              setSmugmugOAuthLoading(false);
              if (oauthPollingRef.current) {
                clearInterval(oauthPollingRef.current);
                oauthPollingRef.current = null;
              }
              setTimeout(() => {
                console.log('[SmugMug OAuth] Fetching config after delay...');
                fetchSmugmugConfig();
              }, 1000);
              if (popup && !popup.closed) popup.close();
            } else if (event.data === 'smugmug-oauth-error') {
              setSmugmugOAuthError('SmugMug OAuth failed');
              setSmugmugOAuthLoading(false);
              if (oauthPollingRef.current) {
                clearInterval(oauthPollingRef.current);
                oauthPollingRef.current = null;
              }
              if (popup && !popup.closed) popup.close();
            }
            window.removeEventListener('message', handleMessage);
          }
        };
        window.addEventListener('message', handleMessage);

        // (Removed popup close polling: unreliable for cross-origin popups. Only rely on postMessage for completion.)
      } catch (err: any) {
        setSmugmugOAuthError((err as Error)?.message || 'Failed to start SmugMug OAuth');
        setSmugmugOAuthLoading(false);
        if (oauthPollingRef.current) {
          clearInterval(oauthPollingRef.current);
          oauthPollingRef.current = null;
        }
      }
    };
  const [smugmugAlbums, setSmugmugAlbums] = useState<SmugMugAlbumOption[]>([]);
  const [selectedSmugmugAlbums, setSelectedSmugmugAlbums] = useState<Record<string, boolean>>({});
  const [smugmugLoading, setSmugmugLoading] = useState(false);
  const [smugmugSaving, setSmugmugSaving] = useState(false);
  const [smugmugImporting, setSmugmugImporting] = useState(false);
  const [smugmugNotice, setSmugmugNotice] = useState('');
  const [importProgress, setImportProgress] = useState<SmugMugImportProgress | null>(null);
  const [storageMode, setStorageMode] = useState<'azure' | 'smugmug-source'>('azure');

  const selectedAlbumCount = smugmugAlbums.reduce(
    (count, album) => count + (selectedSmugmugAlbums[album.albumKey] ? 1 : 0),
    0
  );
  const selectableAlbumCount = smugmugAlbums.filter((album) => !album.imported).length;
  const allAlbumsSelected = selectableAlbumCount > 0 && selectedAlbumCount === selectableAlbumCount;

  const getAuthHeaders = () => {
    const token = localStorage.getItem('authToken');
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
    };
    const actingStudioId = localStorage.getItem('viewAsStudioId');
    if (actingStudioId) {
      headers['x-acting-studio-id'] = actingStudioId;
    }
    return headers;
  };

  const fetchSmugmugConfig = async () => {
    if (!effectiveStudioId) return;
    try {
      const response = await fetch('/api/smugmug/config', {
        headers: getAuthHeaders(),
      });
      if (!response.ok) return;
      const data = await response.json();
      setSmugmugNickname(data.nickname || '');
      setSmugmugApiKey(data.apiKey || '');
      setSmugmugApiSecret(data.apiSecret || '');
      setStorageMode(data.storageMode === 'smugmug-source' ? 'smugmug-source' : 'azure');
      // Set connected if access token is present
      if (data.accessToken || data.access_token) {
        setSmugmugConnected(true);
        // Stop polling if connected
        if (oauthPollingRef.current) {
          clearInterval(oauthPollingRef.current);
          oauthPollingRef.current = null;
        }
      } else {
        setSmugmugConnected(false);
      }
    } catch (err) {
      console.error('Failed to load SmugMug config:', err);
    }
  };

  useEffect(() => {
    fetchSmugmugConfig();
  }, [effectiveStudioId]);

  const saveSmugmugConfig = async () => {
    setSmugmugSaving(true);
    setSmugmugNotice('');
    try {
      const response = await fetch('/api/smugmug/config', {
        method: 'PUT',
        headers: {
          ...getAuthHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ nickname: smugmugNickname, apiKey: smugmugApiKey, apiSecret: smugmugApiSecret }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to save SmugMug config');
      }

      const responseData = await response.json();
      setSmugmugNotice('SmugMug settings saved');
      setStorageMode(responseData.storageMode === 'smugmug-source' ? 'smugmug-source' : 'azure');
    } catch (err: any) {
      setSmugmugNotice(err.message || 'Failed to save SmugMug settings');
    } finally {
      setSmugmugSaving(false);
    }
  };

  const loadSmugmugAlbums = async () => {
    setSmugmugLoading(true);
    setSmugmugNotice('');
    try {
      const query = new URLSearchParams();
      if (smugmugNickname) query.set('nickname', smugmugNickname);
      if (smugmugApiKey) query.set('apiKey', smugmugApiKey);

      const response = await fetch(`/api/smugmug/albums?${query.toString()}`, {
        headers: getAuthHeaders(),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to load SmugMug albums');
      }

      const data = await response.json();
      const albums = Array.isArray(data.albums) ? data.albums : [];
      setSmugmugAlbums(albums);
      const selected: Record<string, boolean> = {};
      albums.forEach((album: SmugMugAlbumOption) => {
        selected[album.albumKey] = false;
      });
      setSelectedSmugmugAlbums(selected);
      setSmugmugNotice(`Loaded ${albums.length} SmugMug albums`);
    } catch (err: any) {
      setSmugmugNotice(err.message || 'Failed to load SmugMug albums');
    } finally {
      setSmugmugLoading(false);
    }
  };

  const importSelectedSmugmugAlbums = async () => {
    const albumsToImport = smugmugAlbums.filter((album) => selectedSmugmugAlbums[album.albumKey]);
    if (!albumsToImport.length) {
      setSmugmugNotice('Select at least one album to import');
      return;
    }

    const jobId = globalThis.crypto?.randomUUID?.() || `smugmug-${Date.now()}`;
    setSmugmugImporting(true);
    setSmugmugNotice('');
    setImportProgress({
      jobId,
      status: 'running',
      currentAlbumKey: null,
      currentAlbumName: '',
      storageMode,
      totals: {
        albumsTotal: albumsToImport.length,
        albumsCompleted: 0,
        photosTotal: 0,
        photosProcessed: 0,
        photosImported: 0,
        photosSkipped: 0,
        photosFailed: 0,
      },
      albums: albumsToImport.map((album) => ({
        albumKey: album.albumKey,
        name: album.name,
        status: 'pending',
        photosTotal: Number(album.imageCount) || 0,
        photosProcessed: 0,
        photosImported: 0,
        photosSkipped: 0,
        photosFailed: 0,
      })),
      recentPhotos: [],
      error: null,
    });

    const pollProgress = async () => {
      try {
        const progressResponse = await fetch(`/api/smugmug/import-progress/${jobId}`, {
          headers: getAuthHeaders(),
        });
        if (!progressResponse.ok) return;
        const progressData = await progressResponse.json();
        setStorageMode(progressData.storageMode === 'smugmug-source' ? 'smugmug-source' : 'azure');
        setImportProgress(progressData);
      } catch (err) {
        console.error('Failed to load import progress:', err);
      }
    };

    let pollInterval: number | null = null;

    try {
      pollInterval = window.setInterval(() => {
        pollProgress();
      }, 800);

      const response = await fetch('/api/smugmug/import', {
        method: 'POST',
        headers: {
          ...getAuthHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jobId,
          nickname: smugmugNickname,
          albums: albumsToImport.map((album) => ({
            albumKey: album.albumKey,
            name: album.name,
            description: album.description,
          })),
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'SmugMug import failed');
      }

      const data = await response.json();
  setStorageMode(data.storageMode === 'smugmug-source' ? 'smugmug-source' : 'azure');
      await pollProgress();
      const importedCount = Array.isArray(data.imported) ? data.imported.length : 0;
      setSmugmugNotice(`Import completed. ${importedCount} album(s) processed.`);
      await loadSmugmugAlbums();
    } catch (err: any) {
      setSmugmugNotice(err.message || 'SmugMug import failed');
    } finally {
      if (pollInterval !== null) {
        window.clearInterval(pollInterval);
      }
      await pollProgress();
      setSmugmugImporting(false);
    }
  };

  const handleSelectAllAlbums = () => {
    const next: Record<string, boolean> = {};
    smugmugAlbums.forEach((album) => {
      next[album.albumKey] = !album.imported;
    });
            // removed stray line causing syntax error
  };

  const handleClearAllAlbums = () => {
    const next: Record<string, boolean> = {};
    smugmugAlbums.forEach((album) => {
      next[album.albumKey] = false;
    });
    setSelectedSmugmugAlbums(next);
  };

  if (user?.role !== 'studio_admin' && user?.role !== 'super_admin') {
    return <div className="admin-container">Access denied.</div>;
  }

  if (!effectiveStudioId) {
    return (
      <div className="admin-container">
        <h1>SmugMug Import</h1>
        <div>
          <div style={{ marginBottom: 16 }}>
            <label>SmugMug Nickname</label>
            <input type="text" value={smugmugNickname} onChange={e => setSmugmugNickname(e.target.value)} />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label>API Key</label>
            <input type="text" value={smugmugApiKey} onChange={e => setSmugmugApiKey(e.target.value)} />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label>API Secret</label>
            <input type="password" value={smugmugApiSecret} onChange={e => setSmugmugApiSecret(e.target.value)} />
          </div>
          <button onClick={saveSmugmugConfig} disabled={smugmugSaving}>Save SmugMug Settings</button>
          <button onClick={startSmugmugOAuth} disabled={smugmugOAuthLoading || smugmugConnected} style={{ marginLeft: 12 }}>
            {smugmugOAuthLoading ? 'Connecting...' : smugmugConnected ? 'Connected' : 'Connect SmugMug'}
          </button>
          {smugmugOAuthError && <div style={{ color: 'red', marginTop: 8 }}>{smugmugOAuthError}</div>}
          {smugmugNotice && <div style={{ marginTop: 8 }}>{smugmugNotice}</div>}
        </div>
        <div
          style={{
            backgroundColor: 'rgba(59, 130, 246, 0.12)',
            border: '1px solid rgba(59, 130, 246, 0.4)',
            borderRadius: '8px',
            padding: '16px',
            color: '#bfdbfe',
          }}
        >
          Select a studio first (view-as-studio) to manage SmugMug imports.
        </div>
      </div>
    );
  }

  const content = (
    <>
      <h1>SmugMug Import</h1>
      <p style={{ color: 'var(--text-secondary)', marginBottom: '16px' }}>
        Connect your SmugMug account, load albums, then choose exactly which albums to import.
      </p>


      <div
        style={{
          backgroundColor: 'var(--bg-tertiary)',
          border: '1px solid var(--border-color)',
          borderRadius: '8px',
          padding: '16px',
          marginBottom: '24px',
        }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '12px' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '6px' }}>SmugMug Nickname</label>
            <input
              type="text"
              value={smugmugNickname}
              onChange={(e) => setSmugmugNickname(e.target.value)}
              placeholder="e.g. campeaphotography"
              style={{ width: '100%' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '6px' }}>API Key (optional for public albums)</label>
            <input
              type="text"
              value={smugmugApiKey}
              onChange={(e) => setSmugmugApiKey(e.target.value)}
              placeholder="SmugMug API Key"
              style={{ width: '100%' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '6px' }}>API Secret</label>
            <input
              type="password"
              value={smugmugApiSecret}
              onChange={(e) => setSmugmugApiSecret(e.target.value)}
              placeholder="SmugMug API Secret"
              style={{ width: '100%' }}
            />
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px', marginTop: '12px', flexWrap: 'wrap' }}>
          <button className="btn btn-secondary" onClick={saveSmugmugConfig} disabled={smugmugSaving}>
            {smugmugSaving ? 'Saving...' : 'Save SmugMug Settings'}
          </button>
          <button className="btn btn-primary" onClick={loadSmugmugAlbums} disabled={smugmugLoading || !smugmugNickname.trim()}>
            {smugmugLoading ? 'Loading Albums...' : 'Load SmugMug Albums'}
          </button>
          <button className="btn btn-success" onClick={importSelectedSmugmugAlbums} disabled={smugmugImporting || smugmugAlbums.length === 0}>
            {smugmugImporting ? 'Importing...' : 'Import Selected Albums'}
          </button>
          <button className="btn btn-primary" onClick={startSmugmugOAuth} disabled={smugmugOAuthLoading || smugmugConnected}>
            {smugmugOAuthLoading ? 'Connecting...' : smugmugConnected ? 'Connected' : 'Connect SmugMug'}
          </button>
        </div>

        {smugmugOAuthError && <div style={{ color: 'red', marginTop: 8 }}>{smugmugOAuthError}</div>}
        {smugmugNotice && <div style={{ marginTop: '10px', color: 'var(--text-secondary)' }}>{smugmugNotice}</div>}

        {storageMode === 'smugmug-source' && (
          <div
            style={{
              marginTop: '10px',
              padding: '10px 12px',
              borderRadius: '8px',
              border: '1px solid rgba(250, 204, 21, 0.4)',
              backgroundColor: 'rgba(250, 204, 21, 0.08)',
              color: '#fde68a',
              fontSize: '13px',
            }}
          >
            Azure storage is not configured here, so imported photos will use their original SmugMug source URLs.
          </div>
        )}

        {importProgress && (
          <div
            style={{
              marginTop: '16px',
              border: '1px solid var(--border-color)',
              borderRadius: '8px',
              padding: '14px',
              background: 'rgba(15, 23, 42, 0.35)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', marginBottom: '10px' }}>
              <div>
                <div style={{ fontWeight: 700 }}>Import Progress</div>
                <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                  {importProgress.currentAlbumName
                    ? `Currently importing ${importProgress.currentAlbumName}`
                    : importProgress.status === 'completed'
                    ? 'Import complete'
                    : importProgress.status === 'failed'
                    ? 'Import failed'
                    : 'Preparing import...'}
                </div>
              </div>
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                Albums {importProgress.totals.albumsCompleted}/{importProgress.totals.albumsTotal} • Photos {importProgress.totals.photosProcessed}/{importProgress.totals.photosTotal || '?'}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '12px', fontSize: '13px' }}>
              <span style={{ color: '#86efac' }}>Imported: {importProgress.totals.photosImported}</span>
              <span style={{ color: '#fcd34d' }}>Skipped: {importProgress.totals.photosSkipped}</span>
              <span style={{ color: '#fca5a5' }}>Failed: {importProgress.totals.photosFailed}</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 1fr) minmax(320px, 1.2fr)', gap: '12px' }}>
              <div style={{ border: '1px solid var(--border-color)', borderRadius: '8px', maxHeight: '240px', overflowY: 'auto' }}>
                {importProgress.albums.map((album) => (
                  <div key={album.albumKey} style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-color)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px' }}>
                      <strong>{album.name}</strong>
                      <span style={{ fontSize: '12px', color: 'var(--text-secondary)', textTransform: 'capitalize' }}>{album.status}</span>
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                      {album.photosProcessed}/{album.photosTotal || 0} processed • Imported {album.photosImported} • Skipped {album.photosSkipped} • Failed {album.photosFailed}
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ border: '1px solid var(--border-color)', borderRadius: '8px', maxHeight: '240px', overflowY: 'auto' }}>
                {importProgress.recentPhotos.length === 0 ? (
                  <div style={{ padding: '12px', color: 'var(--text-secondary)', fontSize: '13px' }}>
                    Photo progress will appear here as each image is imported.
                  </div>
                ) : (
                  importProgress.recentPhotos.map((photo, index) => (
                    <div key={`${photo.timestamp}-${photo.fileName}-${index}`} style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-color)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'center' }}>
                        <strong style={{ fontSize: '13px', wordBreak: 'break-word' }}>{photo.fileName}</strong>
                        <span
                          style={{
                            fontSize: '12px',
                            textTransform: 'capitalize',
                            color: photo.status === 'imported' ? '#86efac' : photo.status === 'skipped' ? '#fcd34d' : '#fca5a5',
                          }}
                        >
                          {photo.status}
                        </span>
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                        {photo.albumName}
                        {photo.detail ? ` • ${photo.detail}` : ''}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {importProgress.error && (
              <div style={{ marginTop: '10px', color: '#fca5a5', fontSize: '13px' }}>{importProgress.error}</div>
            )}
          </div>
        )}

        {smugmugAlbums.length > 0 && (
          <>
            <div style={{ marginTop: '12px', display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
              <button
                className="btn btn-secondary"
                onClick={handleSelectAllAlbums}
                disabled={allAlbumsSelected}
              >
                Select All
              </button>
              <button
                className="btn btn-secondary"
                onClick={handleClearAllAlbums}
                disabled={selectedAlbumCount === 0}
              >
                Clear All
              </button>
              <span style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
                {selectedAlbumCount} of {selectableAlbumCount} selectable selected
              </span>
            </div>

            <div style={{ marginTop: '10px', border: '1px solid var(--border-color)', borderRadius: '8px', maxHeight: '420px', overflowY: 'auto' }}>
            {smugmugAlbums.map((album) => (
              <label
                key={album.albumKey}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '10px 12px',
                  borderBottom: '1px solid var(--border-color)',
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={!!selectedSmugmugAlbums[album.albumKey]}
                  onChange={(e) => {
                    setSelectedSmugmugAlbums((prev) => ({
                      ...prev,
                      [album.albumKey]: e.target.checked,
                    }));
                  }}
                />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span>{album.name}</span>
                    {album.imported && (
                      <span
                        style={{
                          fontSize: '12px',
                          color: '#86efac',
                          border: '1px solid rgba(134, 239, 172, 0.5)',
                          borderRadius: '999px',
                          padding: '1px 8px',
                        }}
                      >
                        Imported
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                    {album.imageCount || 0} photos
                    {album.webUri ? ` • ${album.webUri}` : ''}
                  </div>
                  {album.imported && (
                    <div style={{ fontSize: '12px', color: '#93c5fd', marginTop: '2px' }}>
                      {album.localAlbumId ? `Local album #${album.localAlbumId}` : 'Local album linked'}
                      {album.importedAt ? ` • Imported ${new Date(album.importedAt).toLocaleString()}` : ''}
                    </div>
                  )}
                </div>
              </label>
            ))}
            </div>
          </>
        )}
      </div>
    </>
  );

  if (embedded) {
    return <div className="admin-page">{content}</div>;
  }

  return <AdminLayout>{content}</AdminLayout>;
};

export default AdminSmugMug;
