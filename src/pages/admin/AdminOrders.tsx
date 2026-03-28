

import React, { useEffect, useState } from 'react';
import { Order } from '../../types';
import { orderService } from '../../services/orderService';
import AdminLayout from '../../components/AdminLayout';

const AdminOrders: React.FC = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchOrders = async () => {
      setLoading(true);
      try {
        const data = await orderService.getAdminOrders();
        setOrders(data || []);
      } catch (e) {
        // handle error
      } finally {
        setLoading(false);
      }
    };
    fetchOrders();
  }, []);

    return (
      <AdminLayout>
        <div className="admin-page dark-bg" style={{ minHeight: '100vh', padding: '2rem' }}>
      <div className="page-header">
        <h1>Orders</h1>
      </div>
      <div className="admin-dashboard-content dark-card" style={{ padding: '2rem', marginTop: '2rem' }}>
        {loading ? (
          <div className="loading">Loading orders...</div>
        ) : orders.length === 0 ? (
          <p style={{ color: '#aaa' }}>No recent orders found.</p>
        ) : (
          <table className="data-table" style={{ width: '100%', background: 'rgba(30,30,40,0.7)', borderRadius: '12px' }}>
            <thead>
              <tr>
                <th>Order #</th>
                <th>Date</th>
                <th>Status</th>
                <th>Customer</th>
                <th>Total</th>
                <th>Shipping</th>
              </tr>
            </thead>
            <tbody>
              {orders.map(order => (
                <tr key={order.id}>
                  <td>{order.id}</td>
                  <td>{new Date(order.orderDate).toLocaleDateString()}</td>
                  <td>{order.status}</td>
                  <td>{order.shippingAddress.fullName}</td>
                  <td>${order.totalAmount.toFixed(2)}</td>
                  <td>{order.shippingOption}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
      </AdminLayout>
  );
};

export default AdminOrders;
