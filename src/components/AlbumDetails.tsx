
import { useParams } from 'react-router-dom';

const AlbumDetails = () => {
  const { albumId } = useParams();
  return (
    <div className="album-details-page">
      <h1>Album Details</h1>
      <div>Album ID: {albumId}</div>
      {/* Render album photos, info, etc. */}
    </div>
  );
};

export default AlbumDetails;
