import React from 'react';
import StudioSignup from '../components/StudioSignup';

const StudioSignupPage: React.FC = () => {
  return (
    <div className="page-container">
      <StudioSignup onSignupSuccess={() => {
        window.location.href = '/login';
      }} />
    </div>
  );
};

export default StudioSignupPage;
