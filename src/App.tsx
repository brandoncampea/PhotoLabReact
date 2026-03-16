// ...existing code...
import { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { CartProvider } from './contexts/CartContext';
import Navbar from './components/Navbar';
import './App.css';
import './AdminStyles.css';

const SearchPage = lazy(() => import('./pages/SearchPage'));
const SuperAdminPricing = lazy(() => import('./pages/admin/SuperAdminPricing'));
const SuperAdminDashboard = lazy(() => import('./pages/admin/SuperAdminDashboard'));
const StudioPublicPage = lazy(() => import('./pages/StudioPublicPage'));
const StudioSignup = lazy(() => import('./pages/StudioSignup'));
const LandingPage = lazy(() => import('./pages/LandingPage'));
const Login = lazy(() => import('./pages/Login'));
const Register = lazy(() => import('./pages/Register'));
const Albums = lazy(() => import('./pages/Albums'));
const AlbumDetails = lazy(() => import('./pages/AlbumDetails'));
const Cart = lazy(() => import('./pages/Cart'));
const Orders = lazy(() => import('./pages/Orders'));
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'));
const AdminSmugMug = lazy(() => import('./pages/admin/AdminSmugMug'));

function App() {
    return (
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AuthProvider>
          <CartProvider>
            <div className="app">
              <Navbar />
              <main className="main-content">
                <Suspense fallback={<div className="loader">Loading...</div>}>
                  <Routes>
                    <Route path="/" element={<LandingPage />} />
                    <Route path="/studio-signup" element={<StudioSignup />} />
                    <Route path="/login" element={<Login />} />
                    <Route path="/register" element={<Register />} />
                    <Route path="/albums" element={<Albums />} />
                    <Route path="/albums/:albumId" element={<AlbumDetails />} />
                    <Route path="/cart" element={<Cart />} />
                    <Route path="/orders" element={<Orders />} />
                    <Route path="/search" element={<SearchPage />} />
                    <Route path="/studio/:studioSlug" element={<StudioPublicPage />} />
                    <Route path="/super-admin" element={<SuperAdminDashboard />} />
                    <Route path="/super-admin/pricing" element={<SuperAdminPricing />} />
                    <Route path="/admin/dashboard" element={<AdminDashboard />} />
                    <Route path="/admin/smugmug" element={<AdminSmugMug />} />
                    {/* Add other routes as needed */}
                  </Routes>
                </Suspense>
              </main>
            </div>
          </CartProvider>
        </AuthProvider>
      </BrowserRouter>
    );
}

export default App;
