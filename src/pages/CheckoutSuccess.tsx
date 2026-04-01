import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';

export default function CheckoutSuccess() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [message, setMessage] = useState('Processing your subscription...');

  useEffect(() => {
    const sessionId = searchParams.get('session_id');
    
    if (sessionId) {
      // Wait a moment for webhook to process, then redirect
      setTimeout(() => {
        setMessage('Subscription activated! Redirecting...');
        setTimeout(() => {
          navigate('/admin/dashboard');
        }, 2000);
      }, 3000);
    } else {
      navigate('/admin/dashboard');
    }
  }, [searchParams, navigate]);

  return (
    <div className="checkout-success-bg">
      <div className="checkout-success-card">
        <div className="checkout-success-icon">
          ✅
        </div>
        <h2>Payment Successful!</h2>
        <p className="checkout-success-message">
          {message}
        </p>
        <div className="checkout-success-spinner"></div>

      </div>
    </div>
  );
}
