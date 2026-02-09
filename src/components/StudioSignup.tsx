import React, { useState } from 'react';
import { SUBSCRIPTION_PLANS } from '../services/subscriptionService';

interface StudioSignupProps {
  onSignupSuccess?: (studio: any) => void;
}

export const StudioSignup: React.FC<StudioSignupProps> = ({ onSignupSuccess }) => {
  const [step, setStep] = useState<'plan' | 'form'>('plan');
  const [selectedPlan, setSelectedPlan] = useState<string>('professional');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [formData, setFormData] = useState({
    studioName: '',
    studioEmail: '',
    adminName: '',
    adminEmail: '',
    adminPassword: '',
    confirmPassword: ''
  });

  const handlePlanSelect = (planId: string) => {
    setSelectedPlan(planId);
    setStep('form');
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Validate passwords match
    if (formData.adminPassword !== formData.confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    // Validate password strength
    if (formData.adminPassword.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/studios/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studioName: formData.studioName,
          studioEmail: formData.studioEmail,
          adminName: formData.adminName,
          adminEmail: formData.adminEmail,
          adminPassword: formData.adminPassword,
          subscriptionPlan: selectedPlan
        })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to create studio');
      }

      const result = await response.json();
      alert(`Studio created successfully! Login with ${formData.adminEmail}`);
      onSignupSuccess?.(result.studio);
      
      // Reset form
      setFormData({
        studioName: '',
        studioEmail: '',
        adminName: '',
        adminEmail: '',
        adminPassword: '',
        confirmPassword: ''
      });
      setStep('plan');
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  if (step === 'plan') {
    return (
      <div className="studio-signup-plans">
        <h2>Choose Your Studio Plan</h2>
        <div className="plans-grid">
          {Object.entries(SUBSCRIPTION_PLANS).map(([id, plan]) => (
            <div key={id} className={`plan-card ${selectedPlan === id ? 'selected' : ''}`}>
              <h3>{plan.name}</h3>
              <div className="price">
                <span className="amount">${plan.monthlyPrice}</span>
                <span className="period">/month</span>
              </div>
              <ul className="features">
                {plan.features.map((feature, idx) => (
                  <li key={idx}>✓ {feature}</li>
                ))}
              </ul>
              <button 
                onClick={() => handlePlanSelect(id)}
                className="btn-select-plan"
              >
                Choose Plan
              </button>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="studio-signup-form">
      <h2>Create Your Studio</h2>
      <p className="selected-plan">
        Selected Plan: <strong>{SUBSCRIPTION_PLANS[selectedPlan].name}</strong> - 
        ${SUBSCRIPTION_PLANS[selectedPlan].monthlyPrice}/month
      </p>

      <form onSubmit={handleSubmit}>
        {error && <div className="error-message">{error}</div>}

        <div className="form-section">
          <h3>Studio Information</h3>
          <div className="form-group">
            <label htmlFor="studioName">Studio Name</label>
            <input
              id="studioName"
              name="studioName"
              type="text"
              placeholder="Your Photo Studio"
              value={formData.studioName}
              onChange={handleInputChange}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="studioEmail">Studio Email</label>
            <input
              id="studioEmail"
              name="studioEmail"
              type="email"
              placeholder="studio@example.com"
              value={formData.studioEmail}
              onChange={handleInputChange}
              required
            />
          </div>
        </div>

        <div className="form-section">
          <h3>Admin Account</h3>
          <div className="form-group">
            <label htmlFor="adminName">Admin Name</label>
            <input
              id="adminName"
              name="adminName"
              type="text"
              placeholder="John Doe"
              value={formData.adminName}
              onChange={handleInputChange}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="adminEmail">Admin Email</label>
            <input
              id="adminEmail"
              name="adminEmail"
              type="email"
              placeholder="admin@example.com"
              value={formData.adminEmail}
              onChange={handleInputChange}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="adminPassword">Password</label>
            <input
              id="adminPassword"
              name="adminPassword"
              type="password"
              placeholder="••••••••"
              value={formData.adminPassword}
              onChange={handleInputChange}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="confirmPassword">Confirm Password</label>
            <input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              placeholder="••••••••"
              value={formData.confirmPassword}
              onChange={handleInputChange}
              required
            />
          </div>
        </div>

        <div className="form-actions">
          <button 
            type="button"
            onClick={() => setStep('plan')}
            className="btn-back"
            disabled={loading}
          >
            Back
          </button>
          <button 
            type="submit"
            disabled={loading}
            className="btn-create"
          >
            {loading ? 'Creating Studio...' : 'Create Studio'}
          </button>
        </div>
      </form>

      <style jsx>{`
        .studio-signup-plans {
          max-width: 1200px;
          margin: 0 auto;
          padding: 40px 20px;
        }

        .studio-signup-plans h2 {
          text-align: center;
          margin-bottom: 40px;
          font-size: 28px;
        }

        .plans-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
          gap: 30px;
          margin-bottom: 30px;
        }

        .plan-card {
          border: 2px solid #ddd;
          border-radius: 8px;
          padding: 30px;
          text-align: center;
          transition: all 0.3s ease;
          cursor: pointer;
        }

        .plan-card:hover {
          border-color: #007bff;
          box-shadow: 0 4px 12px rgba(0, 123, 255, 0.1);
        }

        .plan-card.selected {
          border-color: #007bff;
          background-color: rgba(0, 123, 255, 0.05);
          box-shadow: 0 4px 12px rgba(0, 123, 255, 0.2);
        }

        .plan-card h3 {
          font-size: 24px;
          margin-bottom: 20px;
        }

        .price {
          margin: 20px 0;
          font-size: 18px;
        }

        .amount {
          font-size: 48px;
          font-weight: bold;
          color: #007bff;
        }

        .period {
          color: #666;
          font-size: 14px;
          margin-left: 5px;
        }

        .features {
          list-style: none;
          padding: 20px 0;
          text-align: left;
        }

        .features li {
          padding: 8px 0;
          color: #666;
          border-bottom: 1px solid #eee;
        }

        .features li:last-child {
          border-bottom: none;
        }

        .btn-select-plan {
          width: 100%;
          padding: 12px;
          margin-top: 20px;
          background-color: #007bff;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-size: 16px;
          transition: background-color 0.3s;
        }

        .btn-select-plan:hover {
          background-color: #0056b3;
        }

        .studio-signup-form {
          max-width: 600px;
          margin: 0 auto;
          padding: 40px 20px;
        }

        .studio-signup-form h2 {
          margin-bottom: 20px;
          font-size: 28px;
        }

        .selected-plan {
          background-color: #f0f8ff;
          padding: 12px;
          border-radius: 4px;
          margin-bottom: 30px;
          color: #0056b3;
        }

        .error-message {
          background-color: #f8d7da;
          color: #721c24;
          padding: 12px;
          border-radius: 4px;
          margin-bottom: 20px;
        }

        .form-section {
          margin-bottom: 30px;
        }

        .form-section h3 {
          font-size: 18px;
          margin-bottom: 15px;
          color: #333;
          border-bottom: 2px solid #eee;
          padding-bottom: 10px;
        }

        .form-group {
          margin-bottom: 20px;
        }

        .form-group label {
          display: block;
          margin-bottom: 8px;
          font-weight: 500;
          color: #333;
        }

        .form-group input {
          width: 100%;
          padding: 12px;
          border: 1px solid #ddd;
          border-radius: 4px;
          font-size: 14px;
          box-sizing: border-box;
        }

        .form-group input:focus {
          outline: none;
          border-color: #007bff;
          box-shadow: 0 0 0 3px rgba(0, 123, 255, 0.1);
        }

        .form-actions {
          display: flex;
          gap: 10px;
          margin-top: 30px;
        }

        .btn-back,
        .btn-create {
          flex: 1;
          padding: 12px;
          border: none;
          border-radius: 4px;
          font-size: 16px;
          cursor: pointer;
          transition: background-color 0.3s;
        }

        .btn-back {
          background-color: #e9ecef;
          color: #333;
        }

        .btn-back:hover:not(:disabled) {
          background-color: #dee2e6;
        }

        .btn-create {
          background-color: #007bff;
          color: white;
        }

        .btn-create:hover:not(:disabled) {
          background-color: #0056b3;
        }

        .btn-back:disabled,
        .btn-create:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
      `}</style>
    </div>
  );
};

export default StudioSignup;
