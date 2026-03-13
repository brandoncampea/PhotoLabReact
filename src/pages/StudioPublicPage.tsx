import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

type PublicStudio = {
  id: number;
  name: string;
  email?: string;
  publicSlug: string;
};

type PublicAlbum = {
  id: number;
  name: string;
  description?: string;
  photoCount?: number;
  createdDate: string;
};

export default function StudioPublicPage() {
  const { slug } = useParams<{ slug: string }>();
  const [studio, setStudio] = useState<PublicStudio | null>(null);
  const [albums, setAlbums] = useState<PublicAlbum[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const loadPublicStudio = async () => {
      if (!slug) return;
      setLoading(true);
      try {
        const [studioRes, albumsRes] = await Promise.all([
          fetch(`/api/studios/public/${encodeURIComponent(slug)}`),
          fetch(`/api/albums?studioSlug=${encodeURIComponent(slug)}`),
        ]);

        if (!studioRes.ok) {
          throw new Error('Studio not found');
        }

        const studioData = await studioRes.json();
        const albumsData = albumsRes.ok ? await albumsRes.json() : [];

        setStudio(studioData);
        setAlbums(Array.isArray(albumsData) ? albumsData : []);
        setError('');
      } catch (err: any) {
        setError(err.message || 'Failed to load studio');
      } finally {
        setLoading(false);
      }
    };

    loadPublicStudio();
  }, [slug]);

  if (loading) {
    return <div className="loading">Loading studio...</div>;
  }

  if (error || !studio) {
    return <div className="error-message">{error || 'Studio not found'}</div>;
  }

  return (
    <div className="page-container">
      <div className="page-title">
        <h1>{studio.name}</h1>
        <p>Welcome! Browse available albums and open any gallery.</p>
      </div>

      <div className="albums-grid">
        {albums.length === 0 ? (
          <p className="empty-state">No albums available yet.</p>
        ) : (
          albums.map((album) => (
            <Link to={`/s/${studio.publicSlug}/albums/${album.id}`} key={album.id} className="album-card">
              <div className="album-info" style={{ width: '100%' }}>
                <h3>{album.name}</h3>
                <p>{album.description || 'No description'}</p>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.75rem' }}>
                  <span className="photo-count">{album.photoCount || 0} photos</span>
                  <span className="album-date">{new Date(album.createdDate).toLocaleDateString()}</span>
                </div>
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
