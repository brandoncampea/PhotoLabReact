import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { CartProvider } from './contexts/CartContext';
import Navbar from './components/Navbar';
import ProtectedRoute from './components/ProtectedRoute';
import AdminProtectedRoute from './components/AdminProtectedRoute';
import AdminLayout from './components/AdminLayout';
import Login from './pages/Login';
import Register from './pages/Register';
import Albums from './pages/Albums';
import AlbumDetails from './pages/AlbumDetails';
import Cart from './pages/Cart';
import Orders from './pages/Orders';
import AdminLogin from './pages/admin/AdminLogin';
import AdminDashboard from './pages/admin/AdminDashboard';
import AdminAnalytics from './pages/admin/AdminAnalytics';
import AdminAlbums from './pages/admin/AdminAlbums';
import AdminPhotos from './pages/admin/AdminPhotos';
import AdminProducts from './pages/admin/AdminProducts';
import AdminWatermarks from './pages/admin/AdminWatermarks';
import AdminOrders from './pages/admin/AdminOrders';
import AdminCustomers from './pages/admin/AdminCustomers';
import AdminShipping from './pages/admin/AdminShipping';
import AdminPayments from './pages/admin/AdminStripe';
import AdminUsers from './pages/admin/AdminUsers';
import AdminProfile from './pages/admin/AdminProfile';
import AdminPackages from './pages/admin/AdminPackages';
import AdminDiscountCodes from './pages/admin/AdminDiscountCodes';
import './App.css';
import './AdminStyles.css';

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
          <div className="app">
            <Navbar />
            <main className="main-content">
              <Routes>
                <Route path="/login" element={<Login />} />
                <Route path="/register" element={<Register />} />
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
                <Route path="/" element={<Navigate to="/albums" replace />} />

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
                          <Route path="watermarks" element={<AdminWatermarks />} />
                          <Route path="orders" element={<AdminOrders />} />
                          <Route path="customers" element={<AdminCustomers />} />
                          <Route path="shipping" element={<AdminShipping />} />
                          <Route path="payments" element={<AdminPayments />} />
                          <Route path="users" element={<AdminUsers />} />
                          <Route path="profile" element={<AdminProfile />} />
                          <Route path="packages" element={<AdminPackages />} />
                          <Route path="discount-codes" element={<AdminDiscountCodes />} />
                          <Route path="*" element={<Navigate to="/admin/dashboard" replace />} />
                        </Routes>
                      </AdminLayout>
                    </AdminProtectedRoute>
                  }
                />

                <Route path="*" element={<Navigate to="/albums" replace />} />
              </Routes>
            </main>
          </div>
        </CartProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
