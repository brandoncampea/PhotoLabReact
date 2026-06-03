import UploadPhotoItem, { UploadPanelFile } from './UploadPhotoItem';

type UploadPanelProps = {
  files: UploadPanelFile[];
  onCancel: () => void;
  overallProgress: number;
  visible: boolean;
};

const UploadPanel = ({ files, onCancel, overallProgress, visible }: UploadPanelProps) => {
  if (!visible) return null;
  const total = files.length;
  const done = files.filter((f) => f.status === 'done').length;
  const failed = files.filter((f) => f.status === 'error').length;
  const uploading = files.filter((f) => f.status === 'uploading').length;
  return (
    <div className="upload-panel">
      <div className="upload-header">
        <button className="upload-cancel-btn" onClick={onCancel}>Cancel</button>
        <span>Uploading {total} file{total > 1 ? 's' : ''}</span>
      </div>
      <div className="upload-grid">
        {files.map((file) => (
          <UploadPhotoItem key={file.id} file={file} />
        ))}
      </div>
      <div className="upload-progress-bar">
        <div className="upload-progress-bar-inner" style={{ width: `${overallProgress}%` }} />
        <span>
          Uploaded: {done} / {total} &nbsp;
          {failed > 0 && <span style={{ color: '#f44336' }}>Failed: {failed}</span>}
          {uploading > 0 && <span style={{ color: '#ffc107' }}> Uploading: {uploading}</span>}
        </span>
      </div>
    </div>
  );
};

export default UploadPanel;
