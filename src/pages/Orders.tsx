// Helper component for order items
function OrderItemWithSas({ item }: { item: any }) {
  // thumbnailUrl is a backend API URL — use directly (not a blob name for useSasUrl)
  const thumbnailUrl = item.photo?.thumbnailUrl || null;
  const cropData = item.cropData
    ? (typeof item.cropData === 'string' ? JSON.parse(item.cropData) : item.cropData)
    : null;

  // Compute crop box position as % of original photo dimensions
  const photoW = item.photo?.width;
  const photoH = item.photo?.height;
  let cropStyle: React.CSSProperties | null = null;
  if (cropData && photoW && photoH) {
    cropStyle = {
      left:   `${(cropData.x / photoW) * 100}%`,
      top:    `${(cropData.y / photoH) * 100}%`,
      width:  `${(cropData.width  / photoW) * 100}%`,
      height: `${(cropData.height / photoH) * 100}%`,
    };
  }

  const cropDebugText = cropData
    ? `x:${Math.round(cropData.x)} y:${Math.round(cropData.y)} w:${Math.round(cropData.width)} h:${Math.round(cropData.height)} sx:${Number(cropData.scaleX || 1).toFixed(2)} sy:${Number(cropData.scaleY || 1).toFixed(2)}`
    : null;

  // Only show crop debug info for studio/admin users (not customers)
  // Assume a prop or context isAdminOrStudio, fallback to hiding for customers
  const isAdminOrStudio = false; // Set to true if you have a way to detect admin/studio
  return (
    <div className="order-item">
      <div className="item-image-container">
        {thumbnailUrl ? (
          // Always use SAS-protected URL for Azure blobs
          <img src={useSasUrl(thumbnailUrl)} alt={item.photo?.fileName || 'Photo'} className="item-image" />
        ) : (
          <div className="item-image-placeholder">No Image</div>
        )}
        {cropStyle && <div className="crop-box-overlay" style={cropStyle} />}
        {cropData && <div className="crop-indicator">Cropped</div>}
      </div>
      <div className="item-details">
        <h4 className="item-product-name" title={item.productName}>
          {item.productName || 'Unknown Product'}
        </h4>
        <p className="item-size-name">{item.productSizeName || 'Unknown Size'}</p>
        <div>
          <span className="item-quantity">Qty: {item.quantity}</span>
        </div>
        {/* Only show crop debug for admin/studio */}
        {isAdminOrStudio && cropDebugText && <p className="item-size-name">Crop: {cropDebugText}</p>}
        <p className="item-price">${(item.price * item.quantity).toFixed(2)}</p>
        {/* Show download link for digital products */}
        {item.isDigital && Array.isArray(item.downloadUrls) && item.downloadUrls.length > 0 && (
          <div className="digital-download-link">
            {item.downloadUrls.map((dl: any, idx: number) => (
              <a
                key={dl.url || idx}
                href={dl.url}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-primary"
                style={{ display: 'block', marginBottom: 4 }}
              >
                Download Digital File{item.downloadUrls.length > 1 ? ` #${idx + 1}` : ''}
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Order } from '../types';
import { orderService } from '../services/orderService';
import './Orders.css';
// import TopNavbar from '../components/TopNavbar';

const Orders: React.FC = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const [loadingOrderDetails, setLoadingOrderDetails] = useState<Record<number, boolean>>({});
  const location = useLocation();
  const successMessage = location.state?.message;

  useEffect(() => {
    loadOrders();
  }, []);

  const loadOrders = async () => {
    try {
      const data = await orderService.getOrders({ includeItems: false, limit: 100 });
      setOrders(data);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load orders');
    } finally {
      setLoading(false);
    }
  };

  const ensureOrderDetailsLoaded = async (orderId: number) => {
    const existing = orders.find((entry) => entry.id === orderId);
    if (existing && Array.isArray(existing.items) && existing.items.length > 0) {
      return;
    }
    if (loadingOrderDetails[orderId]) {
      return;
    }

    setLoadingOrderDetails((current) => ({
      ...current,
      [orderId]: true,
    }));

    try {
      const detail = await orderService.getOrderDetails(orderId);
      setOrders((current) => current.map((entry) => (entry.id === orderId ? { ...entry, ...detail } : entry)));
    } catch (err: any) {
      setError(err?.response?.data?.message || `Failed to load order #${orderId} details`);
    } finally {
      setLoadingOrderDetails((current) => {
        const next = { ...current };
        delete next[orderId];
        return next;
      });
    }
  };

  const toggleOrderDetails = async (orderId: number) => {
    if (selectedOrderId === orderId) {
      setSelectedOrderId(null);
      return;
    }
    setSelectedOrderId(orderId);
    await ensureOrderDetailsLoaded(orderId);
  };

  if (loading) {
    return <div className="loading">Loading orders...</div>;
  }

  return (
    <>
      {/* <TopNavbar /> */}
      <div className="orders-container">
        <div className="orders-header">
          <h1>Order History</h1>
          <p>View your past orders</p>
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
              <div key={order.id} className="order-card">
                <div className="order-header">
                  <div>
                    <h3>Order #{order.id}</h3>
                    <p className="order-date">
                      {new Date(order.orderDate).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="order-status">
                    <span className={`status-badge status-${(order.status || 'pending').toLowerCase()}`}>
                      {order.status || 'Pending'}
                    </span>
                    <p className="order-total">${Number(order.totalAmount || 0).toFixed(2)}</p>
                    <button
                      type="button"
                      className="order-toggle-button"
                      onClick={() => {
                        void toggleOrderDetails(order.id);
                      }}
                    >
                      {selectedOrderId === order.id ? 'Hide details' : 'View details'}
                    </button>
                  </div>
                </div>
                {selectedOrderId === order.id && (
                  <>
                    {loadingOrderDetails[order.id] ? (
                      <div className="loading" style={{ paddingTop: '1rem' }}>Loading order details...</div>
                    ) : (
                      <>
                        <div className="order-items">
                          {(order.items || []).map((item) => {
                            // No need to compute downloadUrl; use item.downloadUrls directly
                            return <OrderItemWithSas key={item.id} item={item} />;
                          })}
                        </div>
                        <div className="order-pricing-summary">
                          {order.subtotal != null && (
                            <div className="pricing-row">
                              <span>Subtotal</span>
                              <span>${Number(order.subtotal).toFixed(2)}</span>
                            </div>
                          )}
                          {Number(order.shippingCost) > 0 && (
                            <div className="pricing-row">
                              <span>Shipping</span>
                              <span>${Number(order.shippingCost).toFixed(2)}</span>
                            </div>
                          )}
                          {Number(order.taxAmount) > 0 && (
                            <div className="pricing-row">
                              <span>Tax</span>
                              <span>${Number(order.taxAmount).toFixed(2)}</span>
                            </div>
                          )}
                          <div className="pricing-row pricing-total-row">
                            <span>Total Charged</span>
                            <span>${Number(order.totalAmount || 0).toFixed(2)}</span>
                          </div>
                        </div>
                      </>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
};

export default Orders;
