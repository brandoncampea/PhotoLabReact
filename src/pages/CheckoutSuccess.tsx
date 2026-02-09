import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function CheckoutSuccess() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
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
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      backgroundColor: '#f5f5f5'
    }}>
      <div style={{
        backgroundColor: 'white',
        padding: '40px',
        borderRadius: '8px',
        textAlign: 'center',
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
        maxWidth: '400px'
      }}>
        <div style={{
          fontSize: '48px',
          marginBottom: '20px'
        }}>
          ✅
        </div>
        <h2>Payment Successful!</h2>
        <p style={{ color: '#666', marginBottom: '20px' }}>
          {message}
        </p>
        <div style={{
          width: '30px',
          height: '30px',
          border: '3px solid #007bff',
          borderRadius: '50%',
          borderTop: '3px solid transparent',
          margin: '20px auto',
          animation: 'spin 1s linear infinite'
        }}></div>
        <style>{`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    </div>
  );
}
