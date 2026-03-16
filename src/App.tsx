// ...existing code...
import { Suspense, lazy, useEffect } from 'react';

const SearchPage = lazy(() => import('./pages/SearchPage'));
import DebugRouteBanner from './components/DebugRouteBanner';
import { BrowserRouter, Routes, Route, Navigate, useLocation, useLocation as useLoc } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { CartProvider } from './contexts/CartContext';
import Navbar from './components/Navbar';
import ProtectedRoute from './components/ProtectedRoute';
import AdminProtectedRoute from './components/AdminProtectedRoute';
import SuperAdminProtectedRoute from './components/SuperAdminProtectedRoute';
import AdminLayout from './components/AdminLayout';
import { analyticsService } from './services/analyticsService';
import './App.css';
import './AdminStyles.css';

const AdminPayments = lazy(() => import('./pages/admin/AdminPayments'));

const AdminSmugMug = lazy(() => import('./pages/admin/AdminSmugMug'));
const AdminProducts = lazy(() => import('./pages/admin/AdminProducts'));
const AdminWatermarks = lazy(() => import('./pages/admin/AdminWatermarks'));
const StudioAdminDashboard = lazy(() => import('./pages/admin/StudioAdminDashboard'));
const SuperAdminPricing = lazy(() => import('./pages/admin/SuperAdminPricing'));
const SuperAdminDashboard = lazy(() => import('./pages/admin/SuperAdminDashboard'));
const StudioPublicPage = lazy(() => import('./pages/StudioPublicPage'));
const StudioSignup = lazy(() => import('./pages/StudioSignup'));
const CheckoutSuccess = lazy(() => import('./pages/CheckoutSuccess'));
const LandingPage = lazy(() => import('./pages/LandingPage'));
const Login = lazy(() => import('./pages/Login'));
const Register = lazy(() => import('./pages/Register'));
const Albums = lazy(() => import('./pages/Albums'));
const AlbumDetails = lazy(() => import('./pages/AlbumDetails'));
const Search = lazy(() => import('./pages/Search'));
const Cart = lazy(() => import('./pages/Cart'));
const Orders = lazy(() => import('./pages/Orders'));
const AdminLogin = lazy(() => import('./pages/admin/AdminLogin'));
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'));
const AdminAnalytics = lazy(() => import('./pages/admin/AdminAnalytics'));
const AdminAlbums = lazy(() => import('./pages/admin/AdminAlbums'));
const AdminPhotos = lazy(() => import('./pages/admin/AdminPhotos'));
const AdminPriceLists = lazy(() => import('./pages/admin/AdminPriceLists'));
const AdminUsers = lazy(() => import('./pages/admin/AdminUsers'));
const AdminStudioAdmins = lazy(() => import('./pages/admin/AdminStudioAdmins'));
const AdminProfile = lazy(() => import('./pages/admin/AdminProfile'));
const AdminDiscountCodes = lazy(() => import('./pages/admin/AdminDiscountCodes'));
const AdminLabs = lazy(() => import('./pages/admin/AdminLabs'));
const AdminRoesConfig = lazy(() => import('./pages/admin/AdminRoesConfig'));
const AdminWhccConfig = lazy(() => import('./pages/admin/AdminWhccConfig'));
const AdminMpixConfig = lazy(() => import('./pages/admin/AdminMpixConfig'));
const AdminOrders = lazy(() => import('./pages/admin/AdminOrders'));
const AdminCustomers = lazy(() => import('./pages/admin/AdminCustomers'));
const AdminShipping = lazy(() => import('./pages/admin/AdminShipping'));

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
