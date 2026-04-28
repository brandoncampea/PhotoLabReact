
import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Order, BatchQueueSummary, ShippingAddress } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import { orderService } from '../../services/orderService';
import { shippingService } from '../../services/shippingService';
import AdminLayout from '../../components/AdminLayout';
import './AdminOrders.css';
import { useSasUrl } from '../../hooks/useSasUrl';

// ...existing code...



function AdminOrderItemCard({ item }: { item: any }) {
  // Defensive: ensure item fields exist
  const photoId = item.photo?.id;
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

  const cropDebugText = cropData
    ? `x:${Math.round(cropData.x)} y:${Math.round(cropData.y)} w:${Math.round(cropData.width)} h:${Math.round(cropData.height)} sx:${Number(cropData.scaleX || 1).toFixed(2)} sy:${Number(cropData.scaleY || 1).toFixed(2)}`
    : null;

  return (
    <div className="admin-order-item-card">
      <div className="admin-order-item-image-container">
        {photoId ? (
          <img
            src={`/api/photos/${photoId}/asset`}
            alt={item.photo?.fileName || 'Photo'}
            className="admin-order-item-image"
          />
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
        {cropDebugText && <p className="item-size-name" style={{ marginTop: 6 }}>Crop: {cropDebugText}</p>}
      </div>
    </div>
  );
}


const AdminOrders: React.FC = () => {
      // Cancel order submit handler
      const handleSubmitCancelOrder = async () => {
        if (!cancelOrderId) return;
        setCancelLoading(true);
        setCancelError(null);
        try {
          const result = await orderService.cancelOrder(cancelOrderId, cancelReason, cancelRefund);
          if (!result.success) {
            setCancelError(result.message || 'Failed to cancel order.');
            setCancelLoading(false);
            return;
          }
          // Refresh order details
            // Optimistically update local orders state
            setOrders((current) =>
              current.map((entry) =>
                entry.id === cancelOrderId
                  ? { ...entry, status: 'cancelled' }
                  : entry
              )
            );
          setShowCancelDialog(false);
        } catch (err: any) {
          setCancelError(err?.response?.data?.error || err.message || 'Failed to cancel order.');
        } finally {
          setCancelLoading(false);
        }
      };
    // Show cancel dialog for a specific order
    const handleShowCancelDialog = (order: Order) => {
      setCancelOrderId(order.id);
      setShowCancelDialog(true);
      setCancelReason('');
      setCancelRefund(false);
      setCancelError(null);
    };

    // Close cancel dialog
    const handleCloseCancelDialog = () => {
      setShowCancelDialog(false);
      setCancelOrderId(null);
      setCancelReason('');
      setCancelRefund(false);
      setCancelError(null);
    };
  const { user } = useAuth();
  // Cancel Order Dialog State (moved inside component)
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelRefund, setCancelRefund] = useState(false);
  const [cancelOrderId, setCancelOrderId] = useState<number | null>(null);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [batchQueue, setBatchQueue] = useState<BatchQueueSummary | null>(null);
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
  const [whccRetrying, setWhccRetrying] = useState<number | null>(null);
  const [whccRetryMessageByOrder, setWhccRetryMessageByOrder] = useState<Record<number, { tone: 'info' | 'error'; text: string }>>({});
  const [digitalResendingOrderId, setDigitalResendingOrderId] = useState<number | null>(null);
  const [digitalResendMessageByOrder, setDigitalResendMessageByOrder] = useState<Record<number, { tone: 'info' | 'error'; text: string }>>({});
  const [loadingOrderDetails, setLoadingOrderDetails] = useState<Record<number, boolean>>({});
  const [expandedBatchGroups, setExpandedBatchGroups] = useState<Record<string, boolean>>({});
  const [batchReleaseProgress, setBatchReleaseProgress] = useState<{
    active: boolean;
    total: number;
    submitted: number;
    submitting: number;
    failed: number;
    pending: number;
    lastUpdatedAt: string;
  } | null>(null);
  const [batchStatusByOrderId, setBatchStatusByOrderId] = useState<Record<number, 'pending' | 'submitting' | 'submitted' | 'failed'>>({});
  const batchProgressIntervalRef = useRef<number | null>(null);
  const location = useLocation();
  const navigate = useNavigate();

  const stopBatchProgressPolling = () => {
    if (batchProgressIntervalRef.current != null) {
      window.clearInterval(batchProgressIntervalRef.current);
      batchProgressIntervalRef.current = null;
    }
  };

  const refreshBatchProgress = async (trackedOrderIds: number[]) => {
    if (!trackedOrderIds.length) return;

    try {
      const latestOrdersResponse = await orderService.getAdminOrders({ includeItems: false, pageSize: 500 });
      const latestOrders = latestOrdersResponse.orders;
      const trackedSet = new Set(trackedOrderIds);
      const trackedOrders = latestOrders.filter((order) => trackedSet.has(order.id));

      const submitted = trackedOrders.filter((order) => Boolean(order.labSubmitted)).length;
      const failed = trackedOrders.filter((order) => String(order.batchQueueStatus || '').toLowerCase() === 'failed').length;
      const submitting = trackedOrders.filter((order) => String(order.batchQueueStatus || '').toLowerCase() === 'submitting').length;
      const pending = Math.max(0, trackedOrderIds.length - submitted - failed);

      const nextStatusByOrderId: Record<number, 'pending' | 'submitting' | 'submitted' | 'failed'> = {};
      for (const orderId of trackedOrderIds) {
        const latestOrder = trackedOrders.find((entry) => entry.id === orderId);
        if (latestOrder?.labSubmitted) {
          nextStatusByOrderId[orderId] = 'submitted';
        } else if (String(latestOrder?.batchQueueStatus || '').toLowerCase() === 'failed') {
          nextStatusByOrderId[orderId] = 'failed';
        } else if (String(latestOrder?.batchQueueStatus || '').toLowerCase() === 'submitting') {
          nextStatusByOrderId[orderId] = 'submitting';
        } else {
          nextStatusByOrderId[orderId] = 'pending';
        }
      }
      setBatchStatusByOrderId(nextStatusByOrderId);

      setBatchReleaseProgress({
        active: pending > 0,
        total: trackedOrderIds.length,
        submitted,
        submitting,
        failed,
        pending,
        lastUpdatedAt: new Date().toLocaleTimeString(),
      });

      if (pending === 0) {
        stopBatchProgressPolling();
      }
    } catch {
      // Keep existing progress state if polling briefly fails.
    }
  };

  const startBatchProgressPolling = (trackedOrderIds: number[]) => {
    stopBatchProgressPolling();
    setBatchStatusByOrderId(Object.fromEntries(trackedOrderIds.map((orderId) => [orderId, 'pending'])) as Record<number, 'pending' | 'submitting' | 'submitted' | 'failed'>);
    setBatchReleaseProgress({
      active: true,
      total: trackedOrderIds.length,
      submitted: 0,
      submitting: 0,
      failed: 0,
      pending: trackedOrderIds.length,
      lastUpdatedAt: new Date().toLocaleTimeString(),
    });

    void refreshBatchProgress(trackedOrderIds);
    batchProgressIntervalRef.current = window.setInterval(() => {
      void refreshBatchProgress(trackedOrderIds);
    }, 1500);
  };

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
        orderService.getAdminOrders({ includeItems: false, pageSize: 200 }),
        orderService.getBatchQueue(),
        shippingService.getConfig(),
      ]);
      setOrders(Array.isArray(ordersData) ? ordersData : (ordersData && ordersData.orders) || []);
      setBatchQueue(queueData);
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
    } catch (err) {
      setMessage('Failed to load orders');
    } finally {
      setLoading(false);
    }
  };


  // Only reload orders when the page is loaded (mount)
  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => () => {
    stopBatchProgressPolling();
  }, []);

  const handleSubmitBatch = async () => {
    if (!batchQueue?.eligibleOrderIds.length) {
      setMessage('No eligible batch orders are ready to release.');
      return;
    }

    const trackedOrderIds = [...batchQueue.eligibleOrderIds];
    startBatchProgressPolling(trackedOrderIds);
    setMessage(`Submitting ${trackedOrderIds.length} eligible batch order(s) to WHCC...`);

    try {
      const result = await orderService.submitBatch(trackedOrderIds, batchAddress);
      if ((result as any).failedCount) {
        setMessage(`Released ${result.updatedCount} batch order(s) to ${String(result.selectedLab || 'configured lab').toUpperCase()}. ${(result as any).failedCount} failed. See WHCC logs in order details.`);
      } else {
        setMessage(`Released ${result.updatedCount} batch order(s) to ${String(result.selectedLab || 'configured lab').toUpperCase()}.`);
      }
      setBatchReleaseProgress({
        active: false,
        total: trackedOrderIds.length,
        submitted: Number(result.updatedCount || 0),
        submitting: 0,
        failed: Number((result as any).failedCount || 0),
        pending: Math.max(0, trackedOrderIds.length - Number(result.updatedCount || 0) - Number((result as any).failedCount || 0)),
        lastUpdatedAt: new Date().toLocaleTimeString(),
      });
      stopBatchProgressPolling();
      await loadData();
    } catch {
      setMessage('Failed to release batch orders');
      setBatchReleaseProgress((current) => current ? { ...current, active: false, lastUpdatedAt: new Date().toLocaleTimeString() } : null);
      stopBatchProgressPolling();
    }
  };

  const handleWhccRetry = async (orderId: number) => {
    setWhccRetrying(orderId);
    const startedAt = new Date().toLocaleString();
    setWhccRetryMessageByOrder((prev) => ({
      ...prev,
      [orderId]: { tone: 'info', text: `Retry started at ${startedAt}…` },
    }));
    try {
      const result = await orderService.whccRetry(orderId);
      setWhccRetryMessageByOrder((prev) => ({
        ...prev,
        [orderId]: {
          tone: 'info',
          text: `${result.message || `WHCC retry started for order #${orderId}.`} (${new Date().toLocaleString()})`,
        },
      }));
      // Reload after a short delay to pick up new status
      setTimeout(() => loadData(), 3500);
    } catch (err: any) {
      setWhccRetryMessageByOrder((prev) => ({
        ...prev,
        [orderId]: {
          tone: 'error',
          text: `${err?.response?.data?.error || `Failed to retry WHCC submission for order #${orderId}`} (${new Date().toLocaleString()})`,
        },
      }));
    } finally {
      setWhccRetrying(null);
    }
  };

  const handleDigitalResend = async (orderId: number) => {
    setDigitalResendingOrderId(orderId);
    const startedAt = new Date().toLocaleString();
    setDigitalResendMessageByOrder((prev) => ({
      ...prev,
      [orderId]: { tone: 'info', text: `Sending new download links at ${startedAt}…` },
    }));

    try {
      const result = await orderService.resendDigitalDownload(orderId);
      setDigitalResendMessageByOrder((prev) => ({
        ...prev,
        [orderId]: {
          tone: 'info',
          text: `${result.message || `Digital download links resent for order #${orderId}.`} (${new Date().toLocaleString()})`,
        },
      }));
      await ensureOrderDetailsLoaded(orderId);
    } catch (err: any) {
      setDigitalResendMessageByOrder((prev) => ({
        ...prev,
        [orderId]: {
          tone: 'error',
          text: `${err?.response?.data?.error || `Failed to resend digital download links for order #${orderId}`} (${new Date().toLocaleString()})`,
        },
      }));
    } finally {
      setDigitalResendingOrderId(null);
    }
  };

  // Exclude cancelled orders from batch queue
  const queuedBatchOrders = orders.filter((order) => order.isBatch && !order.labSubmitted && String(order.status).toLowerCase() !== 'cancelled');
  // Include non-batch, submitted, cancelled, or completed batch orders in recentDirectOrders
  const recentDirectOrders = orders.filter((order) =>
    !order.isBatch ||
    order.labSubmitted ||
    String(order.status).toLowerCase() === 'cancelled' ||
    String(order.status).toLowerCase() === 'completed' ||
    String(order.status).toLowerCase() === 'complete'
  );
  // --- Digital Download Resend Logic ---
  // ...existing code...
  // visibleOrders is used for showWhccColumn logic
  const visibleOrders = [...queuedBatchOrders, ...recentDirectOrders];
  const recentVisibleOrders = [...recentDirectOrders];
  const canViewWhccDetails = user?.role === 'super_admin' || user?.role === 'studio_admin' || user?.role === 'admin';
  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filteredRecentOrders = normalizedQuery
    ? recentVisibleOrders.filter((order) => {
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
    : recentVisibleOrders;
  const showWhccColumn = canViewWhccDetails && visibleOrders.some(
    (order) => order.whccConfirmationId || order.whccImportResponse || order.whccSubmitResponse || order.whccLastError || order.trackingNumber || order.whccWebhookEvent
  );
  const tableColumnCount = showWhccColumn ? 7 : 6;
  const getOrderById = (orderId: number) => orders.find((entry) => entry.id === orderId);

  // Exclude cancelled orders from batch tables
  const submittedBatchOrders = filteredRecentOrders.filter((order) => order.isBatch && order.labSubmitted && String(order.status).toLowerCase() !== 'cancelled');
  const nonSubmittedBatchOrders = filteredRecentOrders.filter((order) => !(order.isBatch && order.labSubmitted) && String(order.status).toLowerCase() !== 'cancelled');

  // Ensure cancelled orders appear in recent orders section
  const cancelledRecentOrders = filteredRecentOrders.filter((order) => String(order.status).toLowerCase() === 'cancelled');

  const shippingReport = filteredRecentOrders.reduce(
    (acc, order) => {
      const customerShipping = Number(order.shippingCost || 0);
      const studioShipping = Number(order.studioShippingCost ?? order.shippingCost ?? 0);
      const shippingMargin = Number(order.shippingMargin ?? (customerShipping - studioShipping));
      acc.customerShippingTotal += customerShipping;
      acc.studioShippingTotal += studioShipping;
      acc.shippingMarginTotal += shippingMargin;
      acc.ordersWithShipping += customerShipping > 0 || studioShipping > 0 ? 1 : 0;
      return acc;
    },
    {
      customerShippingTotal: 0,
      studioShippingTotal: 0,
      shippingMarginTotal: 0,
      ordersWithShipping: 0,
    }
  );

  const submittedBatchGroups = Array.from(
    submittedBatchOrders.reduce((map, order) => {
      const key = order.whccConfirmationId || `batch-${order.id}`;
      const existing = map.get(key);
      if (existing) {
        existing.orders.push(order);
        existing.total += Number(order.totalAmount) || 0;
        if (new Date(order.orderDate).getTime() > new Date(existing.latestOrderDate).getTime()) {
          existing.latestOrderDate = order.orderDate;
        }
      } else {
        map.set(key, {
          key,
          confirmationId: order.whccConfirmationId || null,
          orders: [order],
          total: Number(order.totalAmount) || 0,
          latestOrderDate: order.orderDate,
        });
      }
      return map;
    }, new Map<string, { key: string; confirmationId: string | null; orders: Order[]; total: number; latestOrderDate: string }>())
      .values()
  ).sort((a, b) => new Date(b.latestOrderDate).getTime() - new Date(a.latestOrderDate).getTime());

  const formatWhccPayload = (value: unknown) => {
    if (value == null) return null;
    if (typeof value === 'string') {
      try {
        return JSON.stringify(JSON.parse(value), null, 2);
      } catch {
        return value;
      }
    }
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  };

  const formatDateTime = (value: unknown) => {
    if (!value) return null;
    const date = new Date(String(value));
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleString();
  };

  const renderWhccLogBlock = (title: string, value: unknown, defaultOpen = false, runAt?: unknown) => {
    const formatted = formatWhccPayload(value);
    if (!formatted) return null;
    const runAtText = formatDateTime(runAt);

    return (
      <details className="whcc-log-panel" open={defaultOpen}>
        <summary className="whcc-log-summary">
          <span>{title}</span>
          {runAtText && <span className="whcc-log-run-at">Last run: {runAtText}</span>}
        </summary>
        <pre className="whcc-log-content">{formatted}</pre>
      </details>
    );
  };

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

  const ensureOrderDetailsLoaded = async (orderId: number) => {
    if (loadingOrderDetails[orderId]) {
      return;
    }

    setLoadingOrderDetails((current) => ({
      ...current,
      [orderId]: true,
    }));

    try {
      const orderDetails = await orderService.getAdminOrderDetails(orderId);
      setOrders((current) => current.map((entry) => (entry.id === orderId ? { ...entry, ...orderDetails } : entry)));
    } catch {
      setMessage(`Failed to load details for order #${orderId}`);
    } finally {
      setLoadingOrderDetails((current) => {
        const next = { ...current };
        delete next[orderId];
        return next;
      });
    }
  };

  const handleRowSelect = async (orderId: number) => {
    if (selectedOrderId === orderId) {
      updateSelectedOrder(null);
      return;
    }
    // Always reload orders before selecting
    await loadData();
    updateSelectedOrder(orderId);
    await ensureOrderDetailsLoaded(orderId);
  };

  const renderOrderDetails = (order: Order) => (
      <div className="admin-order-detail-panel">
      {/* Cancel Order Button for Studio Admins and Super Admins */}
      {(user?.role === 'studio_admin' || user?.role === 'super_admin') &&
        ['pending', 'waiting'].includes(String(order.status).toLowerCase()) && (
          <div style={{ marginBottom: 16 }}>
            <button
              className="btn btn-danger"
              onClick={() => handleShowCancelDialog(order)}
              style={{ fontWeight: 600 }}
            >
              Cancel Order
            </button>
          </div>
        )}
            {/* Cancel Order Dialog */}
            {showCancelDialog && (
              <div className="modal-overlay" style={{ zIndex: 1000 }}>
                <div className="modal-content" style={{ maxWidth: 420, margin: '10vh auto', background: '#fff', borderRadius: 8, padding: 24, boxShadow: '0 2px 16px rgba(0,0,0,0.18)' }}>
                  <h2 style={{ marginTop: 0 }}>Cancel Order</h2>
                  <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>Reason for cancellation</label>
                  <textarea
                    value={cancelReason}
                    onChange={e => setCancelReason(e.target.value)}
                    rows={3}
                    style={{ width: '100%', marginBottom: 16, borderRadius: 4, border: '1px solid #ccc', padding: 8 }}
                    placeholder="Enter reason (required)"
                    disabled={cancelLoading}
                  />
                  <label style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
                    <input
                      type="checkbox"
                      checked={cancelRefund}
                      onChange={e => setCancelRefund(e.target.checked)}
                      disabled={cancelLoading}
                      style={{ marginRight: 8 }}
                    />
                    Issue refund to customer (Stripe)
                  </label>
                  {cancelError && <div style={{ color: 'red', marginBottom: 12 }}>{cancelError}</div>}
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                    <button className="btn btn-secondary" onClick={handleCloseCancelDialog} disabled={cancelLoading}>Cancel</button>
                    <button
                      className="btn btn-danger"
                      onClick={handleSubmitCancelOrder}
                      disabled={cancelLoading || !cancelReason.trim()}
                    >
                      {cancelLoading ? 'Cancelling…' : 'Confirm Cancel Order'}
                    </button>
                  </div>
                </div>
              </div>
            )}
      {(() => {
        const hasWhccData = Boolean(
          order.whccConfirmationId ||
          order.whccOrderNumber ||
          order.whccWebhookEvent ||
          order.whccWebhookStatus ||
          order.whccLastError ||
          order.whccRequestLog ||
          order.whccImportResponse ||
          order.whccSubmitResponse
        );
        const studioRevenue = (order.items || []).reduce(
          (sum, item) => sum + (Number(item.price) || 0) * (Number(item.quantity) || 0),
          0
        );
        const baseRevenue = (order.items || []).reduce(
          (sum, item) => sum + (Number(item.basePrice) || 0) * (Number(item.quantity) || 0),
          0
        );
        const shippingCost = Number(order.shippingCost) || 0;
        const studioShippingCost = Number(order.studioShippingCost ?? order.shippingCost ?? 0);
        const shippingMargin = Number(order.shippingMargin ?? (shippingCost - studioShippingCost));
        const shippingRuleLabel = order.isBatch
          ? 'Batch order: customer $0, studio pays rubric cost'
          : order.directPricingModeUsed === 'pass_through'
            ? 'Direct order: customer charged rubric cost'
            : 'Direct order: customer charged flat fee';
        const taxAmount = Number(order.taxAmount) || 0;
        const stripeFeeAmount = Number(order.stripeFeeAmount) || 0;
        const uncoveredShippingCost = Math.max(0, studioShippingCost - shippingCost);
        const otherOrderCosts = uncoveredShippingCost + taxAmount + stripeFeeAmount;
        const grossMargin = studioRevenue - baseRevenue - otherOrderCosts;
        const importRunAt =
          order.whccRequestLog?.importResponseMeta?.runAt ||
          order.whccImportResponse?.Received ||
          order.whccImportResponse?.received ||
          order.whccImportResponse?.Timestamp ||
          null;
        const submitRunAt =
          order.whccRequestLog?.submitResponseMeta?.runAt ||
          order.whccSubmitResponse?.Received ||
          order.whccSubmitResponse?.received ||
          order.whccSubmitResponse?.Timestamp ||
          order.labSubmittedAt ||
          null;
        const errorRunAt =
          order.whccLastError?.runAt ||
          order.whccLastError?.timestamp ||
          order.whccLastError?.createdAt ||
          null;
        const lastWhccAttemptAt =
          order.whccRequestLog?.submitRequest?.runAt ||
          order.whccRequestLog?.importRequest?.runAt ||
          order.whccRequestLog?.tokenRequest?.runAt ||
          submitRunAt ||
          importRunAt ||
          errorRunAt ||
          null;

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
            {order.hasDigitalItems && (
              <div style={{ marginTop: 8 }}>
                <button
                  onClick={() => handleDigitalResend(order.id)}
                  disabled={digitalResendingOrderId === order.id}
                  style={{ padding: '6px 14px', borderRadius: 6, background: '#6ee7b7', color: '#0f172a', fontWeight: 700, border: 'none', cursor: 'pointer' }}
                >
                  {digitalResendingOrderId === order.id ? 'Resending…' : 'Resend Download Link'}
                </button>
                {digitalResendMessageByOrder[order.id] && (
                  <div style={{ marginTop: 4, color: digitalResendMessageByOrder[order.id].tone === 'error' ? '#dc2626' : '#059669' }}>
                    {digitalResendMessageByOrder[order.id].text}
                  </div>
                )}
              </div>
            )}
        </div>
        <div className="admin-order-detail-box">
          <strong>Shipping</strong>
          <span>{order.shippingOption || 'direct'}</span>
          {order.shippingCarrier ? (
            <span><strong>Carrier:</strong> {order.shippingCarrier}</span>
          ) : (
            <span className="whcc-meta">Carrier pending</span>
          )}
          {order.trackingNumber ? (
            <span><strong>Tracking:</strong> {order.trackingNumber}</span>
          ) : (
            <span className="whcc-meta">Tracking pending</span>
          )}
          {order.shippedAt ? (
            <span><strong>Shipped:</strong> {new Date(order.shippedAt).toLocaleString()}</span>
          ) : null}
          {order.trackingUrl ? (
            <a className="whcc-link" href={order.trackingUrl} target="_blank" rel="noopener noreferrer">
              Track package ↗
            </a>
          ) : null}
        </div>
      </div>

      {canViewWhccDetails && (hasWhccData || !order.labSubmitted) && (
        <div className="whcc-detail-section">
          <div className="whcc-detail-header">
            <span className="whcc-detail-title">WHCC Lab Details</span>
          </div>
          <div className="whcc-detail-grid">
            {order.whccConfirmationId && (
              <div className="whcc-detail-field">
                <span className="whcc-detail-label">Confirmation ID</span>
                <span className="whcc-confirmation-id">{order.whccConfirmationId}</span>
              </div>
            )}
            {order.whccOrderNumber && (
              <div className="whcc-detail-field">
                <span className="whcc-detail-label">WHCC Order #</span>
                <span className="whcc-detail-value">{order.whccOrderNumber}</span>
              </div>
            )}
            {order.whccWebhookEvent && (
              <div className="whcc-detail-field">
                <span className="whcc-detail-label">Webhook Event</span>
                <span className="whcc-detail-value">{order.whccWebhookEvent}</span>
              </div>
            )}
            {order.whccWebhookStatus && (
              <div className="whcc-detail-field">
                <span className="whcc-detail-label">Webhook Status</span>
                <span className="whcc-detail-value">{order.whccWebhookStatus}</span>
              </div>
            )}
            {order.whccSubmitResponse?.Received && (
              <div className="whcc-detail-field">
                <span className="whcc-detail-label">Submitted</span>
                <span className="whcc-detail-value">{String(order.whccSubmitResponse.Received)}</span>
              </div>
            )}
            {order.whccSubmitResponse?.Confirmation && (
              <div className="whcc-detail-field">
                <span className="whcc-detail-label">Confirmation Msg</span>
                <span className="whcc-detail-value">{String(order.whccSubmitResponse.Confirmation)}</span>
              </div>
            )}
            {importRunAt && (
              <div className="whcc-detail-field">
                <span className="whcc-detail-label">Import Response Run</span>
                <span className="whcc-detail-value">{formatDateTime(importRunAt)}</span>
              </div>
            )}
            {submitRunAt && (
              <div className="whcc-detail-field">
                <span className="whcc-detail-label">Submit Response Run</span>
                <span className="whcc-detail-value">{formatDateTime(submitRunAt)}</span>
              </div>
            )}
            {errorRunAt && (
              <div className="whcc-detail-field">
                <span className="whcc-detail-label">Last Error Run</span>
                <span className="whcc-detail-value">{formatDateTime(errorRunAt)}</span>
              </div>
            )}
            {lastWhccAttemptAt && (
              <div className="whcc-detail-field">
                <span className="whcc-detail-label">Last WHCC Attempt</span>
                <span className="whcc-detail-value">{formatDateTime(lastWhccAttemptAt)}</span>
              </div>
            )}
          </div>
          {order.whccLastError && (
            <div className="whcc-error-box">
              <span className="whcc-error-label">⚠ Last Error</span>
              <pre className="whcc-error-content">
                {formatWhccPayload(order.whccLastError)}
              </pre>
            </div>
          )}
          <div className="whcc-log-list">
            {renderWhccLogBlock('Full OrderImport Payload Sent to WHCC', order.whccRequestLog?.importRequest?.body, true, order.whccRequestLog?.importRequest?.runAt)}
            {renderWhccLogBlock('WHCC Token Request Metadata', order.whccRequestLog?.tokenRequest, false, order.whccRequestLog?.tokenRequest?.runAt)}
            {renderWhccLogBlock('WHCC Import Request Envelope', order.whccRequestLog?.importRequest, false, order.whccRequestLog?.importRequest?.runAt)}
            {renderWhccLogBlock('WHCC Submit Request', order.whccRequestLog?.submitRequest, false, order.whccRequestLog?.submitRequest?.runAt)}
            {renderWhccLogBlock('WHCC Import Response', order.whccImportResponse, false, importRunAt)}
            {renderWhccLogBlock('WHCC Submit Response', order.whccSubmitResponse, false, submitRunAt)}
            {!order.whccRequestLog && (
              <div className="whcc-log-hint">
                Retry the WHCC submission to capture the full payload sent to WHCC for this order.
              </div>
            )}
          </div>
          {!order.labSubmitted && (
            <div className="whcc-retry-row">
              <div className="whcc-retry-inline">
              <button
                type="button"
                className="whcc-retry-btn"
                disabled={whccRetrying === order.id}
                onClick={() => handleWhccRetry(order.id)}
              >
                {whccRetrying === order.id ? '⏳ Retrying…' : '↺ Retry WHCC Submission'}
              </button>
                {whccRetryMessageByOrder[order.id]?.text && (
                  <span className={`whcc-retry-message ${whccRetryMessageByOrder[order.id].tone === 'error' ? 'is-error' : 'is-info'}`}>
                    {whccRetryMessageByOrder[order.id].text}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="admin-order-items-grid">
        {(order.items || []).map((item) => (
          <AdminOrderItemCard key={item.id} item={item} />
        ))}
      </div>

      {order.hasDigitalItems && (
        <div className="whcc-retry-row" style={{ marginTop: 14 }}>
          <div className="whcc-retry-inline">
            <button
              type="button"
              className="whcc-retry-btn"
              disabled={digitalResendingOrderId === order.id}
              onClick={() => handleDigitalResend(order.id)}
            >
              {digitalResendingOrderId === order.id
                ? '⏳ Sending links…'
                : `✉ Resend Download Link${(order.digitalItemCount || 0) > 1 ? 's' : ''}`}
            </button>
            {digitalResendMessageByOrder[order.id]?.text && (
              <span className={`whcc-retry-message ${digitalResendMessageByOrder[order.id].tone === 'error' ? 'is-error' : 'is-info'}`}>
                {digitalResendMessageByOrder[order.id].text}
              </span>
            )}
          </div>
        </div>
      )}

      <div className="admin-order-pricing-summary">
        {order.subtotal != null && (
          <div className="admin-order-pricing-row"><span>Subtotal</span><span>${Number(order.subtotal).toFixed(2)}</span></div>
        )}
        {Number(order.shippingCost) > 0 && (
          <div className="admin-order-pricing-row"><span>Customer Shipping Charged</span><span>${Number(order.shippingCost).toFixed(2)}</span></div>
        )}
        <div className="admin-order-pricing-row"><span>Studio Shipping Cost</span><span>${studioShippingCost.toFixed(2)}</span></div>
        <div className="admin-order-pricing-row"><span>Shipping Margin</span><span>${shippingMargin.toFixed(2)}</span></div>
        {order.shippingDestination && (
          <div className="admin-order-pricing-row"><span>Shipping Destination Rule</span><span>{order.shippingDestination}</span></div>
        )}
        {order.shippingProductGroup && (
          <div className="admin-order-pricing-row"><span>Product Group Rule</span><span>{order.shippingProductGroup}</span></div>
        )}
        {order.directPricingModeUsed && (
          <div className="admin-order-pricing-row"><span>Pricing Mode Used</span><span>{order.directPricingModeUsed === 'pass_through' ? 'Pass Through' : 'Flat Fee'}</span></div>
        )}
        <div className="admin-order-pricing-row"><span>Charge Rule</span><span>{shippingRuleLabel}</span></div>
        {order.shippingRubricSource && (
          <div className="admin-order-pricing-row"><span>Rubric Source</span><span>{order.shippingRubricSource}</span></div>
        )}
        {Number(order.taxAmount) > 0 && (
          <div className="admin-order-pricing-row"><span>Tax</span><span>${Number(order.taxAmount).toFixed(2)}</span></div>
        )}
        <div className="admin-order-pricing-row admin-order-pricing-total"><span>Total Charged</span><span>${Number(order.totalAmount).toFixed(2)}</span></div>
        <div className="admin-order-pricing-row"><span>Studio Price Total</span><span>${studioRevenue.toFixed(2)}</span></div>
        <div className="admin-order-pricing-row"><span>Base Cost Total</span><span>${baseRevenue.toFixed(2)}</span></div>
        <div className="admin-order-pricing-row"><span>Other Order Costs</span><span>${otherOrderCosts.toFixed(2)}</span></div>
        <div className="admin-order-pricing-row"><span>Stripe Fees</span><span>${stripeFeeAmount.toFixed(2)}</span></div>
        <div className="admin-order-pricing-row admin-order-profit-row"><span>Gross Margin</span><span>${grossMargin.toFixed(2)}</span></div>
      </div>

      {order.excludedItemsNote ? <p className="admin-order-profit-note">{order.excludedItemsNote}</p> : null}
          </>
        );
      })()}
    </div>
  );

  const getQueueOrderStatusDisplay = (order: { id: number; isEligible: boolean }) => {
    const liveStatus = batchStatusByOrderId[order.id];
    if (liveStatus === 'submitting') {
      return { className: 'status-processing', label: 'Submitting' };
    }
    if (liveStatus === 'submitted') {
      return { className: 'status-eligible', label: 'Submitted' };
    }
    if (liveStatus === 'failed') {
      return { className: 'status-failed', label: 'Failed' };
    }
    if (liveStatus === 'pending') {
      return { className: 'status-waiting', label: 'Pending' };
    }
    return order.isEligible
      ? { className: 'status-eligible', label: 'Eligible' }
      : { className: 'status-waiting', label: 'Waiting' };
  };

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

              <button className="batch-action-button" onClick={handleSubmitBatch} disabled={!batchQueue.eligibleOrderIds.length || Boolean(batchReleaseProgress?.active)}>
                {batchReleaseProgress?.active ? 'Submitting Batch Orders…' : 'Release Eligible Batch Orders'}
              </button>

              {batchReleaseProgress && (
                <div className="batch-progress-panel" role="status" aria-live="polite">
                  <div className="batch-progress-header">
                    <strong>
                      {batchReleaseProgress.active
                        ? `Submitting ${batchReleaseProgress.total} order(s) to WHCC...`
                        : 'Batch submission completed'}
                    </strong>
                    <span>Updated {batchReleaseProgress.lastUpdatedAt}</span>
                  </div>
                  <div className="batch-progress-bar-track">
                    <div
                      className="batch-progress-bar-fill"
                      style={{ width: `${Math.min(100, Math.round(((batchReleaseProgress.submitted + batchReleaseProgress.failed) / Math.max(1, batchReleaseProgress.total)) * 100))}%` }}
                    />
                  </div>
                  <div className="batch-progress-metrics">
                    <span>Submitted: {batchReleaseProgress.submitted}/{batchReleaseProgress.total}</span>
                    <span>Submitting: {batchReleaseProgress.submitting}</span>
                    <span>Failed: {batchReleaseProgress.failed}</span>
                    <span>Pending: {batchReleaseProgress.pending}</span>
                  </div>
                </div>
              )}

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
                      {batchQueue.orders.map((order) => {
                        const statusDisplay = getQueueOrderStatusDisplay(order);
                        // Patch: fallback for missing fields
                        const createdAt = order.createdAt || order.orderDate;
                        const customerName = order.customerName || order.shippingAddress?.fullName || 'Unknown';
                        return (
                        <React.Fragment key={order.id}>
                          <tr
                            className={`admin-order-row ${selectedOrderId === order.id ? 'admin-order-row-selected' : ''}`}
                            onClick={() => {
                              void handleRowSelect(order.id);
                            }}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault();
                                void handleRowSelect(order.id);
                              }
                            }}
                            role="button"
                            tabIndex={0}
                          >
                            <td><span className="order-id">#{order.id}</span></td>
                            <td>{customerName}</td>
                            <td>{createdAt ? new Date(createdAt).toLocaleDateString() : ''}</td>
                            <td>{order.batchReadyDate ? new Date(order.batchReadyDate).toLocaleString() : 'Ready now'}</td>
                            <td>${order.totalAmount?.toFixed(2) ?? '0.00'}</td>
                            <td>
                              <span className={`order-status ${statusDisplay.className}`}>
                                {statusDisplay.label}
                              </span>
                            </td>
                          </tr>

                          {selectedOrderId === order.id && (
                            <tr className="admin-order-details-row">
                              <td colSpan={6}>
                                {loadingOrderDetails[order.id] ? (
                                  <div className="loading-state">Loading order details...</div>
                                ) : (() => {
                                  // Prefer detailed order (with items) if available
                                  const detailedOrder = orders.find(o => o.id === order.id && o.items && o.items.length > 0);
                                  if (detailedOrder) {
                                    return renderOrderDetails(detailedOrder as Order);
                                  }
                                  // Fallback to summary order if no details
                                  const fallbackOrder = getOrderById(order.id);
                                  if (fallbackOrder) {
                                    return renderOrderDetails(fallbackOrder as Order);
                                  }
                                  return <div className="loading-state">Order details unavailable.</div>;
                                })()}
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );})}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          )}
        </div>

        <div className="recent-orders-section">
          <h2>Recent Orders</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.6rem', marginBottom: '0.9rem' }}>
            <div className="batch-stat-card">
              <strong>Customer Shipping Collected</strong>
              <div>${shippingReport.customerShippingTotal.toFixed(2)}</div>
            </div>
            <div className="batch-stat-card">
              <strong>Studio Shipping Cost</strong>
              <div>${shippingReport.studioShippingTotal.toFixed(2)}</div>
            </div>
            <div className="batch-stat-card">
              <strong>Shipping Margin</strong>
              <div>${shippingReport.shippingMarginTotal.toFixed(2)}</div>
            </div>
            <div className="batch-stat-card">
              <strong>Orders with Shipping</strong>
              <div>{shippingReport.ordersWithShipping}</div>
            </div>
          </div>
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
          ) : recentDirectOrders.length === 0 ? (
            <p className="empty-state">No recent orders found.</p>
          ) : filteredRecentOrders.length === 0 ? (
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

                  {/* Render non-submitted batch orders */}
                  {nonSubmittedBatchOrders.map((order) => (
                    <React.Fragment key={order.id}>
                      {/* ...existing code for nonSubmittedBatchOrders row rendering... */}
                      <tr
                        className={`admin-order-row ${selectedOrderId === order.id ? 'admin-order-row-selected' : ''}`}
                        onClick={() => { void handleRowSelect(order.id); }}
                        onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); void handleRowSelect(order.id); } }}
                        role="button"
                        tabIndex={0}
                      >
                        <td><span className="order-id">#{order.id}</span></td>
                        <td>{new Date(order.orderDate).toLocaleDateString()}</td>
                        <td>
                          <span className={`order-status status-${order.status}`}>{order.status}</span>
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
                            {loadingOrderDetails[order.id] ? (
                              <div className="loading-state">Loading order details...</div>
                            ) : (() => {
                              const latestOrder = orders.find(o => o.id === order.id);
                              if (latestOrder) {
                                return renderOrderDetails(latestOrder as Order);
                              }
                              return <div className="loading-state">Order details unavailable.</div>;
                            })()}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}

                  {/* Render cancelled orders */}
                  {cancelledRecentOrders.map((order) => (
                    <React.Fragment key={order.id}>
                      <tr
                        className={`admin-order-row ${selectedOrderId === order.id ? 'admin-order-row-selected' : ''}`}
                        onClick={() => { void handleRowSelect(order.id); }}
                        onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); void handleRowSelect(order.id); } }}
                        role="button"
                        tabIndex={0}
                      >
                        <td><span className="order-id">#{order.id}</span></td>
                        <td>{new Date(order.orderDate).toLocaleDateString()}</td>
                        <td>
                          <span className={`order-status status-${order.status}`}>{order.status}</span>
                        </td>
                        <td>{order.shippingAddress?.fullName || 'Unknown customer'}</td>
                        <td>${order.totalAmount.toFixed(2)}</td>
                        <td>{order.shippingOption}</td>
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
                            {loadingOrderDetails[order.id] ? (
                              <div className="loading-state">Loading order details...</div>
                            ) : (() => {
                              const latestOrder = orders.find(o => o.id === order.id);
                              if (latestOrder) {
                                return renderOrderDetails(latestOrder as Order);
                              }
                              return <div className="loading-state">Order details unavailable.</div>;
                            })()}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}

                  {submittedBatchGroups.map((group) => {
                    const isExpanded = Boolean(expandedBatchGroups[group.key]);
                    return (
                      <React.Fragment key={group.key}>
                        <tr
                          className="admin-batch-group-row"
                          onClick={() => {
                            setExpandedBatchGroups((current) => ({
                              ...current,
                              [group.key]: !current[group.key],
                            }));
                          }}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              setExpandedBatchGroups((current) => ({
                                ...current,
                                [group.key]: !current[group.key],
                              }));
                            }
                          }}
                        >
                          <td colSpan={tableColumnCount}>
                            <div className="admin-batch-group-content">
                              <span className="admin-batch-group-toggle">{isExpanded ? '▾' : '▸'}</span>
                              <span className="admin-batch-group-title">
                                Submitted Batch Group ({group.orders.length} orders)
                              </span>
                              <span className="admin-batch-group-meta">
                                {group.confirmationId ? `WHCC ID: ${group.confirmationId}` : 'WHCC ID pending'}
                              </span>
                              <span className="admin-batch-group-meta">Total: ${group.total.toFixed(2)}</span>
                            </div>
                          </td>
                        </tr>

                        {isExpanded && group.orders.map((order) => (
                          <React.Fragment key={order.id}>
                            <tr
                              className={`admin-order-row admin-batch-group-order-row ${selectedOrderId === order.id ? 'admin-order-row-selected' : ''}`}
                              onClick={() => {
                                void handleRowSelect(order.id);
                              }}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter' || event.key === ' ') {
                                  event.preventDefault();
                                  void handleRowSelect(order.id);
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
                              <td>{order.shippingOption}</td>
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
                                  {loadingOrderDetails[order.id] ? (
                                    <div className="loading-state">Loading order details...</div>
                                  ) : (
                                    renderOrderDetails(order)
                                  )}
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        ))}
                      </React.Fragment>
                    );
                  })}
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
