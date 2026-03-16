import { useEffect, useState } from 'react';
import '../App.css';
import '../AdminStyles.css';
import TopNavbar from '../components/TopNavbar';

export default function LandingPage() {
  const [backendInfo, setBackendInfo] = useState<{ version?: string; status?: string; features?: string[] }>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function fetchBackendInfo() {
      setLoading(true);
      setError('');
      try {
        const res = await fetch('/api/info');
        if (!res.ok) throw new Error('Failed to fetch backend info');
        const data = await res.json();
        setBackendInfo(data);
      } catch (err) {
        setError('Unable to connect to backend.');
      } finally {
        setLoading(false);
      }
    }
    fetchBackendInfo();
  }, []);

  return (
    <>
      <TopNavbar />
      <div className="main-content dark-bg" style={{ minHeight: 'calc(100vh - 80px)' }}>
        <h1 className="landing-title">Welcome to PhotoLab</h1>
        <div className="backend-status" style={{ marginBottom: '1.5rem', textAlign: 'center' }}>
          {loading ? (
            <span style={{ color: '#7c5cff' }}>Checking backend status...</span>
          ) : error ? (
            <span style={{ color: '#ff6b35' }}>{error}</span>
          ) : (
            <>
              <span style={{ color: '#4caf50', fontWeight: 600 }}>Backend Connected</span>
              {backendInfo.version && (
                <span style={{ marginLeft: '1rem', color: '#fff' }}>Version: {backendInfo.version}</span>
              )}
              {backendInfo.status && (
                <span style={{ marginLeft: '1rem', color: '#fff' }}>Status: {backendInfo.status}</span>
              )}
            </>
          )}
        </div>
        <div className="features-row">
          <div className="feature-card dark-card">
            <span className="feature-icon">📷</span>
            <h3>Photo Galleries</h3>
            <p>Browse and order your photos online.</p>
          </div>
          <div className="feature-card dark-card">
            <span className="feature-icon">🛒</span>
            <h3>Easy Ordering</h3>
            <p>Simple, secure checkout for prints and downloads.</p>
          </div>
          <div className="feature-card dark-card">
            <span className="feature-icon">🏷️</span>
            <h3>Player Tagging</h3>
            <p>Tag players in photos for quick search and personalized albums.</p>
          </div>
          <div className="feature-card dark-card">
            <span className="feature-icon">🤖</span>
            <h3>Facial Recognition</h3>
            <p>Advanced AI helps identify faces and organize your memories automatically.</p>
          </div>
        </div>
        {backendInfo.features && backendInfo.features.length > 0 && (
          <div className="backend-features" style={{ marginTop: '2rem', textAlign: 'center' }}>
            <h4 style={{ color: '#fff', marginBottom: '0.5rem' }}>Backend Features:</h4>
            <ul style={{ color: '#7c5cff', display: 'inline-block', textAlign: 'left' }}>
              {backendInfo.features.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </>
  );
}