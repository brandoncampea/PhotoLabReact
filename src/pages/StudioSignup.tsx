

import React, { useState } from 'react';
import '../PhotoLabStyles.css';

type Plan = { id: string; name: string; monthlyPrice: number };

const StudioSignup: React.FC = () => {
  const [plans] = useState<Plan[]>([
    { id: 'basic', name: 'Basic', monthlyPrice: 10 },
    { id: 'pro', name: 'Pro', monthlyPrice: 25 },
  ]);
  const [selectedPlan, setSelectedPlan] = useState('');
  const [formData, setFormData] = useState({
    studioName: '',
    studioEmail: '',
    adminName: '',
    adminEmail: '',
    adminPassword: '',
    confirmPassword: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setError('');
      // Simulate success
    }, 1000);
  };

  return (
    <div className="auth-container">
      <div className="auth-box auth-box-maxwidth">
        <h1>Create Your Studio</h1>
        <p className="auth-description">
          Start managing your photos professionally
        </p>
        {error && <div className="error-message">{error}</div>}
        <div className="plan-section">
          <h3>Select Your Plan (Optional)</h3>
          <p className="plan-description">
            Choose a plan now or sign up free and subscribe later. You'll need an active subscription to create albums and sell products.
          </p>
          <div className="plan-grid">
            <div
              onClick={() => setSelectedPlan('')}
              className={`plan-card ${selectedPlan === '' ? 'selected' : ''}`}
            >
              <h4 className="plan-title">Free</h4>
              <p className="plan-price free">$0</p>
              <p className="plan-note">Subscribe later</p>
            </div>
            {plans.map(plan => (
              <div
                key={plan.id}
                onClick={() => setSelectedPlan(plan.id)}
                className={`plan-card ${selectedPlan === plan.id ? 'selected' : ''}`}
              >
                <h4 className="plan-title">{plan.name}</h4>
                <p className="plan-price paid">${plan.monthlyPrice}/mo</p>
              </div>
            ))}
          </div>
        </div>
        <form onSubmit={handleSubmit}>
          <h3>Studio Information</h3>
          <div className="form-row-margin">
            <label>Studio Name</label>
            <input
              type="text"
              name="studioName"
              value={formData.studioName}
              onChange={handleInputChange}
              placeholder="e.g., John Smith Photography"
              required
            />
          </div>
          <div className="form-row-margin">
            <label>Studio Email</label>
            <input
              type="email"
              name="studioEmail"
              value={formData.studioEmail}
              onChange={handleInputChange}
              placeholder="studio@example.com"
              required
            />
          </div>
          <h3>Admin Account</h3>
          <div className="form-row-margin">
            <label>Admin Name</label>
            <input
              type="text"
              name="adminName"
              value={formData.adminName}
              onChange={handleInputChange}
              placeholder="Your full name"
              required
            />
          </div>
          <div className="form-row-margin">
            <label>Admin Email</label>
            <input
              type="email"
              name="adminEmail"
              value={formData.adminEmail}
              onChange={handleInputChange}
              placeholder="your@example.com"
              required
            />
          </div>
          <div className="form-row-margin">
            <label>Password</label>
            <input
              type="password"
              name="adminPassword"
              value={formData.adminPassword}
              onChange={handleInputChange}
              placeholder="At least 8 characters"
              required
            />
          </div>
          <div className="form-row-margin form-row-margin-lg">
            <label>Confirm Password</label>
            <input
              type="password"
              name="confirmPassword"
              value={formData.confirmPassword}
              onChange={handleInputChange}
              placeholder="Confirm your password"
              required
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className={`signup-submit-btn${loading ? ' disabled' : ''}`}
          >
            {loading ? 'Creating Studio...' : 'Create Studio'}
          </button>
        </form>
        <p className="signup-login-link">
          Already have an account?{' '}
          <a href="/login" className="signup-login-link-a">
            Log in here
          </a>
        </p>
      </div>
    </div>
  );
};

export default StudioSignup;
