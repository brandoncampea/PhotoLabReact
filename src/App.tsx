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
const AdminPriceLists = lazy(() => import('./pages/admin/AdminPriceLists'));
const AdminConfiguration = lazy(() => import('./pages/admin/AdminConfiguration'));
const StudioAdminDashboard = lazy(() => import('./pages/admin/StudioAdminDashboard'));
const AdminAnalytics = lazy(() => import('./pages/admin/AdminAnalytics'));
const AdminAlbums = lazy(() => import('./pages/admin/AdminAlbums'));
const AdminPhotos = lazy(() => import('./pages/admin/AdminPhotos'));
const AdminProducts = lazy(() => import('./pages/admin/AdminProducts'));
const AdminOrders = lazy(() => import('./pages/admin/AdminOrders'));
const AdminCustomers = lazy(() => import('./pages/admin/AdminCustomers'));
const AdminShipping = lazy(() => import('./pages/admin/AdminShipping'));
const AdminDiscountCodes = lazy(() => import('./pages/admin/AdminDiscountCodes'));
const AdminWatermarks = lazy(() => import('./pages/admin/AdminWatermarks'));
const AdminProfile = lazy(() => import('./pages/admin/AdminProfile'));
const AdminUsers = lazy(() => import('./pages/admin/AdminUsers'));
const AdminStudioAdmins = lazy(() => import('./pages/admin/AdminStudioAdmins'));

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
                    <Route path="/super-admin-pricing" element={<SuperAdminPricing />} />
                    <Route path="/admin/studio-dashboard" element={<StudioAdminDashboard />} />
                    <Route path="/admin/dashboard" element={<AdminDashboard />} />
                    <Route path="/admin/analytics" element={<AdminAnalytics />} />
                    <Route path="/admin/albums" element={<AdminAlbums />} />
                    <Route path="/admin/photos" element={<AdminPhotos />} />
                    <Route path="/admin/products" element={<AdminProducts />} />
                    <Route path="/admin/orders" element={<AdminOrders />} />
                    <Route path="/admin/customers" element={<AdminCustomers />} />
                    <Route path="/admin/shipping" element={<AdminShipping />} />
                    <Route path="/admin/discount-codes" element={<AdminDiscountCodes />} />
                    <Route path="/admin/watermarks" element={<AdminWatermarks />} />
                    <Route path="/admin/profile" element={<AdminProfile />} />
                    <Route path="/admin/smugmug" element={<AdminSmugMug />} />
                    <Route path="/admin/price-lists" element={<AdminPriceLists />} />
                    <Route path="/admin/configuration" element={<AdminConfiguration />} />
                    <Route path="/admin/users" element={<AdminUsers />} />
                    <Route path="/admin/studio-admins" element={<AdminStudioAdmins />} />
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
