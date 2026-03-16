import { useEffect, useState } from 'react';
import '../App.css';
import '../AdminStyles.css';
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
    return (
      <div className="gallery-loading dark-bg">
        <div className="loader" />
        <span>Loading studio...</span>
      </div>
    );
  }

  if (error || !studio) {
    return (
      <div className="gallery-error dark-bg">
        <span>{error || 'Studio not found'}</span>
      </div>
    );
  }

  return (
    <div className="gallery-page dark-bg">
      <header className="gallery-header">
        <h1 className="gallery-title">{studio.name}</h1>
        <p className="gallery-subtitle">Welcome! Browse available albums and open any gallery.</p>
      </header>

      <section className="gallery-albums">
        {albums.length === 0 ? (
          <div className="gallery-empty">
            <span>No albums available yet.</span>
          </div>
        ) : (
          <div className="gallery-grid">
            {albums.map((album) => (
              <Link
                to={`/s/${studio.publicSlug}/albums/${album.id}`}
                key={album.id}
                className="gallery-card dark-card"
              >
                <div className="gallery-card-info">
                  <h3 className="gallery-card-title">{album.name}</h3>
                  <p className="gallery-card-desc">{album.description || 'No description'}</p>
                  <div className="gallery-card-meta">
                    <span className="gallery-card-count">{album.photoCount || 0} photos</span>
                    <span className="gallery-card-date">{new Date(album.createdDate).toLocaleDateString()}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
