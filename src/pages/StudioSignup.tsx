import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import '../App.css';

interface SubscriptionPlan {
  id: string;
  name: string;
  monthlyPrice: number;
  features: string[];
}

export default function StudioSignup() {
  const navigate = useNavigate();
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedPlan, setSelectedPlan] = useState<string>('');

  const [formData, setFormData] = useState({
    studioName: '',
    studioEmail: '',
    adminName: '',
    adminEmail: '',
    adminPassword: '',
    confirmPassword: ''
  });

  useEffect(() => {
    fetchSubscriptionPlans();
  }, []);

  const fetchSubscriptionPlans = async () => {
    try {
      const response = await fetch('http://localhost:3001/api/studios/plans/list');
      if (response.ok) {
        const data = await response.json();
        setPlans(Object.values(data));
      }
    } catch (err) {
      console.error('Failed to fetch plans:', err);
    }
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
    setLoading(true);

    // Validate form
    if (!formData.studioName || !formData.studioEmail || !formData.adminName ||
        !formData.adminEmail || !formData.adminPassword) {
      setError('All fields are required');
      setLoading(false);
      return;
    }

    if (formData.adminPassword !== formData.confirmPassword) {
      setError('Passwords do not match');
      setLoading(false);
      return;
    }

    if (formData.adminPassword.length < 8) {
      setError('Password must be at least 8 characters');
      setLoading(false);
      return;
    }

    try {
      const response = await fetch('http://localhost:3001/api/studios/signup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          studioName: formData.studioName,
          studioEmail: formData.studioEmail,
          adminName: formData.adminName,
          adminEmail: formData.adminEmail,
          adminPassword: formData.adminPassword,
          subscriptionPlan: selectedPlan || undefined
        })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to create studio');
      }

      const data = await response.json();
      alert(`Studio created successfully! Your studio ID: ${data.studioId}`);
      navigate('/login');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-box" style={{ maxWidth: '600px' }}>
        <h1>Create Your Studio</h1>
        <p style={{ textAlign: 'center', color: '#666', marginBottom: '30px' }}>
          Start managing your photos professionally
        </p>

        {error && <div className="error-message">{error}</div>}

        {/* Subscription Plans Selection */}
        <div style={{ marginBottom: '30px' }}>
          <h3>Select Your Plan (Optional)</h3>
          <p style={{ color: '#666', marginBottom: '15px' }}>
            Choose a plan now or sign up free and subscribe later. You'll need an active subscription to create albums and sell products.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '15px' }}>
            <div
              onClick={() => setSelectedPlan('')}
              style={{
                padding: '15px',
                border: selectedPlan === '' ? '2px solid #007bff' : '1px solid #ddd',
                borderRadius: '8px',
                cursor: 'pointer',
                backgroundColor: selectedPlan === '' ? '#f0f7ff' : '#fff',
                transition: 'all 0.2s'
              }}
            >
              <h4 style={{ margin: '0 0 10px 0' }}>Free</h4>
              <p style={{ margin: '0', fontSize: '18px', fontWeight: 'bold', color: '#4caf50' }}>
                $0
              </p>
              <p style={{ margin: '5px 0 0 0', fontSize: '12px', color: '#666' }}>
                Subscribe later
              </p>
            </div>
            {plans.map(plan => (
              <div
                key={plan.id}
                onClick={() => setSelectedPlan(plan.id)}
                style={{
                  padding: '15px',
                  border: selectedPlan === plan.id ? '2px solid #007bff' : '1px solid #ddd',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  backgroundColor: selectedPlan === plan.id ? '#f0f7ff' : '#fff',
                  transition: 'all 0.2s'
                }}
              >
                <h4 style={{ margin: '0 0 10px 0' }}>{plan.name}</h4>
                <p style={{ margin: '0', fontSize: '18px', fontWeight: 'bold', color: '#007bff' }}>
                  ${plan.monthlyPrice}/mo
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit}>
          <h3>Studio Information</h3>
          <div style={{ marginBottom: '15px' }}>
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

          <div style={{ marginBottom: '15px' }}>
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
          <div style={{ marginBottom: '15px' }}>
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

          <div style={{ marginBottom: '15px' }}>
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

          <div style={{ marginBottom: '15px' }}>
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

          <div style={{ marginBottom: '20px' }}>
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
            style={{
              width: '100%',
              padding: '12px',
              backgroundColor: '#007bff',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              fontSize: '16px',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.7 : 1
            }}
          >
            {loading ? 'Creating Studio...' : 'Create Studio'}
          </button>
        </form>

        <p style={{ textAlign: 'center', marginTop: '20px' }}>
          Already have an account?{' '}
          <a href="/login" style={{ color: '#007bff', textDecoration: 'none' }}>
            Log in here
          </a>
        </p>
      </div>
    </div>
  );
}
