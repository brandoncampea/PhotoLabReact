import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useCart } from '../contexts/CartContext';
// import { profileService } from '../services/profileService';

const Navbar: React.FC = () => {
  const { user, logout } = useAuth();
  const {} = useCart();
  // ...existing code...
  // const [logoUrl, setLogoUrl] = useState('');

  useEffect(() => {
    // If you need to load logo asynchronously, do it here
  }, []);


  return null;
};

export default Navbar;
