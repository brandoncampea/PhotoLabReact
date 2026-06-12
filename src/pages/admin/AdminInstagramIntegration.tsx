import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';

interface InstagramIntegrationRow {
  id: number;
  studioId: number;
  provider: string;
  instagramUserId?: string | null;
  facebookPageId?: string | null;
  tokenExpiresAt?: string | null;
  status?: string | null;
  connectedAt?: string | null;
  lastSyncedAt?: string | null;
  lastError?: string | null;
  updatedAt?: string | null;
}

interface InstagramStatusResponse {
  connected: boolean;
  integration: InstagramIntegrationRow | null;
}

interface PublishJob {
  id: number;
  status: string;
  caption?: string | null;
  providerPermalink?: string | null;
  errorMessage?: string | null;
  requestedAt?: string | null;
  updatedAt?: string | null;
}

interface PublishJobItem {
  id: number;
  sortOrder: number;
  sourceUrl?: string | null;
  status: string;
  errorMessage?: string | null;
}

const AdminInstagramIntegration: React.FC<{ embedded?: boolean }> = () => {
  const { user } = useAuth();
  const effectiveStudioId = Number(localStorage.getItem('viewAsStudioId')) || user?.studioId;

  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<InstagramStatusResponse | null>(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const [caption, setCaption] = useState('');
  const [sourceUrlsText, setSourceUrlsText] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [publishJob, setPublishJob] = useState<PublishJob | null>(null);
  const [publishItems, setPublishItems] = useState<PublishJobItem[]>([]);

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

  const maxItems = Number(import.meta.env.VITE_INSTAGRAM_MAX_CAROUSEL_ITEMS || 20);

  const sourceUrls = useMemo(
    () => sourceUrlsText.split('\n').map((line) => line.trim()).filter(Boolean),
    [sourceUrlsText]
  );

  const loadStatus = async () => {
    if (!effectiveStudioId) {
      return;
    }
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ studioId: String(effectiveStudioId) });
      const response = await fetch(`/api/instagram/status?${params.toString()}`, { headers: getAuthHeaders() });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to load Instagram status');
      }
      setStatus(payload as InstagramStatusResponse);
    } catch (err: any) {
      setError(err?.message || 'Failed to load Instagram status');
    } finally {
      setLoading(false);
    }
  };

  const loadJob = async (jobId: number) => {
    if (!effectiveStudioId || !jobId) {
      return;
    }
    try {
      const params = new URLSearchParams({ studioId: String(effectiveStudioId) });
      const response = await fetch(`/api/instagram/publish/${jobId}?${params.toString()}`, { headers: getAuthHeaders() });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to load publish job');
      }
      setPublishJob(payload.job || null);
      setPublishItems(Array.isArray(payload.items) ? payload.items : []);
    } catch (err: any) {
      setError(err?.message || 'Failed to load publish job');
    }
  };

  useEffect(() => {
    loadStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveStudioId]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const data = event?.data;
      if (!data || data.type !== 'instagram-oauth-result') {
        return;
      }

      if (data.success) {
        setNotice(data.message || 'Instagram connected successfully.');
        setError('');
      } else {
        setError(data.message || 'Instagram connection failed.');
      }
      loadStatus();
    };

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveStudioId]);

  useEffect(() => {
    if (!publishJob?.id) {
      return;
    }
    const terminal = ['completed', 'failed', 'cancelled'];
    if (terminal.includes(String(publishJob.status || '').toLowerCase())) {
      return;
    }

    const timer = window.setInterval(() => {
      loadJob(publishJob.id);
    }, 2500);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publishJob?.id, publishJob?.status]);

  const handleConnect = async () => {
    if (!effectiveStudioId) {
      setError('Select a studio first (view-as-studio) to connect Instagram.');
      return;
    }

    setConnecting(true);
    setError('');
    setNotice('');
    try {
      const params = new URLSearchParams({ studioId: String(effectiveStudioId) });
      const response = await fetch(`/api/instagram/connect/start?${params.toString()}`, { headers: getAuthHeaders() });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.authUrl) {
        throw new Error(payload?.error || 'Failed to initialize Instagram connect');
      }

      const popup = window.open(payload.authUrl, 'instagram-oauth', 'width=720,height=760');
      if (!popup) {
        throw new Error('Popup blocked. Please allow popups and try again.');
      }

      setNotice('Complete Instagram authorization in the popup window.');
      const watchTimer = window.setInterval(() => {
        if (popup.closed) {
          window.clearInterval(watchTimer);
          loadStatus();
          setNotice('Instagram authorization flow ended. Status refreshed.');
        }
      }, 900);
    } catch (err: any) {
      setError(err?.message || 'Failed to connect Instagram');
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!effectiveStudioId) {
      setError('Select a studio first (view-as-studio) to disconnect Instagram.');
      return;
    }

    setDisconnecting(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/instagram/disconnect', {
        method: 'POST',
        headers: {
          ...getAuthHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ studioId: effectiveStudioId }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to disconnect Instagram');
      }
      setNotice('Instagram has been disconnected for this studio.');
      await loadStatus();
    } catch (err: any) {
      setError(err?.message || 'Failed to disconnect Instagram');
    } finally {
      setDisconnecting(false);
    }
  };

  const handleQueuePublish = async () => {
    if (!effectiveStudioId) {
      setError('Select a studio first (view-as-studio) to queue a publish job.');
      return;
    }
    if (!sourceUrls.length) {
      setError('Add at least one image URL.');
      return;
    }
    if (sourceUrls.length > maxItems) {
      setError(`Maximum ${maxItems} items allowed.`);
      return;
    }

    setPublishing(true);
    setError('');
    setNotice('');

    try {
      const items = sourceUrls.map((sourceUrl) => ({ sourceUrl }));
      const response = await fetch('/api/instagram/publish', {
        method: 'POST',
        headers: {
          ...getAuthHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          studioId: effectiveStudioId,
          caption,
          items,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to queue publish job');
      }

      const jobId = Number(payload?.jobId || 0);
      if (!jobId) {
        throw new Error('Publish job queued, but no job id was returned');
      }

      setNotice(`Publish job queued: #${jobId}`);
      await loadJob(jobId);
    } catch (err: any) {
      setError(err?.message || 'Failed to queue publish job');
    } finally {
      setPublishing(false);
    }
  };

  const handleProcessJob = async () => {
    if (!effectiveStudioId || !publishJob?.id) {
      return;
    }
    setProcessing(true);
    setError('');
    setNotice('');
    try {
      const params = new URLSearchParams({ studioId: String(effectiveStudioId) });
      const response = await fetch(`/api/instagram/publish/${publishJob.id}/process?${params.toString()}`, {
        method: 'POST',
        headers: {
          ...getAuthHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ studioId: effectiveStudioId }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || payload?.details || 'Failed to process publish job');
      }
      setNotice(`Publish job #${publishJob.id} processed.`);
      await loadJob(publishJob.id);
    } catch (err: any) {
      setError(err?.message || 'Failed to process publish job');
      if (publishJob?.id) {
        await loadJob(publishJob.id);
      }
    } finally {
      setProcessing(false);
    }
  };

  const connected = !!status?.connected;

  if (!effectiveStudioId) {
    return (
      <div className="admin-instagram-card admin-instagram-empty">
        Select a studio first (view-as-studio) to manage Instagram integration.
      </div>
    );
  }

  return (
    <div className="admin-instagram-wrap">
      <h2 className="admin-instagram-title">Instagram Integration</h2>
      <p className="admin-instagram-subtitle">
        Connect a studio Instagram Business account, then queue publish jobs.
      </p>

      <div className="admin-instagram-card">
        <div className="admin-instagram-status-row">
          <span className={`admin-instagram-pill ${connected ? 'connected' : 'disconnected'}`}>
            {connected ? 'Connected' : 'Disconnected'}
          </span>
          <div className="admin-instagram-actions">
            <button className="admin-tab-button" onClick={loadStatus} type="button" disabled={loading}>
              {loading ? 'Refreshing...' : 'Refresh'}
            </button>
            <button className="admin-tab-button" onClick={handleConnect} type="button" disabled={connecting}>
              {connecting ? 'Connecting...' : 'Connect'}
            </button>
            <button
              className="admin-tab-button"
              onClick={handleDisconnect}
              type="button"
              disabled={!connected || disconnecting}
            >
              {disconnecting ? 'Disconnecting...' : 'Disconnect'}
            </button>
          </div>
        </div>

        {status?.integration && (
          <div className="admin-instagram-grid">
            <div><strong>Studio:</strong> {status.integration.studioId}</div>
            <div><strong>IG User ID:</strong> {status.integration.instagramUserId || '—'}</div>
            <div><strong>Facebook Page ID:</strong> {status.integration.facebookPageId || '—'}</div>
            <div><strong>Token Expires:</strong> {status.integration.tokenExpiresAt || '—'}</div>
            <div><strong>Last Sync:</strong> {status.integration.lastSyncedAt || '—'}</div>
            <div><strong>Updated:</strong> {status.integration.updatedAt || '—'}</div>
          </div>
        )}

        {!!status?.integration?.lastError && (
          <div className="admin-instagram-error-box">{status.integration.lastError}</div>
        )}
      </div>

      <div className="admin-instagram-card">
        <h3>Queue Publish Job</h3>
        <p className="admin-instagram-subtitle">
          Enter up to {maxItems} image URLs (one per line). Job execution is queued and can be monitored below.
        </p>

        <label className="admin-instagram-label" htmlFor="ig-caption">Caption</label>
        <textarea
          id="ig-caption"
          className="admin-instagram-textarea"
          rows={4}
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          placeholder="Write your Instagram caption..."
        />

        <label className="admin-instagram-label" htmlFor="ig-urls">Image URLs (one per line)</label>
        <textarea
          id="ig-urls"
          className="admin-instagram-textarea"
          rows={6}
          value={sourceUrlsText}
          onChange={(e) => setSourceUrlsText(e.target.value)}
          placeholder="https://.../photo1.jpg\nhttps://.../photo2.jpg"
        />

        <div className="admin-instagram-actions">
          <button className="admin-tab-button" type="button" onClick={handleQueuePublish} disabled={publishing || !connected}>
            {publishing ? 'Queueing...' : 'Queue Publish'}
          </button>
          <span className="admin-instagram-subtitle">{sourceUrls.length} item(s) ready</span>
        </div>
      </div>

      {publishJob && (
        <div className="admin-instagram-card">
          <h3>Latest Publish Job #{publishJob.id}</h3>
          <div className="admin-instagram-actions">
            <button
              className="admin-tab-button"
              type="button"
              onClick={handleProcessJob}
              disabled={processing || ['completed', 'cancelled'].includes(String(publishJob.status || '').toLowerCase())}
            >
              {processing ? 'Processing...' : 'Process Now'}
            </button>
            <button className="admin-tab-button" type="button" onClick={() => loadJob(publishJob.id)}>
              Refresh Job
            </button>
          </div>
          <div className="admin-instagram-grid">
            <div><strong>Status:</strong> {publishJob.status}</div>
            <div><strong>Requested:</strong> {publishJob.requestedAt || '—'}</div>
            <div><strong>Updated:</strong> {publishJob.updatedAt || '—'}</div>
            <div><strong>Permalink:</strong> {publishJob.providerPermalink || '—'}</div>
          </div>
          {!!publishJob.errorMessage && <div className="admin-instagram-error-box">{publishJob.errorMessage}</div>}

          <div className="admin-instagram-job-items">
            {publishItems.map((item) => (
              <div key={item.id} className="admin-instagram-job-item">
                <div>#{item.sortOrder}</div>
                <div>{item.status}</div>
                <div className="admin-instagram-ellipsis">{item.sourceUrl || '—'}</div>
                <div className="admin-instagram-ellipsis">{item.errorMessage || ''}</div>
              </div>
            ))}
            {!publishItems.length && <div className="admin-instagram-subtitle">No items recorded yet.</div>}
          </div>
        </div>
      )}

      {!!notice && <div className="admin-instagram-notice">{notice}</div>}
      {!!error && <div className="admin-instagram-error-box">{error}</div>}
    </div>
  );
};

export default AdminInstagramIntegration;
