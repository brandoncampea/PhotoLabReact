import { Suspense, lazy, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
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
const AdminProducts = lazy(() => import('./pages/admin/AdminProducts'));
const AdminPriceLists = lazy(() => import('./pages/admin/AdminPriceLists'));
const AdminWatermarks = lazy(() => import('./pages/admin/AdminWatermarks'));
const AdminOrders = lazy(() => import('./pages/admin/AdminOrders'));
const AdminCustomers = lazy(() => import('./pages/admin/AdminCustomers'));
const AdminShipping = lazy(() => import('./pages/admin/AdminShipping'));
const AdminPayments = lazy(() => import('./pages/admin/AdminStripe'));
const AdminUsers = lazy(() => import('./pages/admin/AdminUsers'));
const AdminStudioAdmins = lazy(() => import('./pages/admin/AdminStudioAdmins'));
const AdminProfile = lazy(() => import('./pages/admin/AdminProfile'));
const AdminDiscountCodes = lazy(() => import('./pages/admin/AdminDiscountCodes'));
const AdminLabs = lazy(() => import('./pages/admin/AdminLabs'));
const AdminRoesConfig = lazy(() => import('./pages/admin/AdminRoesConfig'));
const AdminWhccConfig = lazy(() => import('./pages/admin/AdminWhccConfig'));
const AdminMpixConfig = lazy(() => import('./pages/admin/AdminMpixConfig'));
const StudioSignup = lazy(() => import('./pages/StudioSignup'));
const SuperAdminDashboard = lazy(() => import('./pages/SuperAdminDashboard'));
const SuperAdminPricing = lazy(() => import('./pages/SuperAdminPricing'));
const CheckoutSuccess = lazy(() => import('./pages/CheckoutSuccess'));

function RouteAnalyticsTracker() {
  const location = useLocation();

  useEffect(() => {
    analyticsService.trackVisit();
    analyticsService.trackPageView(`${location.pathname}${location.search}`);
  }, [location.pathname, location.search]);

  return null;
}

function App() {
  return (
    <BrowserRouter
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true,
      }}
    >
      <AuthProvider>
        <CartProvider>
          <RouteAnalyticsTracker />
          <div className="app">
            <Navbar />
            <main className="main-content">
              <Suspense fallback={<div className="loading">Loading...</div>}>
                <Routes>
                <Route path="/login" element={<Login />} />
                <Route path="/register" element={<Register />} />
                <Route path="/studio-signup" element={<StudioSignup />} />
                <Route path="/checkout-success" element={<CheckoutSuccess />} />
                <Route
                  path="/albums"
                  element={
                    <ProtectedRoute>
                      <Albums />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/albums/:id"
                  element={
                    <ProtectedRoute>
                      <AlbumDetails />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/search"
                  element={
                    <ProtectedRoute>
                      <Search />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/cart"
                  element={
                    <ProtectedRoute>
                      <Cart />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/orders"
                  element={
                    <ProtectedRoute>
                      <Orders />
                    </ProtectedRoute>
                  }
                />
                <Route path="/" element={<LandingPage />} />

                {/* Studio Subscription Routes */}
                <Route
                  path="/studio-admin"
                  element={<Navigate to="/admin/dashboard" replace />}
                />

                {/* Super Admin Routes */}
                <Route
                  path="/super-admin"
                  element={
                    <SuperAdminProtectedRoute>
                      <SuperAdminDashboard />
                    </SuperAdminProtectedRoute>
                  }
                />
                <Route
                  path="/super-admin-pricing"
                  element={
                    <SuperAdminProtectedRoute>
                      <SuperAdminPricing />
                    </SuperAdminProtectedRoute>
                  }
                />

                {/* Admin Routes */}
                <Route path="/admin/login" element={<AdminLogin />} />
                <Route
                  path="/admin/*"
                  element={
                    <AdminProtectedRoute>
                      <AdminLayout>
                        <Routes>
                          <Route path="dashboard" element={<AdminDashboard />} />
                          <Route path="analytics" element={<AdminAnalytics />} />
                          <Route path="albums" element={<AdminAlbums />} />
                          <Route path="photos" element={<AdminPhotos />} />
                          <Route path="products" element={<AdminProducts />} />
                          <Route
                            path="price-lists"
                            element={
                              <SuperAdminProtectedRoute>
                                <AdminPriceLists />
                              </SuperAdminProtectedRoute>
                            }
                          />
                          <Route path="watermarks" element={<AdminWatermarks />} />
                          <Route path="orders" element={<AdminOrders />} />
                          <Route path="customers" element={<AdminCustomers />} />
                          <Route path="shipping" element={<AdminShipping />} />
                          <Route path="payments" element={<AdminPayments />} />
                          <Route path="users" element={<AdminUsers />} />
                          <Route path="studio-admins" element={<AdminStudioAdmins />} />
                          <Route path="profile" element={<AdminProfile />} />
                          <Route path="discount-codes" element={<AdminDiscountCodes />} />
                          <Route path="labs" element={<AdminLabs />} />
                          <Route path="configuration" element={<AdminLabs />} />
                          <Route path="roes-config" element={<AdminRoesConfig />} />
                          <Route path="whcc-config" element={<AdminWhccConfig />} />
                          <Route path="mpix-config" element={<AdminMpixConfig />} />
                          <Route path="*" element={<Navigate to="/admin/dashboard" replace />} />
                        </Routes>
                      </AdminLayout>
                    </AdminProtectedRoute>
                  }
                />

                <Route path="*" element={<Navigate to="/albums" replace />} />
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
