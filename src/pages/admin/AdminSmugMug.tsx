

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
  const [showOAuthPrompt, setShowOAuthPrompt] = useState(false);
  const [oauthWindow, setOAuthWindow] = useState<Window | null>(null);
  const [pendingImport, setPendingImport] = useState<any>(null);


    useEffect(() => {
      const checkOAuthStatus = async () => {
        try {
          const response = await fetch('/api/smugmug/admin/vendor-integrations', { headers: getAuthHeaders() });
          if (!response.ok) return;
          const data = await response.json();
          setOauthRequired(!!data.oauthRequired);
          if (data.oauthRequired) setSmugmugNotice(data.message || 'SmugMug connection required.');
        } catch (err) {
          // ignore
        }
      };
      checkOAuthStatus();
      // eslint-disable-next-line
    }, [effectiveStudioId]);

    // Open SmugMug OAuth popup
    const handleConnectSmugMug = async () => {
      setSmugmugNotice('Connecting to SmugMug...');
      try {
        const response = await fetch('/api/smugmug/oauth/request-token', {
          method: 'POST',
          headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ callbackUrl: window.location.origin + '/admin/smugmug' }),
        });
        if (!response.ok) throw new Error('Failed to start SmugMug OAuth');
        const data = await response.json();
        const popup = window.open(data.authorizeUrl, 'smugmug-oauth', 'width=600,height=700');
        setOAuthWindow(popup);
        setSmugmugNotice('Complete SmugMug authorization in the popup window.');
        // Listen for OAuth completion
        const timer = setInterval(() => {
          if (popup && popup.closed) {
            clearInterval(timer);
            setOAuthWindow(null);
            setSmugmugNotice('SmugMug authorization complete. Retrying import...');
            if (pendingImport) {
              importSelectedSmugmugAlbums(pendingImport);
              setPendingImport(null);
            }
          }
        }, 800);
      } catch (err: any) {
        setSmugmugNotice(err.message || 'Failed to connect to SmugMug');
      }
    };


  const [smugmugNickname, setSmugmugNickname] = useState('');
  const [smugmugApiKey, setSmugmugApiKey] = useState('');
  const [smugmugApiSecret, setSmugmugApiSecret] = useState('');
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
          albums: albumsToImport.map((album: SmugMugAlbumOption) => ({
            albumKey: album.albumKey,
            name: album.name,
            description: album.description,
          })),
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        // If error is about missing OriginalUrl, prompt for OAuth
        if (data.error && data.error.toLowerCase().includes('originalurl')) {
          setShowOAuthPrompt(true);
          setPendingImport({ albumsToImport });
          setSmugmugNotice('Some images are missing OriginalUrl. Please connect SmugMug to continue.');
          setSmugmugImporting(false);
          return;
        }
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
    setSelectedSmugmugAlbums(next);
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
          <button className="btn btn-info" onClick={handleConnectSmugMug} disabled={!!oauthWindow}>
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
              type="text"
              value={smugmugApiSecret}
              onChange={(e) => setSmugmugApiSecret(e.target.value)}
              placeholder="SmugMug API Secret"
              style={{ width: '100%' }}
            />
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px', marginTop: '12px', flexWrap: 'wrap' }}>
          <button className="btn btn-secondary" onClick={saveSmugmugConfig} disabled={smugmugSaving || oauthRequired}>
            {smugmugSaving ? 'Saving...' : 'Save SmugMug Settings'}
          </button>
          <button className="btn btn-primary" onClick={loadSmugmugAlbums} disabled={smugmugLoading || !smugmugNickname.trim() || oauthRequired}>
            {smugmugLoading ? 'Loading Albums...' : 'Load SmugMug Albums'}
          </button>
          <button className="btn btn-success" onClick={() => importSelectedSmugmugAlbums()} disabled={smugmugImporting || smugmugAlbums.length === 0 || oauthRequired}>
            {smugmugImporting ? 'Importing...' : 'Import Selected Albums'}
          </button>
          {!oauthRequired && (
            <button className="btn btn-info" onClick={handleConnectSmugMug} disabled={!!oauthWindow}>
              Connect SmugMug
            </button>
          )}
        </div>
        {showOAuthPrompt && (
          <div style={{ marginTop: '10px', color: '#fcd34d', fontWeight: 500 }}>
            Some images are missing OriginalUrl. <button className="btn btn-info" onClick={handleConnectSmugMug}>Connect SmugMug</button>
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
