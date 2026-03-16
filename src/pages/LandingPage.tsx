export default function LandingPage() {
  return (
    <div className="main-content">
      <h1 style={{ color: '#fff', marginBottom: '2rem' }}>Landing Page</h1>
      <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', justifyContent: 'center' }}>
        <div className="feature-card">
          <span className="feature-icon">📷</span>
          <h3>Photo Galleries</h3>
          <p>Browse and order your photos online.</p>
        </div>
        <div className="feature-card">
          <span className="feature-icon">🛒</span>
          <h3>Easy Ordering</h3>
          <p>Simple, secure checkout for prints and downloads.</p>
        </div>
      </div>
    </div>
  );
}