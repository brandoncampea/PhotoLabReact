import React, { useEffect, useState } from 'react';
import { Order } from '../../types';
import api from '../../services/api';

type BatchQueueSummary = {
  totalQueued: number;
  eligibleCount: number;
  eligibleOrderIds: number[];
  shouldPromptSubmission: boolean;
  nextBatchDate: string | null;
  labOptions: string[];
};

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
  const [selectedLab, setSelectedLab] = useState('whcc');
  const [batchQueueSummary, setBatchQueueSummary] = useState<BatchQueueSummary | null>(null);

  useEffect(() => {
    loadOrders();
  }, []);

  const loadOrders = async () => {
    try {
      const [ordersResponse, queueResponse] = await Promise.all([
        api.get<Order[]>('/orders/admin/all-orders'),
        api.get<BatchQueueSummary>('/orders/admin/batch-queue'),
      ]);
      setOrders(ordersResponse.data);
      setBatchQueueSummary(queueResponse.data);

      if (queueResponse.data.labOptions?.length > 0 && !queueResponse.data.labOptions.includes(selectedLab)) {
        setSelectedLab(queueResponse.data.labOptions[0]);
      }
    } catch (error) {
      console.error('Failed to load orders:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (orderId: number, newStatus: string) => {
    try {
      await api.patch(`/orders/admin/${orderId}/status`, { status: newStatus });
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

    const eligibleOrderIds = batchQueueSummary?.eligibleOrderIds || [];
    if (eligibleOrderIds.length === 0) {
      alert('No batch orders to submit');
      return;
    }

    if (!selectedLab) {
      alert('Please select a photo lab before submitting batch orders.');
      return;
    }

    if (!confirm(`Submit ${eligibleOrderIds.length} batch order(s) to ${selectedLab.toUpperCase()}?`)) {
      return;
    }

    setSubmitting(true);
    try {
      await api.post('/orders/admin/submit-batch', { orderIds: eligibleOrderIds, batchAddress, selectedLab });
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
        <div className="batch-submission-panel admin-section-card" style={{ marginBottom: '20px' }}>
          <h2>Batch Queue</h2>
          <p className="muted-text" style={{ marginBottom: '10px' }}>
            Queued: <strong>{batchQueueSummary?.totalQueued || 0}</strong> • Ready to submit today: <strong>{batchQueueSummary?.eligibleCount || 0}</strong>
          </p>
          {batchQueueSummary?.shouldPromptSubmission ? (
            <div className="info-box-blue" style={{ marginBottom: '15px' }}>
              📣 Batch date reached. Submit ready orders to your selected lab.
            </div>
          ) : (
            <div className="admin-summary-box" style={{ marginBottom: '15px' }}>
              Next batch date: {batchQueueSummary?.nextBatchDate ? new Date(batchQueueSummary.nextBatchDate).toLocaleDateString() : 'Not scheduled'}
            </div>
          )}

          <div style={{ marginBottom: '20px' }}>
            <label>Photo Lab *</label>
            <select
              value={selectedLab}
              onChange={(e) => setSelectedLab(e.target.value)}
              style={{ width: '100%', marginTop: '6px' }}
            >
              {(batchQueueSummary?.labOptions || ['whcc', 'mpix', 'roes']).map((lab) => (
                <option key={lab} value={lab}>{lab.toUpperCase()}</option>
              ))}
            </select>
          </div>

          <h2>Batch Shipping Address</h2>
          <p className="muted-text" style={{ marginBottom: '15px' }}>
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
            disabled={submitting || (batchQueueSummary?.eligibleCount || 0) === 0}
            style={{ marginTop: '20px', width: '100%' }}
          >
            {submitting ? 'Submitting...' : `Submit ${(batchQueueSummary?.eligibleCount || 0)} Ready Batch Order(s) to ${selectedLab.toUpperCase()}`}
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
                      <span className="badge badge-warning" style={{ marginLeft: '10px' }}>
                        Batch Order
                      </span>
                    )}
                    {order.labSubmitted && (
                      <span className="badge badge-success" style={{ marginLeft: '10px' }}>
                        Submitted to Lab
                      </span>
                    )}
                  </h3>
                  <p className="order-date">
                    {new Date(order.orderDate).toLocaleDateString()}
                  </p>
                  {order.isBatch && !order.labSubmitted && (
                    <p className="warning-text" style={{ fontSize: '0.9em', marginTop: '5px' }}>
                      ⚠️ Awaiting batch submission
                    </p>
                  )}
                  {order.batchReadyDate && !order.labSubmitted && (
                    <p className="muted-text" style={{ fontSize: '0.85em', marginTop: '4px' }}>
                      Batch date: {new Date(order.batchReadyDate).toLocaleDateString()}
                    </p>
                  )}
                  {order.batchLabVendor && (
                    <p className="muted-text" style={{ fontSize: '0.85em', marginTop: '4px' }}>
                      Lab: {order.batchLabVendor.toUpperCase()}
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
              <div className="order-shipping-info admin-summary-box" style={{ marginBottom: '10px', fontSize: '0.9em' }}>
                <strong>Ship to:</strong>
                <p>{order.shippingAddress?.fullName || 'N/A'}</p>
                <p>{order.shippingAddress?.addressLine1 || 'N/A'}</p>
                {order.shippingAddress?.addressLine2 && <p>{order.shippingAddress.addressLine2}</p>}
                <p>{order.shippingAddress?.city || ''}{order.shippingAddress?.city ? ',' : ''} {order.shippingAddress?.state || ''} {order.shippingAddress?.zipCode || ''}</p>
                {order.batchShippingAddress && (
                  <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid var(--border-color)' }}>
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
