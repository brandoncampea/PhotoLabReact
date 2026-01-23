import React, { useEffect, useState } from 'react';
import { Order } from '../../types';
import { adminMockApi } from '../../services/adminMockApi';

const AdminOrders: React.FC = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStatus, setSelectedStatus] = useState('all');

  useEffect(() => {
    loadOrders();
  }, []);

  const loadOrders = async () => {
    try {
      const data = await adminMockApi.orders.getAll();
      setOrders(data);
    } catch (error) {
      console.error('Failed to load orders:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (orderId: number, newStatus: string) => {
    try {
      await adminMockApi.orders.updateStatus(orderId, newStatus);
      loadOrders();
    } catch (error) {
      console.error('Failed to update order status:', error);
    }
  };

  const filteredOrders = selectedStatus === 'all'
    ? orders
    : orders.filter(order => order.status.toLowerCase() === selectedStatus);

  if (loading) {
    return <div className="loading">Loading orders...</div>;
  }

  return (
    <div className="admin-page">
      <div className="page-header">
        <h1>Manage Orders</h1>
        <select
          value={selectedStatus}
          onChange={(e) => setSelectedStatus(e.target.value)}
          className="status-filter"
        >
          <option value="all">All Orders</option>
          <option value="pending">Pending</option>
          <option value="processing">Processing</option>
          <option value="completed">Completed</option>
          <option value="shipped">Shipped</option>
        </select>
      </div>

      {filteredOrders.length === 0 ? (
        <div className="empty-state">No orders found</div>
      ) : (
        <div className="orders-list">
          {filteredOrders.map((order) => (
            <div key={order.id} className="admin-order-card">
              <div className="order-header">
                <div>
                  <h3>Order #{order.id}</h3>
                  <p className="order-date">
                    {new Date(order.orderDate).toLocaleDateString()}
                  </p>
                </div>
                <div className="order-status">
                  <select
                    value={order.status}
                    onChange={(e) => handleStatusChange(order.id, e.target.value)}
                    className="status-select"
                  >
                    <option value="Pending">Pending</option>
                    <option value="Processing">Processing</option>
                    <option value="Completed">Completed</option>
                    <option value="Shipped">Shipped</option>
                  </select>
                  <p className="order-total">${order.totalAmount.toFixed(2)}</p>
                </div>
              </div>
              <div className="order-items">
                {order.items.map((item) => (
                  <div key={item.id} className="order-item">
                    <img src={item.photo.thumbnailUrl} alt={item.photo.fileName} />
                    <div className="order-item-info">
                      <p>{item.photo.fileName}</p>
                      <p className="order-item-quantity">Qty: {item.quantity}</p>
                      {item.cropData && <span className="badge">Cropped</span>}
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

export default AdminOrders;
