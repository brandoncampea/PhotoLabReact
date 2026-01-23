import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Order } from '../types';
import { orderService } from '../services/orderService';

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
    <div className="page-container">
      <div className="page-header">
        <h1>Order History</h1>
        <p>View your past orders</p>
      </div>

      {successMessage && (
        <div className="success-message">{successMessage}</div>
      )}

      {error && <div className="error-message">{error}</div>}

      {orders.length === 0 ? (
        <div className="empty-state">
          <p>No orders yet</p>
        </div>
      ) : (
        <div className="orders-list">
          {orders.map((order) => (
            <div key={order.id} className="order-card">
              <div className="order-header">
                <div>
                  <h3>Order #{order.id}</h3>
                  <p className="order-date">
                    {new Date(order.orderDate).toLocaleDateString()}
                  </p>
                </div>
                <div className="order-status">
                  <span className={`status-badge status-${order.status.toLowerCase()}`}>
                    {order.status}
                  </span>
                  <p className="order-total">${order.totalAmount.toFixed(2)}</p>
                </div>
              </div>
              <div className="order-items">
                {order.items.map((item) => (
                  <div key={item.id} className="order-item">
                    <img src={item.photo.thumbnailUrl} alt={item.photo.fileName} />
                    <div className="order-item-info">
                      <p>{item.photo.fileName}</p>
                      <p className="order-item-quantity">Quantity: {item.quantity}</p>
                    </div>
                    <p className="order-item-price">${item.price.toFixed(2)}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Orders;
