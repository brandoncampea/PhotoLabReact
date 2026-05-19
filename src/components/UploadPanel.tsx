import React from 'react';
import UploadPhotoItem from './UploadPhotoItem';

const UploadPanel = ({ files, onCancel, overallProgress, visible }) => {
  if (!visible) return null;
  return (
    <div className="upload-panel">
      <div className="upload-header">
        <button className="upload-cancel-btn" onClick={onCancel}>Cancel</button>
        <span>Uploading {files.length} file{files.length > 1 ? 's' : ''}</span>
      </div>
      <div className="upload-grid">
        {files.map(file => (
          <UploadPhotoItem key={file.id} file={file} />
        ))}
      </div>
      <div className="upload-progress-bar">
        <div className="upload-progress-bar-inner" style={{ width: `${overallProgress}%` }} />
        <span>
          Uploading: {files.filter(f => f.status === 'done').length} of {files.length} files uploaded
        </span>
      </div>
    </div>
  );
};

export default UploadPanel;
