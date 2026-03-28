import { useSasUrl } from '../hooks/useSasUrl';
function AlbumSasCover({ src, alt }: { src: string, alt: string }) {
  const isAzureBlob = src && !src.startsWith('http://') && !src.startsWith('https://picsum.photos');
  const sasUrl = useSasUrl(isAzureBlob ? src : undefined);
  return <img src={sasUrl || src} alt={alt} />;
}

import { useNavigate } from 'react-router-dom';

// Example albums array; in real usage, covers may be Azure blobs
const albums = [
  { id: 1, name: 'NWC Girls', cover: 'https://picsum.photos/seed/album1/400/300' },
  { id: 2, name: 'Soccer Team', cover: 'https://picsum.photos/seed/album2/400/300' },
];

const Albums = () => {
  const navigate = useNavigate();
  return (
    <div className="albums-page">
      <h1>Albums</h1>
      <div className="albums-list">
        {albums.map(album => (
          <a
            key={album.id}
            href={`/albums/${album.id}`}
            className="album-card"
            data-testid={`album-card-${album.id}`}
            onClick={e => {
              e.preventDefault();
              navigate(`/albums/${album.id}`);
            }}
          >
            <AlbumSasCover src={album.cover} alt={album.name} />
            <div>{album.name}</div>
          </a>
        ))}
      </div>
    </div>
  );
};

export default Albums;
