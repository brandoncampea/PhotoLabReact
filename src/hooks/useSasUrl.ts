import { useEffect, useState } from 'react';

/**
 * useSasUrl - React hook to fetch a SAS URL for a given blob name from the backend.
 * @param blobName The blob name or path (e.g. 'photos/123.jpg')
 * @returns {string | null} The SAS URL, or null if loading or error.
 */
export function useSasUrl(blobName?: string | null): string | null {
  const [sasUrl, setSasUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!blobName) {
      setSasUrl(null);
      return;
    }
    let cancelled = false;
    setSasUrl(null);
    fetch(`/api/blob-sas?blobName=${encodeURIComponent(blobName)}`)
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch SAS URL');
        return res.json();
      })
      .then(data => {
        if (!cancelled && data?.sasUrl) setSasUrl(data.sasUrl);
      })
      .catch(() => {
        if (!cancelled) setSasUrl(null);
      });
    return () => { cancelled = true; };
  }, [blobName]);

  return sasUrl;
}
