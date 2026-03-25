

const SuperAdminDashboard = () => (
  <div className="dashboardContainer">
    <h1 className="gradient-text" style={{ marginBottom: '0.5rem' }}>Super Admin Dashboard</h1>
    <p className="text-secondary" style={{ marginBottom: '2rem' }}>Platform-wide business overview, analytics, and management tools.</p>
    <div className="dashboard-metrics">
      <div className="dashboard-card dark-card">
        <span className="dashboard-card-icon">🛡️</span>
        <div className="dashboard-card-label">Total Studios</div>
        <div className="dashboard-card-value">0</div>
        <div className="dashboard-card-sub">Studios on platform</div>
      </div>
      <div className="dashboard-card dark-card">
        <span className="dashboard-card-icon">💳</span>
        <div className="dashboard-card-label">Active Subscriptions</div>
        <div className="dashboard-card-value">0</div>
        <div className="dashboard-card-sub">Active plans</div>
      </div>
      <div className="dashboard-card dark-card">
        <span className="dashboard-card-icon">💰</span>
        <div className="dashboard-card-label">Total Revenue</div>
        <div className="dashboard-card-value">$0.00</div>
        <div className="dashboard-card-sub">Platform revenue</div>
      </div>
    </div>
    <div style={{ marginTop: '2.5rem' }}>
      <div className="dashboard-section-header">Quick Actions</div>
      <div className="dashboard-actions-grid">
        <a className="dashboard-pill primary" href="#">Manage Studios</a>
        <a className="dashboard-pill primary" href="#">Manage Users</a>
        <a className="dashboard-pill" href="#">View Analytics</a>
        <a className="dashboard-pill" href="#">Platform Settings</a>
      </div>
    </div>
  </div>
);

export default SuperAdminDashboard;
