
function AlbumSasCover({ albumId, alt }: { albumId: number, alt: string }) {
  // Always use asset endpoint for album covers
  const assetUrl = `/api/photos/${albumId}/asset?variant=thumbnail`;
  return <img src={assetUrl} alt={alt} />;
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
            <AlbumSasCover albumId={album.id} alt={album.name} />
            <div>{album.name}</div>
          </a>
        ))}
      </div>
    </div>
  );
};

export default Albums;
