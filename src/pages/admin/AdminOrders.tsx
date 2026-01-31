import React, { useEffect, useState } from 'react';
import { Order } from '../../types';
import { adminMockApi } from '../../services/adminMockApi';
import api from '../../services/api';
import { isUseMockApi } from '../../utils/mockApiConfig';

const AdminOrders: React.FC = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [activeTab, setActiveTab] = useState<'all' | 'batch'>('all');
  const [batchAddress, setBatchAddress] = useState({
    fullName: '',
    addressLine1: '',
    addressLine2: '',
    city: '',
    state: '',
    zipCode: '',
    country: 'United States',
    email: ''
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadOrders();
  }, []);

  const loadOrders = async () => {
    try {
      
      
      if (isUseMockApi()) {
        const data = await adminMockApi.orders.getAll();
        setOrders(data);
      } else {
        // Fetch all orders from backend (admin endpoint)
        const response = await api.get<Order[]>('/orders/admin/all-orders');
        setOrders(response.data);
      }
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

  const handleSubmitBatchOrders = async () => {
    // Validate batch address
    if (!batchAddress.fullName || !batchAddress.addressLine1 || !batchAddress.city || 
        !batchAddress.state || !batchAddress.zipCode || !batchAddress.email) {
      alert('Please fill in all required batch shipping address fields');
      return;
    }

    const batchOrders = orders.filter(o => o.isBatch && !o.labSubmitted);
    if (batchOrders.length === 0) {
      alert('No batch orders to submit');
      return;
    }

    if (!confirm(`Submit ${batchOrders.length} batch order(s) to lab?`)) {
      return;
    }

    setSubmitting(true);
    try {
      const orderIds = batchOrders.map(o => o.id);
      await adminMockApi.orders.submitBatchToLab(orderIds, batchAddress);
      alert('Batch orders submitted successfully!');
      loadOrders(); // Refresh the list
      
      // Reset form
      setBatchAddress({
        fullName: '',
        addressLine1: '',
        addressLine2: '',
        city: '',
        state: '',
        zipCode: '',
        country: 'United States',
        email: ''
      });
    } catch (error) {
      console.error('Failed to submit batch orders:', error);
      alert('Failed to submit batch orders');
    } finally {
      setSubmitting(false);
    }
  };

  const filteredOrders = activeTab === 'batch'
    ? orders.filter(order => order.isBatch && !order.labSubmitted)
    : selectedStatus === 'all'
      ? orders
      : orders.filter(order => order.status.toLowerCase() === selectedStatus);

  if (loading) {
    return <div className="loading">Loading orders...</div>;
  }

  return (
    <div className="admin-page">
      <div className="page-header">
        <h1>Manage Orders</h1>
        <div className="tab-buttons" style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
          <button 
            className={activeTab === 'all' ? 'btn-primary' : 'btn-secondary'}
            onClick={() => setActiveTab('all')}
          >
            All Orders
          </button>
          <button 
            className={activeTab === 'batch' ? 'btn-primary' : 'btn-secondary'}
            onClick={() => setActiveTab('batch')}
          >
            Batch Orders ({orders.filter(o => o.isBatch && !o.labSubmitted).length})
          </button>
        </div>
        
        {activeTab === 'all' && (
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
        )}
      </div>

      {activeTab === 'batch' && (
        <div className="batch-submission-panel" style={{ 
          background: '#f8f9fa', 
          padding: '20px', 
          borderRadius: '8px', 
          marginBottom: '20px' 
        }}>
          <h2>Batch Shipping Address</h2>
          <p style={{ color: '#666', marginBottom: '15px' }}>
            Enter the batch shipping address to submit all pending batch orders to the lab
          </p>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
            <div>
              <label>Full Name *</label>
              <input
                type="text"
                value={batchAddress.fullName}
                onChange={(e) => setBatchAddress({...batchAddress, fullName: e.target.value})}
                placeholder="Full Name"
              />
            </div>
            
            <div>
              <label>Email *</label>
              <input
                type="email"
                value={batchAddress.email}
                onChange={(e) => setBatchAddress({...batchAddress, email: e.target.value})}
                placeholder="email@example.com"
              />
            </div>
            
            <div style={{ gridColumn: '1 / -1' }}>
              <label>Address Line 1 *</label>
              <input
                type="text"
                value={batchAddress.addressLine1}
                onChange={(e) => setBatchAddress({...batchAddress, addressLine1: e.target.value})}
                placeholder="Street address"
              />
            </div>
            
            <div style={{ gridColumn: '1 / -1' }}>
              <label>Address Line 2</label>
              <input
                type="text"
                value={batchAddress.addressLine2}
                onChange={(e) => setBatchAddress({...batchAddress, addressLine2: e.target.value})}
                placeholder="Apartment, suite, etc. (optional)"
              />
            </div>
            
            <div>
              <label>City *</label>
              <input
                type="text"
                value={batchAddress.city}
                onChange={(e) => setBatchAddress({...batchAddress, city: e.target.value})}
                placeholder="City"
              />
            </div>
            
            <div>
              <label>State *</label>
              <input
                type="text"
                value={batchAddress.state}
                onChange={(e) => setBatchAddress({...batchAddress, state: e.target.value})}
                placeholder="State"
              />
            </div>
            
            <div>
              <label>Zip Code *</label>
              <input
                type="text"
                value={batchAddress.zipCode}
                onChange={(e) => setBatchAddress({...batchAddress, zipCode: e.target.value})}
                placeholder="12345"
              />
            </div>
            
            <div>
              <label>Country *</label>
              <input
                type="text"
                value={batchAddress.country}
                onChange={(e) => setBatchAddress({...batchAddress, country: e.target.value})}
                placeholder="United States"
              />
            </div>
          </div>
          
          <button 
            className="btn-primary" 
            onClick={handleSubmitBatchOrders}
            disabled={submitting || filteredOrders.length === 0}
            style={{ marginTop: '20px', width: '100%' }}
          >
            {submitting ? 'Submitting...' : `Submit ${filteredOrders.length} Batch Order(s) to Lab`}
          </button>
        </div>
      )}

      {filteredOrders.length === 0 ? (
        <div className="empty-state">
          {activeTab === 'batch' ? 'No pending batch orders' : 'No orders found'}
        </div>
      ) : (
        <div className="orders-list">
          {filteredOrders.map((order) => (
            <div key={order.id} className="admin-order-card">
              <div className="order-header">
                <div>
                  <h3>
                    Order #{order.id}
                    {order.isBatch && (
                      <span className="badge" style={{ marginLeft: '10px', background: '#ffc107', color: '#000' }}>
                        Batch Order
                      </span>
                    )}
                    {order.labSubmitted && (
                      <span className="badge" style={{ marginLeft: '10px', background: '#28a745', color: '#fff' }}>
                        Submitted to Lab
                      </span>
                    )}
                  </h3>
                  <p className="order-date">
                    {new Date(order.orderDate).toLocaleDateString()}
                  </p>
                  {order.isBatch && !order.labSubmitted && (
                    <p style={{ color: '#856404', fontSize: '0.9em', marginTop: '5px' }}>
                      ⚠️ Awaiting batch submission
                    </p>
                  )}
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
              <div className="order-shipping-info" style={{ 
                padding: '10px', 
                background: '#f8f9fa', 
                borderRadius: '4px', 
                marginBottom: '10px',
                fontSize: '0.9em'
              }}>
                <strong>Ship to:</strong>
                <p>{order.shippingAddress.fullName}</p>
                <p>{order.shippingAddress.addressLine1}</p>
                {order.shippingAddress.addressLine2 && <p>{order.shippingAddress.addressLine2}</p>}
                <p>{order.shippingAddress.city}, {order.shippingAddress.state} {order.shippingAddress.zipCode}</p>
                {order.batchShippingAddress && (
                  <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid #dee2e6' }}>
                    <strong>Batch Shipping Address Used:</strong>
                    <p>{order.batchShippingAddress.fullName}</p>
                    <p>{order.batchShippingAddress.addressLine1}</p>
                    {order.batchShippingAddress.addressLine2 && <p>{order.batchShippingAddress.addressLine2}</p>}
                    <p>{order.batchShippingAddress.city}, {order.batchShippingAddress.state} {order.batchShippingAddress.zipCode}</p>
                  </div>
                )}
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
