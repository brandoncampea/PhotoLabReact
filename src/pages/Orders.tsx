// Helper component for SAS-protected order items
function OrderItemWithSas({ item }: { item: any }) {
  const sasUrl = useSasUrl(item.photo.thumbnailUrl);
  return <img src={sasUrl || ''} alt={item.photo.fileName} style={{ width: '56px', height: '56px', objectFit: 'cover', borderRadius: '6px', border: '1px solid var(--border-color)' }} />;
}
import React, { useEffect, useState } from 'react';
import { useSasUrl } from '../hooks/useSasUrl';
import { useLocation } from 'react-router-dom';
import { Order } from '../types';
import { orderService } from '../services/orderService';
// import TopNavbar from '../components/TopNavbar';

const Orders: React.FC = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const location = useLocation();
  const successMessage = location.state?.message;

  useEffect(() => {
    loadOrders();
  }, []);

  const loadOrders = async () => {
    try {
      const data = await orderService.getOrders();
      setOrders(data);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load orders');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="loading">Loading orders...</div>;
  }

  return (
    <>
      {/* <TopNavbar /> */}
      <div className="main-content dark-bg orders-full-height">
        <div className="page-header">
          <h1 className="gradient-text">Order History</h1>
          <p className="orders-description text-secondary">View your past orders</p>
        </div>

        {successMessage && (
          <div className="success-message">{successMessage}</div>
        )}

        {error && <div className="orders-error-message">{error}</div>}

        {orders.length === 0 ? (
          <div className="empty-state">
            <p>No orders yet</p>
          </div>
        ) : (
          <div className="orders-list">
            {orders.map((order) => (
              <div key={order.id} className="order-card dark-card">
                <div className="order-header">
                  <div>
                    <h3 className="gradient-text">Order #{order.id}</h3>
                    <p className="order-date text-secondary">
                      {new Date(order.orderDate).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="order-status">
                    <span className={`status-badge status-${(order.status || 'pending').toLowerCase()}`}>
                      {order.status || 'Pending'}
                    </span>
                    <p className="order-total">${order.totalAmount.toFixed(2)}</p>
                  </div>
                </div>
                <div className="order-items">
                  {order.items.map((item) => (
                    <OrderItemWithSas key={item.id} item={item} />
                  ))}

                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
};

export default Orders;
