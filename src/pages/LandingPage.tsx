import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import '../App.css';

// Helper components
function FeatureCard({ icon, title, description }: { icon: string; title: string; description: string }) {
  return (
    <div style={{
      background: 'rgba(255, 255, 255, 0.05)',
      border: '1px solid rgba(255, 255, 255, 0.1)',
      borderRadius: '12px',
      padding: '2rem',
      textAlign: 'center',
      transition: 'all 0.3s ease',
    }}>
      <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>{icon}</div>
      <h3 className="gradient-text" style={{ fontSize: '1.5rem', fontWeight: '600', marginBottom: '0.5rem' }}>{title}</h3>
      <p style={{ color: '#a0a0a0', lineHeight: '1.6' }}>{description}</p>
    </div>
  );
}

function PricingCard({ name, price, features, highlighted }: { name: string; price: string; features: string[]; highlighted?: boolean }) {
  return (
    <div style={{
      background: highlighted ? 'linear-gradient(135deg, rgba(124, 92, 255, 0.2) 0%, rgba(167, 139, 250, 0.1) 100%)' : 'rgba(255, 255, 255, 0.05)',
      border: highlighted ? '2px solid #7c5cff' : '1px solid rgba(255, 255, 255, 0.1)',
      borderRadius: '12px',
      padding: '2rem',
      textAlign: 'center',
      position: 'relative',
      transition: 'all 0.3s ease',
    }}>
      {highlighted && (
        <div style={{
          position: 'absolute',
          top: '-12px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: '#7c5cff',
          color: '#fff',
          padding: '0.3rem 1rem',
          borderRadius: '20px',
          fontSize: '0.9rem',
          fontWeight: '600'
        }}>Most Popular</div>
      )}
      <h3 className="gradient-text" style={{ fontSize: '1.8rem', fontWeight: '700', marginBottom: '0.5rem' }}>{name}</h3>
      <div style={{ fontSize: '3rem', fontWeight: '700', color: '#7c5cff', marginBottom: '0.5rem' }}>
        {price}
        <span style={{ fontSize: '1.2rem', color: '#a0a0a0' }}>/mo</span>
      </div>
      <ul style={{
        listStyle: 'none',
        padding: '1.5rem 0',
        margin: 0,
        borderTop: '1px solid rgba(255, 255, 255, 0.1)',
      }}>
        {features.map((feature, index) => (
          <li key={index} style={{
            padding: '0.5rem 0',
            color: '#d0d0d0',
            fontSize: '1rem'
          }}>✓ {feature}</li>
        ))}
      </ul>
    </div>
  );
}

// Types
interface LandingSubscriptionPlan {
  id: string | number;
  name: string;
  monthly_price: number;
  yearly_price?: number;
  features: string[];
  is_active?: boolean;
}

// Minimal working LandingPage
export default function LandingPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [plans, setPlans] = React.useState<LandingSubscriptionPlan[]>([]);
  React.useEffect(() => {
    // Example: fetch plans here
    setPlans([
      { id: 1, name: 'Basic', monthly_price: 10, features: ['Feature 1', 'Feature 2'], is_active: true },
      { id: 2, name: 'Pro', monthly_price: 20, features: ['Feature 1', 'Feature 2', 'Feature 3'], is_active: true },
    ]);
  }, []);
  return (
    <>
      <div style={{position:'fixed',top:0,left:0,right:0,zIndex:9999,background:'#7c5cff',color:'#fff',padding:'8px',textAlign:'center',fontWeight:700,fontSize:'1.1rem',letterSpacing:'1px',boxShadow:'0 2px 8px #0008'}}>LandingPage.tsx is rendering</div>
      <div className="main-content">
        <h1 style={{ color: '#fff', marginBottom: '2rem' }}>Landing Page</h1>
        <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', justifyContent: 'center' }}>
          <FeatureCard icon="📷" title="Photo Galleries" description="Browse and order your photos online." />
          <FeatureCard icon="🛒" title="Easy Ordering" description="Simple, secure checkout for prints and downloads." />
        </div>
        <h2 style={{ marginTop: '2.5rem', color: '#fff' }}>Plans</h2>
        <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', justifyContent: 'center' }}>
          {plans.map((plan, idx) => (
            <PricingCard
              key={plan.id}
              name={plan.name}
              price={`$${plan.monthly_price}`}
              features={plan.features}
              highlighted={idx === 1}
            />
          ))}
        </div>
      </div>
    </>
  );
}