import React, { useState } from 'react';
import AdminLayout from '../../components/AdminLayout';

// Example style options; in a real app, fetch from API or config
const COVER_TYPES = ['Leather', 'Linen', 'Photo Wrap'];
const PAPER_TYPES = ['Matte', 'Glossy', 'Lustre'];
const SIZES = ['8x8', '10x10', '12x12'];

const StudioAlbumStyles: React.FC = () => {
  const [coverType, setCoverType] = useState<string[]>([]);
  const [paperType, setPaperType] = useState<string[]>([]);
  const [size, setSize] = useState<string[]>([]);
  const [message, setMessage] = useState('');

  const handleCheckbox = (setter: React.Dispatch<React.SetStateAction<string[]>>, value: string, checked: boolean) => {
    setter(prev => checked ? [...prev, value] : prev.filter(v => v !== value));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Simulate API call to save styles
    setMessage('Album styles saved for your studio!');
    setTimeout(() => setMessage(''), 2000);
  };

  return (
    <AdminLayout>
      <div className="admin-form">
        <h1>Studio Album Styles</h1>
        <form className="form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Cover Types</label>
            <div className="checkbox-group">
              {COVER_TYPES.map(type => (
                <label key={type} className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={coverType.includes(type)}
                    onChange={e => handleCheckbox(setCoverType, type, e.target.checked)}
                  />
                  {type}
                </label>
              ))}
            </div>
          </div>
          <div className="form-group">
            <label>Paper Types</label>
            <div className="checkbox-group">
              {PAPER_TYPES.map(type => (
                <label key={type} className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={paperType.includes(type)}
                    onChange={e => handleCheckbox(setPaperType, type, e.target.checked)}
                  />
                  {type}
                </label>
              ))}
            </div>
          </div>
          <div className="form-group">
            <label>Album Sizes</label>
            <div className="checkbox-group">
              {SIZES.map(type => (
                <label key={type} className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={size.includes(type)}
                    onChange={e => handleCheckbox(setSize, type, e.target.checked)}
                  />
                  {type}
                </label>
              ))}
            </div>
          </div>
          <button type="submit" className="btn btn-primary">Save Styles</button>
        </form>
        {message && <div className="success-message">{message}</div>}
      </div>
    </AdminLayout>
  );
};

export default StudioAlbumStyles;
