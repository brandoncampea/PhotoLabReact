export type UploadPanelFile = {
  id: string | number;
  name?: string;
  previewUrl: string;
  status: 'queued' | 'uploading' | 'done' | 'paused' | 'error' | string;
  progress: number;
  size?: number;
  file?: { name?: string; size?: number };
};

const UploadPhotoItem = ({ file }: { file: UploadPanelFile }) => {
  return (
    <div className="upload-photo-item" style={{ position: 'relative' }}>
      <img src={file.previewUrl} alt={file.name} style={{ width: '100%', height: 'auto', display: 'block', borderRadius: 8 }} />
      {file.status === 'uploading' && (
        <div className="progress-overlay" style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(0,0,0,0.35)',
          zIndex: 2,
        }}>
          <svg width="54" height="54" style={{ position: 'absolute' }}>
            <circle
              cx="27"
              cy="27"
              r="22"
              stroke="#4caf50"
              strokeWidth="4"
              fill="none"
              strokeDasharray={2 * Math.PI * 22}
              strokeDashoffset={2 * Math.PI * 22 * (1 - file.progress / 100)}
              style={{ transition: 'stroke-dashoffset 0.3s' }}
            />
            <circle
              cx="27"
              cy="27"
              r="22"
              stroke="#fff"
              strokeWidth="4"
              fill="none"
              opacity={0.15}
            />
          </svg>
          <span style={{
            position: 'absolute',
            color: '#fff',
            fontWeight: 700,
            fontSize: 18,
            zIndex: 3,
            textShadow: '0 1px 4px #000',
          }}>{Math.round(file.progress)}%</span>
        </div>
      )}
      {file.status === 'done' && <div className="checkmark-overlay">✔️</div>}
      {file.status === 'paused' && <div className="pause-overlay">⏸️</div>}
      {file.status === 'error' && <div className="error-overlay">❌</div>}
      <div className="file-info">
        <span>{file.file?.name || file.name}</span>
        <span style={{ display: 'inline-block', minWidth: 12 }} />
        <span>
          {typeof file.file?.size === 'number' ? (file.file.size / 1024 / 1024).toFixed(1) : typeof file.size === 'number' ? (file.size / 1024 / 1024).toFixed(1) : '?'} MB
        </span>
      </div>
    </div>
  );
};

export default UploadPhotoItem;
