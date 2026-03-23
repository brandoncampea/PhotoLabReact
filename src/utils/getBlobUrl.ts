// Utility to resolve Azure Blob Storage URLs for images/assets
export function getBlobUrl(path: string) {
  if (!path) return '';
  if (path.startsWith('http')) return path;
  const base = import.meta.env.VITE_AZURE_BLOB_BASE_URL;
  return base ? `${base.replace(/\/$/, '')}/${path.replace(/^\//, '')}` : path;
}
