import { Suspense, lazy } from 'react';
const StudioTickets = lazy(() => import('./pages/admin/StudioTickets'));
const AdminTickets = lazy(() => import('./pages/admin/AdminTickets'));
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { CartProvider } from './contexts/CartContext';
import Layout from './components/Layout/Layout';
import AdminProtectedRoute from './components/AdminProtectedRoute';
import StudioAlbumStyles from './pages/admin/StudioAlbumStyles';

const SuperAdminShipping = lazy(() => import('./pages/admin/SuperAdminShipping'));

const AdminSubscriptionGateway = lazy(() => import('./pages/admin/AdminSubscriptionGateway'));

const AdminSubscription = lazy(() => import('./pages/admin/AdminSubscription'));
const AdminStripe = lazy(() => import('./pages/admin/AdminStripe'));

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
const Checkout = lazy(() => import('./pages/Checkout'));
const Orders = lazy(() => import('./pages/Orders'));
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'));
const AdminSmugMug = lazy(() => import('./pages/admin/AdminSmugMug'));
const AdminPriceLists = lazy(() => import('./pages/admin/AdminPriceLists'));
const AdminPackagesPage = lazy(() => import('./pages/admin/AdminPackages'));
const AdminConfiguration = lazy(() => import('./pages/admin/AdminConfiguration'));
const AdminVendorIntegrations = lazy(() => import('./pages/admin/AdminVendorIntegrations'));
const StudioAdminDashboard = lazy(() => import('./pages/admin/StudioAdminDashboard'));
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
const AdminLogin = lazy(() => import('./pages/admin/AdminLogin'));
const SuperAdminLogin = lazy(() => import('./pages/admin/SuperAdminLogin'));
const CustomerAccount = lazy(() => import('./pages/CustomerAccount'));



function App() {
  return (
    <AuthProvider>
      <CartProvider>
        <Layout>
          <Suspense fallback={<div className="loader">Loading...</div>}>
            <Routes>
              <Route path="/" element={<LandingPage />} />
              <Route path="/studio-signup" element={<StudioSignup />} />
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="/albums" element={<Albums />} />
              <Route path="/albums/:albumId" element={<AlbumDetails />} />
              <Route path="/cart" element={<Cart />} />
              <Route path="/checkout" element={<Checkout />} />
              <Route path="/orders" element={<Orders />} />
              <Route path="/account" element={<CustomerAccount />} />
              <Route path="/search" element={<SearchPage />} />
              <Route path="/studio/:studioSlug" element={<StudioPublicPage />} />
              <Route path="/s/:studioSlug/albums/:albumId" element={<AlbumDetails />} />
              {/* Admin and super admin login routes */}
              <Route path="/admin/login" element={<Suspense fallback={<div>Loading...</div>}><AdminLogin /></Suspense>} />
              <Route path="/super-admin/login" element={<Suspense fallback={<div>Loading...</div>}><SuperAdminLogin onLogin={() => {}} /></Suspense>} />
              {/* Admin and super admin protected routes */}
              <Route path="/super-admin" element={<AdminProtectedRoute><SuperAdminDashboard /></AdminProtectedRoute>} />
              <Route path="/super-admin-pricing" element={<AdminProtectedRoute><SuperAdminPricing /></AdminProtectedRoute>} />
              <Route path="/admin/super-pricing" element={<AdminProtectedRoute><SuperAdminPricing /></AdminProtectedRoute>} />
              <Route path="/admin/studio-dashboard" element={<AdminProtectedRoute><StudioAdminDashboard /></AdminProtectedRoute>} />
              <Route path="/admin/dashboard" element={<AdminProtectedRoute><AdminDashboard /></AdminProtectedRoute>} />
              <Route path="/admin/analytics" element={<Navigate to="/admin/dashboard" replace />} />
              <Route path="/admin/albums" element={<AdminProtectedRoute><AdminAlbums /></AdminProtectedRoute>} />
              <Route path="/admin/photos" element={<AdminProtectedRoute><AdminPhotos /></AdminProtectedRoute>} />
              <Route path="/admin/products" element={<AdminProtectedRoute><AdminProducts /></AdminProtectedRoute>} />
              <Route path="/admin/orders" element={<AdminProtectedRoute><AdminOrders /></AdminProtectedRoute>} />
              <Route path="/admin/customers" element={<AdminProtectedRoute><AdminCustomers /></AdminProtectedRoute>} />
              <Route path="/admin/shipping" element={<AdminProtectedRoute><AdminShipping /></AdminProtectedRoute>} />
              <Route path="/admin/super-shipping" element={<AdminProtectedRoute><SuperAdminShipping /></AdminProtectedRoute>} />
              <Route path="/admin/album-styles" element={<AdminProtectedRoute><StudioAlbumStyles /></AdminProtectedRoute>} />
              <Route path="/admin/discount-codes" element={<AdminProtectedRoute><AdminDiscountCodes /></AdminProtectedRoute>} />
              <Route path="/admin/watermarks" element={<AdminProtectedRoute><AdminWatermarks /></AdminProtectedRoute>} />
              <Route path="/admin/profile" element={<AdminProtectedRoute><AdminProfile /></AdminProtectedRoute>} />
              <Route path="/admin/smugmug" element={<AdminProtectedRoute><AdminSmugMug /></AdminProtectedRoute>} />
              <Route path="/admin/price-lists" element={<AdminProtectedRoute><AdminPriceLists /></AdminProtectedRoute>} />
              <Route path="/admin/packages" element={<AdminProtectedRoute><AdminPackagesPage /></AdminProtectedRoute>} />
              <Route path="/admin/configuration" element={<AdminProtectedRoute><AdminConfiguration /></AdminProtectedRoute>} />
              <Route path="/admin/vendor-integrations" element={<AdminProtectedRoute><AdminVendorIntegrations /></AdminProtectedRoute>} />
              <Route path="/admin/users" element={<AdminProtectedRoute><AdminUsers /></AdminProtectedRoute>} />

              {/* Studio: My Tickets */}
              <Route path="/admin/studio-tickets" element={<AdminProtectedRoute><StudioTickets /></AdminProtectedRoute>} />
              {/* Super Admin: All Tickets */}
              <Route path="/admin/tickets" element={<AdminProtectedRoute><AdminTickets /></AdminProtectedRoute>} />

              <Route path="/admin/studio-admins" element={<AdminProtectedRoute><AdminStudioAdmins /></AdminProtectedRoute>} />
              <Route path="/admin/subscription" element={<AdminProtectedRoute><AdminSubscription /></AdminProtectedRoute>} />
              <Route path="/admin/subscription-gateway" element={<AdminProtectedRoute><AdminSubscriptionGateway /></AdminProtectedRoute>} />
              <Route path="/admin/stripe" element={<AdminProtectedRoute><AdminStripe /></AdminProtectedRoute>} />

            {/* Catch-all route to redirect to landing page */}
            <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </Layout>
      </CartProvider>
    </AuthProvider>
  );
}

  export default App;
