

import { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import AdminLayout from '../../components/AdminLayout';


// (Removed duplicate AdminSmugMug definition. All logic is now inside the single component below.)

interface SmugMugAlbumOption {
  albumKey: string;
  name: string;
  description?: string;
  imageCount?: number;
  webUri?: string;
  imported?: boolean;
  localAlbumId?: number | null;
  importedAt?: string | null;
  securityType?: string;
  passwordHint?: string | null;
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
  // OAuth state and handler must be defined here
  const [oauthRequired, setOauthRequired] = useState(false);
  const [smugmugConnected, setSmugmugConnected] = useState(false);
  const [showOAuthPrompt, setShowOAuthPrompt] = useState(false);
  const [oauthWindow, setOAuthWindow] = useState<Window | null>(null);
  const [pendingImport, setPendingImport] = useState<any>(null);

  const fetchOAuthStatus = async () => {
    try {
      const response = await fetch('/api/smugmug/admin/vendor-integrations', { headers: getAuthHeaders() });
      if (!response.ok) return;
      const data = await response.json();
      setSmugmugConnected(!!data.connected);
      setOauthRequired(!!data.oauthRequired);
      if (data.oauthRequired) {
        setSmugmugNotice(data.message || 'SmugMug connection required.');
      }
    } catch {
      // ignore
    }
  };


    useEffect(() => {
      fetchOAuthStatus();
      // eslint-disable-next-line
    }, [effectiveStudioId]);

    // Open SmugMug OAuth popup
    const handleConnectSmugMug = async (retryImport?: { albumsToImport: SmugMugAlbumOption[] }) => {
      setSmugmugNotice('Connecting to SmugMug...');
      try {
        const response = await fetch('/api/smugmug/oauth/request-token', {
          method: 'POST',
          headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ callbackUrl: window.location.origin + '/api/smugmug/oauth/callback' }),
        });
        if (!response.ok) throw new Error('Failed to start SmugMug OAuth');
        const data = await response.json();
        const popup = window.open(data.authorizeUrl, 'smugmug-oauth', 'width=600,height=700');
        setOAuthWindow(popup);
        setSmugmugNotice('Complete SmugMug authorization in the popup window.');
        // Listen for OAuth completion
        const timer = setInterval(async () => {
          if (popup && popup.closed) {
            clearInterval(timer);
            setOAuthWindow(null);
            await fetchOAuthStatus();
            await fetchSmugmugConfig();
            setShowOAuthPrompt(false);
            setSmugmugNotice('SmugMug authorization complete.');
            const importToRetry = retryImport || pendingImport;
            if (importToRetry) {
              setSmugmugNotice('SmugMug authorization complete. Retrying import...');
              importSelectedSmugmugAlbums(importToRetry);
              setPendingImport(null);
            }
          }
        }, 800);
      } catch (err: any) {
        setSmugmugNotice(err.message || 'Failed to connect to SmugMug');
      }
    };


  const [smugmugNickname, setSmugmugNickname] = useState('');
  const [smugmugAlbums, setSmugmugAlbums] = useState<SmugMugAlbumOption[]>([]);
  const [albumFilter, setAlbumFilter] = useState('');
  const [selectedSmugmugAlbums, setSelectedSmugmugAlbums] = useState<Record<string, boolean>>({});
  const [albumPasswords, setAlbumPasswords] = useState<Record<string, string>>({});
  const [smugmugLoading, setSmugmugLoading] = useState(false);
  const [smugmugImporting, setSmugmugImporting] = useState(false);
  const [smugmugNotice, setSmugmugNotice] = useState('');
  const [importProgress, setImportProgress] = useState<SmugMugImportProgress | null>(null);
  const [storageMode, setStorageMode] = useState<'azure' | 'smugmug-source'>('azure');

  const filteredAlbums = albumFilter.trim()
    ? smugmugAlbums.filter((a) => a.name.toLowerCase().includes(albumFilter.trim().toLowerCase()))
    : smugmugAlbums;

  const selectedAlbumCount = smugmugAlbums.reduce(
    (count, album) => count + (selectedSmugmugAlbums[album.albumKey] ? 1 : 0),
    0
  );
  const filteredSelectableCount = filteredAlbums.filter((a) => !a.imported).length;
  const filteredSelectedCount = filteredAlbums.reduce(
    (count, a) => count + (selectedSmugmugAlbums[a.albumKey] ? 1 : 0),
    0
  );
  const selectableAlbumCount = smugmugAlbums.filter((album) => !album.imported).length;
  const allAlbumsSelected = filteredSelectableCount > 0 && filteredSelectedCount === filteredSelectableCount;

  const getAuthHeaders = () => {
    const token = localStorage.getItem('authToken');
    const headers: Record<string, string> = {};
    if (token && token !== 'null' && token !== 'undefined') {
      headers.Authorization = `Bearer ${token}`;
    }
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
      setStorageMode(data.storageMode === 'smugmug-source' ? 'smugmug-source' : 'azure');
    } catch (err) {
      console.error('Failed to load SmugMug config:', err);
    }
  };

  useEffect(() => {
    fetchSmugmugConfig();
  }, [effectiveStudioId]);

  const loadSmugmugAlbums = async () => {
    setSmugmugLoading(true);
    setSmugmugNotice('');
    try {
      const response = await fetch(`/api/smugmug/albums`, {
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

  // Import albums, only use images with OriginalUrl. If missing, prompt for OAuth and retry.
  const importSelectedSmugmugAlbums = async (override?: any) => {
    const albumsToImport = override?.albumsToImport || smugmugAlbums.filter((album: SmugMugAlbumOption) => selectedSmugmugAlbums[album.albumKey]);
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
      albums: albumsToImport.map((album: SmugMugAlbumOption) => ({
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

    let pollInterval: number | null = null;

    try {
      const response = await fetch('/api/smugmug/import', {
        method: 'POST',
        headers: {
          ...getAuthHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jobId,
          albums: albumsToImport.map((album: SmugMugAlbumOption) => ({
            albumKey: album.albumKey,
            name: album.name,
            description: album.description,
          })),
          albumPasswords,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        const status = response.status;
        const errorText = String(data.error || data.details || '').toLowerCase();
        const oauthExpiredOrMissing = status === 401
          || /oauth|unauthorized|expired|invalid.*token|reconnect/i.test(errorText)
          || errorText.includes('originalurl');

        if (oauthExpiredOrMissing) {
          setShowOAuthPrompt(true);
          setPendingImport({ albumsToImport });
          setSmugmugNotice('SmugMug auth is missing/expired. Reconnecting and retrying import...');
          await handleConnectSmugMug({ albumsToImport });
          setSmugmugImporting(false);
          return;
        }
        throw new Error(data.error || 'SmugMug import failed');
      }

      const data = await response.json();
      if (data.storageMode) {
        setStorageMode(data.storageMode === 'smugmug-source' ? 'smugmug-source' : 'azure');
      }

      // Import runs in the background — poll until it reports completed or failed.
      let importedAlbumCount = 0;
      await new Promise<void>((resolve) => {
        let consecutiveFailures = 0;
        const MAX_FAILURES = 8; // ~20s of 502s before giving up

        const poll = async () => {
          try {
            const progressResponse = await fetch(`/api/smugmug/import-progress/${jobId}`, {
              headers: getAuthHeaders(),
            });
            if (!progressResponse.ok) {
              consecutiveFailures += 1;
              if (consecutiveFailures >= MAX_FAILURES) {
                if (pollInterval !== null) { window.clearInterval(pollInterval); pollInterval = null; }
                setSmugmugNotice('Server restarted during import. The import may still be running — reload the page to check status.');
                resolve();
              }
              return;
            }
            consecutiveFailures = 0;
            const progressData = await progressResponse.json();

            importedAlbumCount = progressData.totals?.albumsCompleted ?? importedAlbumCount;

            if (progressData.status === 'expired') {
              if (pollInterval !== null) { window.clearInterval(pollInterval); pollInterval = null; }
              setImportProgress((prev: any) => prev ? { ...prev, status: 'completed' } : null);
              resolve();
              return;
            }

            setStorageMode(progressData.storageMode === 'smugmug-source' ? 'smugmug-source' : 'azure');
            setImportProgress(progressData);

            if (progressData.status === 'completed' || progressData.status === 'failed') {
              if (pollInterval !== null) { window.clearInterval(pollInterval); pollInterval = null; }
              resolve();
            }
          } catch {
            consecutiveFailures += 1;
            if (consecutiveFailures >= MAX_FAILURES) {
              if (pollInterval !== null) { window.clearInterval(pollInterval); pollInterval = null; }
              setSmugmugNotice('Server restarted during import. The import may still be running — reload the page to check status.');
              resolve();
            }
          }
        };

        pollInterval = window.setInterval(poll, 2500);
        poll();
      });

      setSmugmugNotice(`Import completed. ${importedAlbumCount} album(s) processed.`);
      await loadSmugmugAlbums();
    } catch (err: any) {
      setSmugmugNotice(err.message || 'SmugMug import failed');
    } finally {
      if (pollInterval !== null) {
        window.clearInterval(pollInterval);
        pollInterval = null;
      }
      setSmugmugImporting(false);
    }
  };

  const retryIncompleteAlbums = () => {
    if (!importProgress) return;
    const incomplete = importProgress.albums
      .filter((a: any) => a.status !== 'completed')
      .map((a: any) => ({ albumKey: a.albumKey, name: a.name, description: '' }));
    if (!incomplete.length) return;
    importSelectedSmugmugAlbums({ albumsToImport: incomplete });
  };

  const handleSelectAllAlbums = () => {
    setSelectedSmugmugAlbums((prev) => {
      const next = { ...prev };
      filteredAlbums.forEach((album) => {
        if (!album.imported) next[album.albumKey] = true;
      });
      return next;
    });
  };

  const handleClearAllAlbums = () => {
    setSelectedSmugmugAlbums((prev) => {
      const next = { ...prev };
      filteredAlbums.forEach((album) => {
        next[album.albumKey] = false;
      });
      return next;
    });
  };

  if (user?.role !== 'studio_admin' && user?.role !== 'super_admin') {
    return <div className="admin-container">Access denied.</div>;
  }

  if (!effectiveStudioId) {
    return (
      <div className="admin-container">
        <h1>SmugMug Import</h1>
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
          display: 'inline-flex',
          alignItems: 'center',
          gap: '8px',
          marginBottom: '16px',
          padding: '8px 12px',
          borderRadius: '999px',
          border: `1px solid ${smugmugConnected ? 'rgba(134, 239, 172, 0.45)' : 'rgba(250, 204, 21, 0.4)'}`,
          backgroundColor: smugmugConnected ? 'rgba(134, 239, 172, 0.08)' : 'rgba(250, 204, 21, 0.08)',
          color: smugmugConnected ? '#86efac' : '#fde68a',
          fontSize: '13px',
          fontWeight: 600,
        }}
      >
        {smugmugConnected ? 'SmugMug connected' : 'SmugMug not connected'}
      </div>

      {oauthRequired && (
        <div style={{
          backgroundColor: 'rgba(250, 204, 21, 0.08)',
          border: '1px solid #fcd34d',
          borderRadius: '8px',
          padding: '18px',
          marginBottom: '24px',
          color: '#fcd34d',
          fontWeight: 500,
          fontSize: '16px',
        }}>
          <div style={{ marginBottom: '10px' }}>No valid SmugMug OAuth token found. Please connect your SmugMug account to continue.</div>
          <button className="btn btn-info" onClick={() => { void handleConnectSmugMug(); }} disabled={!!oauthWindow}>
            Connect SmugMug
          </button>
        </div>
      )}

      <div
        style={{
          backgroundColor: 'var(--bg-tertiary)',
          border: '1px solid var(--border-color)',
          borderRadius: '8px',
          padding: '16px',
          marginBottom: '24px',
        }}
      >
        {smugmugNickname && (
          <div style={{ marginBottom: '12px', color: 'var(--text-secondary)', fontSize: '13px' }}>
            Connected as: <strong style={{ color: 'var(--text-primary)' }}>{smugmugNickname}</strong>
          </div>
        )}

        <div style={{ display: 'flex', gap: '10px', marginTop: '4px', flexWrap: 'wrap' }}>
          <button className="btn btn-primary" onClick={loadSmugmugAlbums} disabled={smugmugLoading || oauthRequired}>
            {smugmugLoading ? 'Loading Albums...' : 'Load SmugMug Albums'}
          </button>
          <button className="btn btn-success" onClick={() => importSelectedSmugmugAlbums()} disabled={smugmugImporting || smugmugAlbums.length === 0 || oauthRequired}>
            {smugmugImporting ? 'Importing...' : 'Import Selected Albums'}
          </button>
          {!oauthRequired && (
            <button className="btn btn-info" onClick={() => { void handleConnectSmugMug(); }} disabled={!!oauthWindow}>
              Connect SmugMug
            </button>
          )}
        </div>
        {showOAuthPrompt && (
          <div style={{ marginTop: '10px', color: '#fcd34d', fontWeight: 500 }}>
            Some images are missing OriginalUrl. <button className="btn btn-info" onClick={() => { void handleConnectSmugMug(); }}>Connect SmugMug</button>
          </div>
        )}

        {smugmugNotice && (
          <div style={{ marginTop: '10px', color: 'var(--text-secondary)' }}>{smugmugNotice}</div>
        )}

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

            {(importProgress.status === 'failed' || importProgress.status === 'completed') &&
              importProgress.albums.some((a: any) => a.status !== 'completed') && (
              <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '13px', color: '#fcd34d' }}>
                  {importProgress.albums.filter((a: any) => a.status !== 'completed').length} album(s) incomplete.
                  Already-imported photos will be skipped automatically.
                </span>
                <button
                  onClick={retryIncompleteAlbums}
                  disabled={smugmugImporting}
                  style={{
                    padding: '5px 14px', borderRadius: 7, border: '1px solid rgba(251,191,36,0.4)',
                    background: 'rgba(251,191,36,0.1)', color: '#fbbf24', fontSize: '13px',
                    fontWeight: 600, cursor: smugmugImporting ? 'not-allowed' : 'pointer',
                  }}
                >
                  ↩ Retry Incomplete
                </button>
              </div>
            )}
          </div>
        )}

        {smugmugAlbums.length > 0 && (
          <>
            <div style={{ marginTop: '12px', display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                type="text"
                placeholder="Filter albums by name…"
                value={albumFilter}
                onChange={(e) => setAlbumFilter(e.target.value)}
                style={{
                  flex: '1 1 220px',
                  padding: '7px 12px',
                  borderRadius: 8,
                  border: '1.5px solid var(--border-color)',
                  background: 'rgba(22,22,35,0.9)',
                  color: '#e4e4e7',
                  fontSize: '0.875rem',
                  outline: 'none',
                }}
              />
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
                disabled={filteredSelectedCount === 0}
              >
                Clear All
              </button>
              <span style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
                {selectedAlbumCount} of {selectableAlbumCount} selected
                {albumFilter.trim() ? ` (${filteredAlbums.length} shown)` : ''}
              </span>
            </div>

            <div style={{ marginTop: '10px', border: '1px solid var(--border-color)', borderRadius: '8px', maxHeight: '420px', overflowY: 'auto' }}>
            {filteredAlbums.length === 0 ? (
              <div style={{ padding: '16px 12px', color: 'var(--text-secondary)', fontSize: '14px' }}>
                No albums match "{albumFilter}".
              </div>
            ) : filteredAlbums.map((album) => (
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
                    {album.securityType === 'Password' && (
                      <span title={album.passwordHint ? `Hint: ${album.passwordHint}` : 'Password protected'} style={{ fontSize: '13px', opacity: 0.7 }}>🔒</span>
                    )}
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
                  {album.securityType === 'Password' && selectedSmugmugAlbums[album.albumKey] && (
                    <form style={{ marginTop: '6px' }} onSubmit={(e) => e.preventDefault()} onClick={(e) => e.preventDefault()}>
                      <input
                        type="password"
                        autoComplete="new-password"
                        placeholder={album.passwordHint ? `Password (hint: ${album.passwordHint})` : 'Album password'}
                        value={albumPasswords[album.albumKey] || ''}
                        onChange={(e) => setAlbumPasswords((prev) => ({ ...prev, [album.albumKey]: e.target.value }))}
                        style={{
                          fontSize: '13px',
                          padding: '4px 8px',
                          borderRadius: '5px',
                          border: '1px solid var(--border-color)',
                          background: 'var(--input-bg, #1a1a2a)',
                          color: 'var(--text-primary)',
                          width: '200px',
                        }}
                      />
                    </form>
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
