import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Order, BatchQueueSummary, ShippingAddress } from '../../types';
import { orderService } from '../../services/orderService';
import { shippingService } from '../../services/shippingService';
import AdminLayout from '../../components/AdminLayout';
import './AdminOrders.css';

function AdminOrderItemCard({ item }: { item: any }) {
  const thumbnailUrl = item.photo?.thumbnailUrl || null;
  const cropData = item.cropData
    ? (typeof item.cropData === 'string' ? JSON.parse(item.cropData) : item.cropData)
    : null;
  const photoWidth = item.photo?.width;
  const photoHeight = item.photo?.height;

  let cropStyle: React.CSSProperties | null = null;
  if (cropData && photoWidth && photoHeight) {
    cropStyle = {
      left: `${(cropData.x / photoWidth) * 100}%`,
      top: `${(cropData.y / photoHeight) * 100}%`,
      width: `${(cropData.width / photoWidth) * 100}%`,
      height: `${(cropData.height / photoHeight) * 100}%`,
    };
  }

  return (
    <div className="admin-order-item-card">
      <div className="admin-order-item-image-container">
        {thumbnailUrl ? (
          <img src={thumbnailUrl} alt={item.photo?.fileName || 'Photo'} className="admin-order-item-image" />
        ) : (
          <div className="admin-order-item-image-placeholder">No Image</div>
        )}
        {cropStyle && <div className="admin-order-crop-box" style={cropStyle} />}
        {cropData && <div className="admin-order-crop-indicator">Cropped</div>}
      </div>
      <div className="admin-order-item-details">
        <h4>{item.productName || 'Unknown Product'}</h4>
        <p className="admin-order-item-size">{item.productSizeName || 'Unknown Size'}</p>
        <div className="admin-order-item-meta-row">
          <span className="admin-order-qty-pill">Qty: {item.quantity}</span>
          <span className="admin-order-item-price">${Number((item.price || 0) * (item.quantity || 0)).toFixed(2)}</span>
        </div>
      </div>
    </div>
  );
}

const AdminOrders: React.FC = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [batchQueue, setBatchQueue] = useState<BatchQueueSummary | null>(null);
  const [selectedLab, setSelectedLab] = useState('roes');
  const [batchAddress, setBatchAddress] = useState<ShippingAddress>({
    fullName: '',
    addressLine1: '',
    addressLine2: '',
    city: '',
    state: '',
    zipCode: '',
    country: 'US',
    email: '',
    phone: '',
  });
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const location = useLocation();
  const navigate = useNavigate();

  const updateBatchAddressField = (field: keyof ShippingAddress, value: string) => {
    setBatchAddress((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const [ordersData, queueData, config] = await Promise.all([
        orderService.getAdminOrders(),
        orderService.getBatchQueue(),
        shippingService.getConfig(),
      ]);
      setOrders(ordersData || []);
      setBatchQueue(queueData);
      setSelectedLab(queueData.labOptions?.[0] || 'roes');
      const configuredAddress = queueData.batchShippingAddress || config.batchShippingAddress;
      if (configuredAddress) {
        setBatchAddress({
          fullName: configuredAddress.fullName || '',
          addressLine1: configuredAddress.addressLine1 || '',
          addressLine2: configuredAddress.addressLine2 || '',
          city: configuredAddress.city || '',
          state: configuredAddress.state || '',
          zipCode: configuredAddress.zipCode || '',
          country: configuredAddress.country || 'US',
          email: configuredAddress.email || '',
          phone: configuredAddress.phone || '',
        });
      }
    } catch {
      setMessage('Failed to load orders');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSubmitBatch = async () => {
    if (!batchQueue?.eligibleOrderIds.length) {
      setMessage('No eligible batch orders are ready to release.');
      return;
    }

    try {
      const result = await orderService.submitBatch(batchQueue.eligibleOrderIds, batchAddress, selectedLab);
      setMessage(`Released ${result.updatedCount} batch order(s) to ${selectedLab.toUpperCase()}.`);
      await loadData();
    } catch {
      setMessage('Failed to release batch orders');
    }
  };

  const queuedBatchOrders = orders.filter((order) => order.isBatch && !order.labSubmitted);
  const recentDirectOrders = orders.filter((order) => !order.isBatch || order.labSubmitted);
  const visibleOrders = [...queuedBatchOrders, ...recentDirectOrders];
  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filteredOrders = normalizedQuery
    ? visibleOrders.filter((order) => {
        const shipping = order.shippingAddress || ({} as ShippingAddress);
        const searchableText = [
          shipping.fullName,
          shipping.email,
          shipping.addressLine1,
          shipping.addressLine2,
          shipping.city,
          shipping.state,
          shipping.zipCode,
          shipping.country,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return searchableText.includes(normalizedQuery);
      })
    : visibleOrders;
  const showWhccColumn = visibleOrders.some(
    (order) => order.whccConfirmationId || order.whccImportResponse || order.whccSubmitResponse || order.whccLastError || order.trackingNumber || order.whccWebhookEvent
  );
  const tableColumnCount = showWhccColumn ? 7 : 6;

  useEffect(() => {
    const queryOrderId = Number(new URLSearchParams(location.search).get('orderId'));
    if (Number.isInteger(queryOrderId) && queryOrderId > 0) {
      setSelectedOrderId(queryOrderId);
      return;
    }
    setSelectedOrderId(null);
  }, [location.search]);

  const updateSelectedOrder = (orderId: number | null) => {
    const params = new URLSearchParams(location.search);
    if (orderId) {
      params.set('orderId', String(orderId));
      setSelectedOrderId(orderId);
    } else {
      params.delete('orderId');
      setSelectedOrderId(null);
    }
    navigate({ pathname: location.pathname, search: params.toString() ? `?${params.toString()}` : '' }, { replace: true });
  };

  const handleRowSelect = (orderId: number) => {
    if (selectedOrderId === orderId) {
      updateSelectedOrder(null);
      return;
    }
    updateSelectedOrder(orderId);
  };

  const renderOrderDetails = (order: Order) => (
    <div className="admin-order-detail-panel">
      {(() => {
        const studioRevenue = (order.items || []).reduce(
          (sum, item) => sum + (Number(item.price) || 0) * (Number(item.quantity) || 0),
          0
        );
        const baseRevenue = (order.items || []).reduce(
          (sum, item) => sum + (Number(item.basePrice) || 0) * (Number(item.quantity) || 0),
          0
        );
        const stripeFeeAmount = Number(order.stripeFeeAmount) || 0;
        const grossStudioMarkup = studioRevenue - baseRevenue;
        const estimatedStudioProfit = grossStudioMarkup - stripeFeeAmount;

        return (
          <>
      <div className="admin-order-detail-header">
        <div>
          <h3>Order #{order.id}</h3>
          <p>{new Date(order.orderDate).toLocaleString()}</p>
        </div>
        <button type="button" className="admin-order-detail-close" onClick={() => updateSelectedOrder(null)}>
          Close
        </button>
      </div>

      <div className="admin-order-detail-meta-grid">
        <div className="admin-order-detail-box">
          <strong>Customer</strong>
          <span>{order.shippingAddress?.fullName || 'Unknown customer'}</span>
          <span>{order.shippingAddress?.email || 'No email'}</span>
          <span>{order.shippingAddress?.phone || 'No phone'}</span>
        </div>
        <div className="admin-order-detail-box">
          <strong>Address</strong>
          <span>{order.shippingAddress?.addressLine1 || 'No address line 1'}</span>
          {order.shippingAddress?.addressLine2 ? <span>{order.shippingAddress.addressLine2}</span> : null}
          <span>
            {[order.shippingAddress?.city, order.shippingAddress?.state, order.shippingAddress?.zipCode].filter(Boolean).join(', ')}
          </span>
          <span>{order.shippingAddress?.country || 'US'}</span>
        </div>
        <div className="admin-order-detail-box">
          <strong>Shipping & WHCC</strong>
          <span>{order.shippingOption || 'direct'}</span>
          <span>{order.shippingCarrier || 'Carrier pending'}</span>
          {order.trackingNumber ? <span>Tracking: {order.trackingNumber}</span> : <span>Tracking pending</span>}
          {order.trackingUrl ? (
            <a className="whcc-link" href={order.trackingUrl} target="_blank" rel="noopener noreferrer">
              Track package
            </a>
          ) : null}
          <span>{order.whccWebhookEvent || order.whccWebhookStatus || 'No webhook yet'}</span>
        </div>
      </div>

      <div className="admin-order-items-grid">
        {order.items.map((item) => (
          <AdminOrderItemCard key={item.id} item={item} />
        ))}
      </div>

      <div className="admin-order-pricing-summary">
        {order.subtotal != null && (
          <div className="admin-order-pricing-row"><span>Subtotal</span><span>${Number(order.subtotal).toFixed(2)}</span></div>
        )}
        {Number(order.shippingCost) > 0 && (
          <div className="admin-order-pricing-row"><span>Shipping</span><span>${Number(order.shippingCost).toFixed(2)}</span></div>
        )}
        {Number(order.taxAmount) > 0 && (
          <div className="admin-order-pricing-row"><span>Tax</span><span>${Number(order.taxAmount).toFixed(2)}</span></div>
        )}
        <div className="admin-order-pricing-row admin-order-pricing-total"><span>Total Charged</span><span>${Number(order.totalAmount).toFixed(2)}</span></div>
        <div className="admin-order-pricing-row"><span>Stripe Fees</span><span>${stripeFeeAmount.toFixed(2)}</span></div>
        <div className="admin-order-pricing-row"><span>Gross Markup</span><span>${grossStudioMarkup.toFixed(2)}</span></div>
        <div className="admin-order-pricing-row admin-order-profit-row"><span>Estimated Profit</span><span>${estimatedStudioProfit.toFixed(2)}</span></div>
      </div>

      {order.excludedItemsNote ? <p className="admin-order-profit-note">{order.excludedItemsNote}</p> : null}
          </>
        );
      })()}
    </div>
  );

  return (
    <AdminLayout>
      <div className="admin-orders-container">
        <div className="admin-orders-header">
          <h1>Orders</h1>
        </div>
        {message && <div className="admin-orders-message">{message}</div>}

        <div className="batch-queue-section">
          <h2>Batch Shipping Queue</h2>
          {loading ? (
            <div className="loading-state">Loading batch queue...</div>
          ) : !batchQueue ? (
            <p className="empty-state">Batch queue unavailable.</p>
          ) : (
            <>
              <div className="batch-stats">
                <div className="batch-stat-card">
                  <strong>Total queued</strong>
                  <div>{batchQueue.totalQueued}</div>
                </div>
                <div className="batch-stat-card">
                  <strong>Eligible now</strong>
                  <div>{batchQueue.eligibleCount}</div>
                </div>
                <div className="batch-stat-card">
                  <strong>Next batch date</strong>
                  <div>{batchQueue.nextBatchDate ? new Date(batchQueue.nextBatchDate).toLocaleString() : 'Ready now'}</div>
                </div>
              </div>

              <div className="batch-address-section">
                <h3>Shared Batch Address</h3>
                <div className="address-grid">
                  <div className="form-group">
                    <label htmlFor="batchFullName">Recipient / Studio Name</label>
                    <input id="batchFullName" className="input" value={batchAddress.fullName} onChange={(e) => updateBatchAddressField('fullName', e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label htmlFor="batchEmail">Email</label>
                    <input id="batchEmail" className="input" value={batchAddress.email} onChange={(e) => updateBatchAddressField('email', e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label htmlFor="batchAddressLine1">Address Line 1</label>
                    <input id="batchAddressLine1" className="input" value={batchAddress.addressLine1} onChange={(e) => updateBatchAddressField('addressLine1', e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label htmlFor="batchAddressLine2">Address Line 2</label>
                    <input id="batchAddressLine2" className="input" value={batchAddress.addressLine2 || ''} onChange={(e) => updateBatchAddressField('addressLine2', e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label htmlFor="batchCity">City</label>
                    <input id="batchCity" className="input" value={batchAddress.city} onChange={(e) => updateBatchAddressField('city', e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label htmlFor="batchState">State</label>
                    <input id="batchState" className="input" value={batchAddress.state} onChange={(e) => updateBatchAddressField('state', e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label htmlFor="batchZipCode">Zip Code</label>
                    <input id="batchZipCode" className="input" value={batchAddress.zipCode} onChange={(e) => updateBatchAddressField('zipCode', e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label htmlFor="batchCountry">Country</label>
                    <input id="batchCountry" className="input" value={batchAddress.country} onChange={(e) => updateBatchAddressField('country', e.target.value)} />
                  </div>
                </div>
              </div>

              <button className="batch-action-button" onClick={handleSubmitBatch} disabled={!batchQueue.eligibleOrderIds.length}>
                Release Eligible Batch Orders
              </button>

              <div className="orders-table-container">
                {batchQueue.orders.length === 0 ? (
                  <p className="empty-state">No queued batch orders.</p>
                ) : (
                  <table className="orders-table">
                    <thead>
                      <tr>
                        <th>Order #</th>
                        <th>Customer</th>
                        <th>Created</th>
                        <th>Ready Date</th>
                        <th>Total</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {batchQueue.orders.map((order) => (
                        <tr key={order.id}>
                          <td><span className="order-id">#{order.id}</span></td>
                          <td>{order.customerName}</td>
                          <td>{new Date(order.createdAt).toLocaleDateString()}</td>
                          <td>{order.batchReadyDate ? new Date(order.batchReadyDate).toLocaleString() : 'Ready now'}</td>
                          <td>${order.totalAmount.toFixed(2)}</td>
                          <td>
                            <span className={`order-status ${order.isEligible ? 'status-eligible' : 'status-waiting'}`}>
                              {order.isEligible ? 'Eligible' : 'Waiting'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          )}
        </div>

        <div className="recent-orders-section">
          <h2>Recent Orders</h2>
          <div className="admin-orders-search-row">
            <input
              type="text"
              className="admin-orders-search-input"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search by customer name, email, or address"
              aria-label="Search orders"
            />
          </div>
          {loading ? (
            <div className="loading-state">Loading orders...</div>
          ) : orders.length === 0 ? (
            <p className="empty-state">No recent orders found.</p>
          ) : filteredOrders.length === 0 ? (
            <p className="empty-state">No orders match your search.</p>
          ) : (
            <div className="orders-table-container">
              <table className="orders-table">
                <thead>
                  <tr>
                    <th>Order #</th>
                    <th>Date</th>
                    <th>Status</th>
                    <th>Customer</th>
                    <th>Total</th>
                    <th>Shipping</th>
                    {showWhccColumn && <th>WHCC</th>}
                  </tr>
                </thead>
                <tbody>
                  {filteredOrders.map((order) => (
                    <React.Fragment key={order.id}>
                      <tr
                        className={`admin-order-row ${selectedOrderId === order.id ? 'admin-order-row-selected' : ''}`}
                        onClick={() => handleRowSelect(order.id)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            handleRowSelect(order.id);
                          }
                        }}
                        role="button"
                        tabIndex={0}
                      >
                        <td><span className="order-id">#{order.id}</span></td>
                        <td>{new Date(order.orderDate).toLocaleDateString()}</td>
                        <td>
                          <span className={`order-status status-${order.status}`}>
                            {order.status}
                          </span>
                        </td>
                        <td>{order.shippingAddress?.fullName || 'Unknown customer'}</td>
                        <td>${order.totalAmount.toFixed(2)}</td>
                        <td>{order.isBatch && !order.labSubmitted ? 'Batch Queue' : order.shippingOption}</td>
                        {showWhccColumn && (
                          <td>
                            <div className="whcc-cell">
                              {order.whccConfirmationId ? (
                                <div className="whcc-pill whcc-success">ID: {order.whccConfirmationId}</div>
                              ) : (
                                <div className="whcc-pill whcc-muted">Not submitted</div>
                              )}
                              {order.whccSubmitResponse?.Received && (
                                <div className="whcc-meta">Submitted: {String(order.whccSubmitResponse.Received)}</div>
                              )}
                              {order.whccSubmitResponse?.Confirmation && (
                                <div className="whcc-meta">{String(order.whccSubmitResponse.Confirmation)}</div>
                              )}
                              {order.whccWebhookEvent && <div className="whcc-meta">Event: {order.whccWebhookEvent}</div>}
                              {order.whccWebhookStatus && <div className="whcc-meta">Status: {order.whccWebhookStatus}</div>}
                              {order.whccOrderNumber && <div className="whcc-meta">Order #: {order.whccOrderNumber}</div>}
                              {(order.shippingCarrier || order.trackingNumber) && (
                                <div className="whcc-tracking-box">
                                  {order.shippingCarrier && <div className="whcc-meta"><strong>Carrier:</strong> {order.shippingCarrier}</div>}
                                  {order.trackingNumber && <div className="whcc-meta"><strong>Tracking:</strong> {order.trackingNumber}</div>}
                                  {order.shippedAt && <div className="whcc-meta"><strong>Shipped:</strong> {new Date(order.shippedAt).toLocaleString()}</div>}
                                  {order.trackingUrl && (
                                    <a className="whcc-link" href={order.trackingUrl} target="_blank" rel="noopener noreferrer" onClick={(event) => event.stopPropagation()}>
                                      Open tracking
                                    </a>
                                  )}
                                </div>
                              )}
                              {order.whccLastError && <div className="whcc-pill whcc-error">Error stored</div>}
                            </div>
                          </td>
                        )}
                      </tr>

                      {selectedOrderId === order.id && (
                        <tr className="admin-order-details-row">
                          <td colSpan={tableColumnCount}>
                            {renderOrderDetails(order)}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
};

export default AdminOrders;
