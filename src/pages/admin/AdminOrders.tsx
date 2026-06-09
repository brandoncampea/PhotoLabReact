
import React, { useEffect, useRef, useState } from 'react';
import AdminOrderCropOverlay from '../../components/AdminOrderCropOverlay';
import ReactDOM from 'react-dom';
import Modal from '../../components/Modal/Modal';

// --- WHCC Preview/Submit helpers (must be top-level, not inside component) ---
function buildAdminRequestHeaders() {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  const token = localStorage.getItem('authToken');
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const actingStudioId = localStorage.getItem('viewAsStudioId');
  if (actingStudioId) {
    headers['x-acting-studio-id'] = actingStudioId;
  }
  return headers;
}

function resolveOrderDiscount(order: { subtotal?: number; shippingCost?: number; taxAmount?: number; totalAmount?: number; discountCode?: string }) {
  const subtotal = Number(order?.subtotal || 0);
  const shipping = Number(order?.shippingCost || 0);
  const tax = Number(order?.taxAmount || 0);
  const total = Number(order?.totalAmount || 0);

  const preferred = (subtotal + tax) - total;
  const fallback = (subtotal + shipping + tax) - total;

  let amount = 0;
  let appliesToItems = false;

  if (Number.isFinite(preferred) && preferred > 0) {
    amount = preferred;
    appliesToItems = true;
  } else if (Number.isFinite(fallback) && fallback > 0) {
    amount = fallback;
  }

  return {
    code: String(order?.discountCode || '').trim(),
    amount: Number(amount.toFixed(2)),
    appliesToItems,
  };
}

function getItemBaseCostTotal(item: {
  quantity?: number;
  superAdminShareAmount?: number;
  productionCostAmount?: number;
  cost?: number;
  labCost?: number;
  baseRevenueAmount?: number;
  basePrice?: number;
}) {
  const quantity = Math.max(1, Number(item?.quantity) || 1);
  const superAdminShareAmount = Number(item?.superAdminShareAmount);
  if (Number.isFinite(superAdminShareAmount) && superAdminShareAmount > 0) {
    return superAdminShareAmount;
  }

  const productionCostAmount = Number(item?.productionCostAmount);
  if (Number.isFinite(productionCostAmount) && productionCostAmount > 0) {
    return productionCostAmount;
  }

  const unitCost = Number(item?.cost ?? item?.labCost);
  if (Number.isFinite(unitCost) && unitCost > 0) {
    return unitCost * quantity;
  }

  const baseRevenueAmount = Number(item?.baseRevenueAmount);
  if (Number.isFinite(baseRevenueAmount) && baseRevenueAmount > 0) {
    return baseRevenueAmount;
  }

  const basePrice = Number(item?.basePrice);
  if (Number.isFinite(basePrice) && basePrice > 0) {
    return basePrice * quantity;
  }

  return 0;
}

export async function fetchWhccPreview(orderId: number, specialInstructions?: string) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 30000);
  try {
    const trimmedInstructions = String(specialInstructions || '').trim();
    const query = trimmedInstructions
      ? `?specialInstructions=${encodeURIComponent(trimmedInstructions)}`
      : '';
    const res = await fetch(`/api/orders/admin/${orderId}/whcc-preview${query}`, {
      method: 'GET',
      headers: buildAdminRequestHeaders(),
      credentials: 'include',
      signal: controller.signal,
    });
    if (!res.ok) {
      let message = 'Failed to fetch WHCC preview';
      try {
        const data = await res.json();
        if (data?.error) message = data.error;
      } catch {
        // ignore json parse errors
      }
      throw new Error(message);
    }
    return await res.json();
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      throw new Error('WHCC preview request timed out.');
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export async function submitWhccOrder(orderId: number, specialInstructions?: string) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 30000);
  try {
    const res = await fetch(`/api/orders/admin/${orderId}/whcc-approval`, {
      method: 'POST',
      headers: buildAdminRequestHeaders(),
      credentials: 'include',
      signal: controller.signal,
      body: JSON.stringify({ action: 'approve', specialInstructions }),
    });
    if (!res.ok) {
      let message = 'Failed to submit order to WHCC';
      try {
        const data = await res.json();
        if (data?.error) {
          message = data.error;
          if (data?.details) {
            const detailsText = typeof data.details === 'string'
              ? data.details
              : JSON.stringify(data.details);
            message = `${message}: ${detailsText}`;
          }
        }
      } catch {
        // ignore json parse errors
      }
      throw new Error(message);
    }
    return await res.json();
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      throw new Error('WHCC submit request timed out.');
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}


// --- WHCC Preview Modal ---
// (MUST be at top-level, not inside any other function or component)
function WhccPreviewModal({
  orderId,
  onClose,
  onSubmitted,
}: {
  orderId: number;
  onClose: () => void;
  onSubmitted?: (orderId: number, result: any) => Promise<void> | void;
}) {
    const loadPreview = React.useCallback(async (instructions?: string) => {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchWhccPreview(orderId, instructions);
        setPreview(data);
        setApprovalStatus(data.status || null);
      } catch (err: any) {
        setError(err.message || 'Failed to load preview');
      } finally {
        setLoading(false);
      }
    }, [orderId]);

    // Handles submitting the order to WHCC
    const handleSubmit = async () => {
      setSubmitting(true);
      setSubmitError(null);
      try {
        const result = await submitWhccOrder(orderId, specialInstructions);
        if (onSubmitted) {
          await onSubmitted(orderId, result);
        }
        setApprovalStatus(result.status || 'submitted');
        setSubmitting(false);
        onClose();
      } catch (err: any) {
        setSubmitError(err.message || 'Failed to submit order');
        setSubmitting(false);
      }
    };
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [preview, setPreview] = React.useState<any>(null);
  const [approvalStatus, setApprovalStatus] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [specialInstructions, setSpecialInstructions] = React.useState('');
  const [copied, setCopied] = React.useState(false);

  const handleRegeneratePreview = async () => {
    await loadPreview(specialInstructions);
  };

  React.useEffect(() => {
    setPreview(null);
    setApprovalStatus(null);
    loadPreview();
  }, [orderId, loadPreview]);

  return (
    <Modal isOpen={true} onClose={onClose} hideDefaultClose={true} contentClassName="whcc-preview-modal-shell">
      <div className="whcc-preview-modal">
        <div className="whcc-preview-header">
          <h2>WHCC Order Preview <span className="order-id">(Order #{orderId})</span></h2>
        </div>
        <div className="whcc-preview-body">
          {loading ? (
            <div className="whcc-preview-loading">Loading preview…</div>
          ) : error ? (
            <div className="error">{error}</div>
          ) : preview ? (
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(JSON.stringify(preview, null, 2));
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1200);
                }}
                className="btn btn-secondary"
                style={{ position: 'absolute', top: 8, right: 8, zIndex: 2 }}
                title="Copy JSON to clipboard"
              >
                {copied ? 'Copied!' : 'Copy JSON'}
              </button>
              <pre className="whcc-preview-json" style={{ paddingTop: 36 }}>{JSON.stringify(preview, null, 2)}</pre>
            </div>
          ) : (
            <div className="whcc-preview-empty">No preview available.</div>
          )}
          <div className="modal-row" style={{ marginTop: 18 }}>
            <div style={{ marginBottom: 10 }}>
              <strong>Status:</strong> {approvalStatus || 'unknown'}
            </div>
            <div style={{ width: '100%' }}>
              <label htmlFor="specialInstructions"><strong>Special Instructions</strong> (sent to WHCC)</label>
              <textarea
                id="specialInstructions"
                value={specialInstructions}
                onChange={e => setSpecialInstructions(e.target.value)}
                placeholder="Optional notes to include in WHCC Special Instructions"
                style={{ minHeight: 60, marginTop: 4 }}
              />
              <div style={{ marginTop: 8 }}>
                <button
                  type="button"
                  onClick={handleRegeneratePreview}
                  disabled={loading || submitting}
                  className="btn btn-secondary"
                >
                  {loading ? 'Regenerating…' : 'Regenerate Preview'}
                </button>
              </div>
            </div>
          </div>
        </div>
        <div className="whcc-preview-footer">
          {submitError && <div className="error" style={{ marginRight: 'auto' }}>{submitError}</div>}
          <button onClick={onClose} className="btn btn-secondary">Close</button>
          <button onClick={handleSubmit} disabled={submitting} className="btn whcc-submit-btn">
            {submitting ? 'Submitting…' : 'Submit to WHCC'}
          </button>
        </div>
      </div>
    </Modal>
  );
}


import { useLocation, useNavigate } from 'react-router-dom';
import { Order, BatchQueueSummary, ShippingAddress } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import { orderService } from '../../services/orderService';
import { shippingService } from '../../services/shippingService';
import AdminLayout from '../../components/AdminLayout';
import './AdminOrders.css';
import { updateStripeFee } from '../../services/stripeFeeService';

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

  const [showOverlay, setShowOverlay] = React.useState(false);
  // Digital item check
  const isDigital = item?.isDigital === true || String(item?.digitalDownloadScope || '').trim().length > 0;

  // WHCC crop: you may need to fetch this from the preview payload or store it on the item if available
  // For now, try to get from item.whccCrop or similar (you may need to wire this up)
  const whccCrop = item.whccCrop || null;

  // Use the thumbnail for overlay, fallback to main asset
  const thumbnailUrl = item.photo?.thumbnailUrl || (photoId ? `/api/photos/${photoId}/asset?variant=thumbnail` : undefined);
  const photoUrl = photoId ? `/api/photos/${photoId}/asset` : '';

  return (
    <div className="admin-order-item-card">
      <div className="admin-order-item-image-container">
        {thumbnailUrl ? (
          <img
            src={thumbnailUrl}
            alt={item.photo?.fileName || 'Photo'}
            className="admin-order-item-image"
            style={{ width: '100%', height: '100%', objectFit: 'contain' }}
          />
        ) : photoId ? (
          <img
            src={photoUrl}
            alt={item.photo?.fileName || 'Photo'}
            className="admin-order-item-image"
            style={{ width: '100%', height: '100%', objectFit: 'contain' }}
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
        {/* Attribute display logic */}
          {(() => {
            let attrUids: number[] = [];
            let attrNames: string[] = [];
            if (item.attributes) {
              if (typeof item.attributes === 'string') {
                try {
                  const parsed = JSON.parse(item.attributes);
                  if (Array.isArray(parsed)) attrUids = parsed.map(Number).filter((value: number) => Number.isInteger(value));
                } catch {
                  if (!isNaN(Number(item.attributes))) attrUids = [Number(item.attributes)];
                }
              } else if (Array.isArray(item.attributes)) {
                attrUids = item.attributes.map(Number).filter((value: number) => Number.isInteger(value));
              }
            }
            let whccCategories: any[] = [];
            let whccAttrMap: Record<number, string> = {};
            let optionsSnapshot = item.product_options_snapshot || item.productOptionsSnapshot;
            if (typeof optionsSnapshot === 'string') {
              try { optionsSnapshot = JSON.parse(optionsSnapshot); } catch { optionsSnapshot = {}; }
            }
            if (optionsSnapshot && typeof optionsSnapshot === 'object') {
              whccCategories = optionsSnapshot.whccAttributeCategories || optionsSnapshot.whcc_attribute_categories || [];
              for (const cat of whccCategories) {
                if (Array.isArray(cat.attributes)) {
                  for (const attr of cat.attributes) {
                    const uid = Number(attr.uid ?? attr.AttributeUID ?? attr.attributeUID ?? attr.id);
                    const name = String(attr.name ?? attr.AttributeName ?? attr.DisplayName ?? attr.displayName ?? '').trim();
                    if (uid && name) whccAttrMap[uid] = name;
                  }
                }
              }
            }
            attrNames = attrUids.map((uid) => whccAttrMap[uid] || `#${uid}`);
            if (attrNames.length === 0 && optionsSnapshot) {
              const whccVariants = optionsSnapshot.whccVariants || optionsSnapshot.whcc_variants || [];
              const selectedVariantId = optionsSnapshot.whccSelectedVariantId || optionsSnapshot.whcc_selected_variant_id;
              if (Array.isArray(whccVariants) && selectedVariantId) {
                const selected = whccVariants.find((v: any) => v.id === selectedVariantId || v.id === Number(selectedVariantId));
                if (selected && selected.displayName) {
                  attrNames = [selected.displayName];
                }
              }
            }
            return attrNames.length > 0 ? (
              <div style={{ margin: '4px 0' }}>
                {attrNames.map((name, idx) => (
                  <span key={idx} style={{ fontSize: 12, color: '#7b61ff', marginRight: 8 }}>{name}</span>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 12, color: '#999', margin: '4px 0' }}>[No attributes]</div>
            );
          })()}
        <div className="admin-order-item-meta-row">
          <span className="admin-order-qty-pill">Qty: {item.quantity}</span>
          <span className="admin-order-item-price">${Number((item.price || 0) * (item.quantity || 0)).toFixed(2)}</span>
        </div>
        {cropDebugText && <p className="item-size-name" style={{ marginTop: 6 }}>Crop: {cropDebugText}</p>}
        {/* Overlay button for non-digital items */}
        {!isDigital && (
          <button
            className="btn btn-outline-primary"
            style={{ marginTop: 8, fontSize: 13, padding: '4px 10px' }}
            onClick={() => setShowOverlay(true)}
          >
            Show Crop Overlay
          </button>
        )}
        {showOverlay && (
          <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.7)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ background: '#181828', borderRadius: 10, padding: 24, boxShadow: '0 2px 16px rgba(0,0,0,0.18)', position: 'relative' }}>
              <button onClick={() => setShowOverlay(false)} style={{ position: 'absolute', top: 8, right: 8, background: 'none', border: 'none', color: '#fff', fontSize: 24, cursor: 'pointer' }}>&times;</button>
              <AdminOrderCropOverlay
                photoUrl={photoUrl}
                thumbnailUrl={thumbnailUrl}
                photoWidth={photoWidth || 1}
                photoHeight={photoHeight || 1}
                cropData={cropData}
                whccCrop={whccCrop}
              />
              <div style={{ color: '#fff', marginTop: 12, fontSize: 13 }}>
                <b>Yellow:</b> Customer crop &nbsp; <b>Magenta:</b> WHCC crop
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const MemoAdminOrderItemCard = React.memo(AdminOrderItemCard);



const AdminOrders: React.FC = () => {
  // --- All hooks and state at the top ---
  const [orders, setOrders] = useState<Order[]>([]);
  const location = useLocation();
  const navigate = useNavigate();
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const [whccPreviewOrderId, setWhccPreviewOrderId] = useState<number | null>(null);
  const [whccPreviewByOrder, setWhccPreviewByOrder] = useState<Record<number, { approvalStatus?: string; preview?: any }>>({});
  const [whccApprovalLoading, setWhccApprovalLoading] = useState<Record<number, boolean>>({});
  const [whccApprovalError, setWhccApprovalError] = useState<Record<number, string | null>>({});
  const [whccResubmitConfirmed, setWhccResubmitConfirmed] = useState<Record<number, boolean>>({});
  const [batchStatusUpdate, setBatchStatusUpdate] = useState({ status: '', message: '', loading: false, result: '' });


  // --- Auto-open order details if orderId is present in the URL query string ---
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const orderIdParam = params.get('orderId');
    if (orderIdParam && !selectedOrderId) {
      const parsed = parseInt(orderIdParam, 10);
      if (!isNaN(parsed)) {
        setSelectedOrderId(parsed);
      }
    }
  }, [location.search, selectedOrderId]);

  // --- Ensure details panel opens after orders are loaded (for direct navigation) ---
  useEffect(() => {
    if (!selectedOrderId || !orders || orders.length === 0) return;
    const found = orders.some(order => order.id === selectedOrderId);
    if (!found) {
      // Optionally: fetch the order directly if not in the list
      // Example: orderService.getOrder(selectedOrderId).then(...)
      // For now, do nothing (panel will show not found)
    }
    // If found, details panel will render as normal
    // If you have a collapsed/expanded state, ensure it is set here
  }, [selectedOrderId, orders]);

        // Dummy approve/reject handlers (replace with real API calls as needed)
        const approveWhccOrder = async (orderId: number) => {
          // Simulate API call
          await new Promise((resolve) => setTimeout(resolve, 500));
          setWhccPreviewByOrder((prev) => ({
            ...prev,
            [orderId]: { ...prev[orderId], approvalStatus: 'approved' },
          }));
        };
        const rejectWhccOrder = async (orderId: number) => {
          // Simulate API call
          await new Promise((resolve) => setTimeout(resolve, 500));
          setWhccPreviewByOrder((prev) => ({
            ...prev,
            [orderId]: { ...prev[orderId], approvalStatus: 'rejected' },
          }));
        };
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
  // const [orders, setOrders] = useState<Order[]>([]); // Duplicate, removed
    // Auto-recalculate Stripe fee for orders with $0 fee and valid paymentIntentId
    useEffect(() => {
      const recalcStripeFees = async () => {
        // Only run if orders are loaded
        if (!orders || !orders.length) return;
        // Find orders with $0 stripe fee and a valid paymentIntentId
        const ordersToUpdate = orders.filter(
          (order) =>
            (Number(order.stripeFeeAmount) === 0 || order.stripeFeeAmount === undefined || order.stripeFeeAmount === null)
            && order.paymentIntentId && typeof order.paymentIntentId === 'string' && order.paymentIntentId.startsWith('pi_')
        );
        if (!ordersToUpdate.length) return;
        // For each, call updateStripeFee and refresh the order in state
        for (const order of ordersToUpdate) {
          try {
            await updateStripeFee(String(order.id));
            // Optionally, reload orders after update
            // (for now, just reload all orders after all updates)
          } catch (err) {
            // Ignore errors for now
          }
        }
        // After all updates, reload orders
        loadData();
      };
      recalcStripeFees();
      // Only run when orders change
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [orders]);
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
  const [batchSpecialInstructions, setBatchSpecialInstructions] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  // const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null); // Duplicate, removed
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState(''); // Empty string = show all
  const [whccRetrying, setWhccRetrying] = useState<number | null>(null);
  const [whccRetryMessageByOrder, setWhccRetryMessageByOrder] = useState<Record<number, { tone: 'info' | 'error'; text: string }>>({});
  const [digitalResendingOrderId, setDigitalResendingOrderId] = useState<number | null>(null);
  const [digitalResendMessageByOrder, setDigitalResendMessageByOrder] = useState<Record<number, { tone: 'info' | 'error'; text: string }>>({});
  const [loadingOrderDetails, setLoadingOrderDetails] = useState<Record<number, boolean>>({});
  const [expandedBatchGroups, setExpandedBatchGroups] = useState<Record<string, boolean>>({});
  const [batchSectionCollapsed, setBatchSectionCollapsed] = useState(true);
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
  // const location = useLocation(); // Duplicate, removed
  // const navigate = useNavigate(); // Duplicate, removed

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
      const result = await orderService.submitBatch(trackedOrderIds, batchAddress, undefined, batchSpecialInstructions);
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
      await submitWhccOrder(orderId);
      setWhccRetryMessageByOrder((prev) => ({
        ...prev,
        [orderId]: {
          tone: 'info',
          text: `WHCC submission (retry) started for order #${orderId}. (${new Date().toLocaleString()})`,
        },
      }));
      await loadData();
    } catch (err: any) {
      setWhccRetryMessageByOrder((prev) => ({
        ...prev,
        [orderId]: {
          tone: 'error',
          text: `${err?.message || `Failed to retry WHCC submission for order #${orderId}`} (${new Date().toLocaleString()})`,
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

  const queuedBatchOrders = React.useMemo(
    () => orders.filter((order) => order.isBatch && !order.labSubmitted && String(order.status).toLowerCase() !== 'cancelled'),
    [orders]
  );

  const recentDirectOrders = React.useMemo(
    () => orders.filter((order) =>
      !order.isBatch ||
      order.labSubmitted ||
      String(order.status).toLowerCase() === 'cancelled' ||
      String(order.status).toLowerCase() === 'completed' ||
      String(order.status).toLowerCase() === 'complete'
    ),
    [orders]
  );

  const visibleOrders = React.useMemo(() => [...queuedBatchOrders, ...recentDirectOrders], [queuedBatchOrders, recentDirectOrders]);
  const canViewWhccDetails = user?.role === 'super_admin' || user?.role === 'studio_admin' || user?.role === 'admin';
  const normalizedQuery = searchQuery.trim().toLowerCase();

  const filteredRecentOrders = React.useMemo(() => {
    let filtered = recentDirectOrders;

    // Apply search filter
    if (normalizedQuery) {
      filtered = filtered.filter((order) => {
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
      });
    }

    // Apply status filter
    if (statusFilter && statusFilter !== '') {
      filtered = filtered.filter((order) => String(order.status).toLowerCase() === String(statusFilter).toLowerCase());
    }

    return filtered;
  }, [normalizedQuery, statusFilter, recentDirectOrders]);

  const showWhccColumn = React.useMemo(
    () => canViewWhccDetails && visibleOrders.some(
      (order) => order.whccConfirmationId || order.whccImportResponse || order.whccSubmitResponse || order.whccLastError || order.trackingNumber || order.whccWebhookEvent
    ),
    [canViewWhccDetails, visibleOrders]
  );
  const tableColumnCount = showWhccColumn ? 7 : 6;
  const getOrderById = React.useCallback((orderId: number) => orders.find((entry) => entry.id === orderId), [orders]);

  const submittedBatchOrders = React.useMemo(
    () => filteredRecentOrders.filter((order) => order.isBatch && order.labSubmitted && String(order.status).toLowerCase() !== 'cancelled'),
    [filteredRecentOrders]
  );

  const nonSubmittedBatchOrders = React.useMemo(
    () => filteredRecentOrders.filter((order) => !(order.isBatch && order.labSubmitted) && String(order.status).toLowerCase() !== 'cancelled'),
    [filteredRecentOrders]
  );

  const cancelledRecentOrders = React.useMemo(
    () => filteredRecentOrders.filter((order) => String(order.status).toLowerCase() === 'cancelled'),
    [filteredRecentOrders]
  );

  const shippingReport = React.useMemo(
    () => filteredRecentOrders.reduce(
      (acc, order) => {
        const customerShipping = Number(order.shippingCost || 0);
        const explicitStudioShipping = Number(order.studioShippingCost);
        // Use explicit studio shipping cost if available, otherwise 0 (no data)
        const studioShipping = Number.isFinite(explicitStudioShipping)
          ? explicitStudioShipping
          : 0;
        const explicitShippingMargin = Number(order.shippingMargin);
        const shippingMargin = Number.isFinite(explicitShippingMargin)
          ? explicitShippingMargin
          : (customerShipping - studioShipping);
        
        // Calculate studio profit (gross margin) for this order
        const studioRevenue = (order.items || []).reduce(
          (sum, item) => sum + (Number(item.price) || 0) * (Number(item.quantity) || 0),
          0
        );
        const baseRevenue = (order.items || []).reduce(
          (sum, item) => sum + getItemBaseCostTotal(item),
          0
        );
        const stripeFeeAmount = Number(order.stripeFeeAmount) || 0;
        const uncoveredShippingCost = Math.max(0, studioShipping - customerShipping);
        const grossMargin = studioRevenue - baseRevenue - uncoveredShippingCost - stripeFeeAmount;
        
        acc.customerShippingTotal += customerShipping;
        acc.studioShippingTotal += studioShipping;
        acc.shippingMarginTotal += shippingMargin;
        acc.studioProfitTotal += grossMargin;
        acc.ordersWithShipping += customerShipping > 0 || studioShipping > 0 ? 1 : 0;
        return acc;
      },
      {
        customerShippingTotal: 0,
        studioShippingTotal: 0,
        shippingMarginTotal: 0,
        studioProfitTotal: 0,
        ordersWithShipping: 0,
      }
    ),
    [filteredRecentOrders]
  );

  const submittedBatchGroups = React.useMemo(() => Array.from(
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
    }, new Map<string, { key: string; confirmationId: string | null; orders: Order[]; total: number; latestOrderDate: string }>() )
      .values()
  ).sort((a, b) => new Date(b.latestOrderDate).getTime() - new Date(a.latestOrderDate).getTime()), [submittedBatchOrders]);

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

  const formatCurrency = (value: unknown) => {
    if (value === null || value === undefined) return '—';
    const amount = Number(value);
    if (!Number.isFinite(amount)) return '—';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
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
      // Also ensure order details are loaded if navigating directly
      ensureOrderDetailsLoaded(queryOrderId);
      return;
    }
    setSelectedOrderId(null);
  }, [location.search]);

  const updateSelectedOrder = React.useCallback(async (orderId: number | null) => {
    const params = new URLSearchParams(location.search);
    if (orderId) {
      params.set('orderId', String(orderId));
      setSelectedOrderId(orderId);
    } else {
      params.delete('orderId');
      setSelectedOrderId(null);
      // Always reload orders list after closing details to ensure correct totals
      await loadData();
    }
    navigate({ pathname: location.pathname, search: params.toString() ? `?${params.toString()}` : '' }, { replace: true });
  }, [location.pathname, location.search, navigate]);

  const ensureOrderDetailsLoaded = React.useCallback(async (orderId: number) => {
    if (loadingOrderDetails[orderId]) {
      return;
    }

    setLoadingOrderDetails((current) => ({
      ...current,
      [orderId]: true,
    }));

    try {
      const orderDetails = await orderService.getAdminOrderDetails(orderId);
      setOrders((current) => {
        // If order already exists, update it; otherwise, add it
        const exists = current.some((entry) => entry.id === orderId);
        if (exists) {
          return current.map((entry) => (entry.id === orderId ? { ...entry, ...orderDetails } : entry));
        } else {
          return [...current, orderDetails];
        }
      });
    } catch {
      setMessage(`Failed to load details for order #${orderId}`);
    } finally {
      setLoadingOrderDetails((current) => {
        const next = { ...current };
        delete next[orderId];
        return next;
      });
    }
  }, [loadingOrderDetails]);

  const handleRowSelect = React.useCallback(async (orderId: number) => {
    if (selectedOrderId === orderId) {
      await updateSelectedOrder(null);
      return;
    }
    await updateSelectedOrder(orderId);
    await ensureOrderDetailsLoaded(orderId);
  }, [ensureOrderDetailsLoaded, selectedOrderId, updateSelectedOrder]);

  const [statusUpdating, setStatusUpdating] = useState(false);
  const [statusUpdateError, setStatusUpdateError] = useState<string | null>(null);
  const orderStatusOptions = [
    { value: 'pending', label: 'Pending' },
    { value: 'processing', label: 'Processing' },
    { value: 'shipped', label: 'Shipped' },
    { value: 'completed', label: 'Completed' },
    { value: 'cancelled', label: 'Cancelled' },
  ];

  const handleStatusChange = React.useCallback(async (orderId: number, newStatus: string) => {
    setStatusUpdating(true);
    setStatusUpdateError(null);
    try {
      if (newStatus === 'cancelled') {
        // Prompt for cancel reason
        const reason = prompt('Please enter a reason for cancellation:');
        if (!reason || !reason.trim()) {
          setStatusUpdateError('Cancel reason is required.');
          setStatusUpdating(false);
          return;
        }
        await orderService.cancelOrder(orderId, reason, false);
      } else {
        await orderService.updateStatus(orderId, newStatus);
      }
      await ensureOrderDetailsLoaded(orderId);
    } catch (err: any) {
      setStatusUpdateError(err?.response?.data?.error || err?.message || 'Failed to update status');
    } finally {
      setStatusUpdating(false);
    }
  }, [ensureOrderDetailsLoaded]);

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
          (sum, item) => sum + getItemBaseCostTotal(item),
          0
        );
        const shippingCost = Number(order.shippingCost) || 0;
        const explicitStudioShippingCost = Number(order.studioShippingCost);
        // Use explicit studio shipping cost if available, otherwise leave as provided (0 means no data yet)
        const studioShippingCost = Number.isFinite(explicitStudioShippingCost)
          ? explicitStudioShippingCost
          : 0;
        const explicitShippingMargin = Number(order.shippingMargin);
        const shippingMargin = Number.isFinite(explicitShippingMargin)
          ? explicitShippingMargin
          : (shippingCost - studioShippingCost);
        const shippingRuleLabel = order.isBatch
          ? 'Batch order: customer $0, studio pays rubric cost'
          : order.directPricingModeUsed === 'pass_through'
            ? 'Direct order: customer charged rubric cost'
            : 'Direct order: customer charged flat fee';
        const discount = resolveOrderDiscount(order);

        const stripeFeeAmount = Number(order.stripeFeeAmount) || 0;
        const digitalItemCountFromItems = (order.items || []).filter((item) =>
          item?.isDigital === true || String(item?.digitalDownloadScope || '').trim().length > 0
        ).length;
        const hasDigitalDownloads = Boolean(order.hasDigitalItems) || digitalItemCountFromItems > 0;
        const digitalItemCount = Number(order.digitalItemCount || 0) || digitalItemCountFromItems;
        // Only include uncovered shipping cost (not tax or stripe fees)
        const uncoveredShippingCost = Math.max(0, studioShippingCost - shippingCost);
        const otherOrderCosts = uncoveredShippingCost;
        const studioPriceTotal = Math.max(0, studioRevenue - (discount.appliesToItems ? discount.amount : 0));
        // Gross Margin = Studio Price Total - Base Cost Total - Other Order Costs - Stripe Fees
        const grossMargin = studioPriceTotal - baseRevenue - otherOrderCosts - stripeFeeAmount;
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
        const whccSyncSummary = {
          confirmationId: order.whccConfirmationId || null,
          orderNumber: order.whccOrderNumber || null,
          webhookStatus: order.whccWebhookStatus || null,
          webhookEvent: order.whccWebhookEvent || null,
          lastUpdatedAt: submitRunAt || importRunAt || errorRunAt || null,
        };
        const isSuperAdmin = user?.role === 'super_admin';
        const whccPriceAudit = isSuperAdmin ? order.whccPriceAudit : null;
        const whccPriceAuditSummary = whccPriceAudit?.summary || null;
        const whccPriceDifferences = Array.isArray(whccPriceAudit?.differences) ? whccPriceAudit.differences : [];
        const mismatchedWhccPriceDifferences = whccPriceDifferences.filter((item: any) => item?.isMismatch);

        return (
          <>

      <div className="admin-order-detail-header">
        <div>
          <h3>Order #{order.id}</h3>
          <p>{new Date(order.orderDate).toLocaleString()}</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <strong>Status:</strong>
          {(user?.role === 'studio_admin' || user?.role === 'super_admin') ? (
            <select
              value={order.status}
              disabled={statusUpdating}
              onChange={e => handleStatusChange(order.id, e.target.value)}
              style={{ fontSize: 15, padding: '2px 8px', borderRadius: 4 }}
            >
              {orderStatusOptions.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          ) : (
            <span style={{ fontSize: 15 }}>{order.status}</span>
          )}
          <button type="button" className="admin-order-detail-close" onClick={() => updateSelectedOrder(null)}>
            Close
          </button>
        </div>
        {statusUpdateError && <div style={{ color: 'red', marginTop: 6 }}>{statusUpdateError}</div>}
      </div>

      {order.status === 'cancelled' && order.cancelReason && (
        <div style={{
          background: '#fee2e2',
          border: '1px solid #fca5a5',
          borderRadius: 6,
          padding: 12,
          marginBottom: 16,
          color: '#7f1d1d'
        }}>
          <strong>Cancellation Reason:</strong> {order.cancelReason}
          {order.cancelledAt && (
            <div style={{ fontSize: 13, marginTop: 4, opacity: 0.8 }}>
              Cancelled on {new Date(order.cancelledAt).toLocaleString()}
            </div>
          )}
        </div>
      )}

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
            {hasDigitalDownloads && (
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
          <span>{
            (order.items && order.items.length > 0 && order.items.every(item => item.isDigital || String(item.digitalDownloadScope || '').trim().length > 0))
              ? 'digital'
              : (order.shippingOption || 'direct')
          }</span>
          {order.items && order.items.length > 0 && order.items.every(item => item.isDigital || String(item.digitalDownloadScope || '').trim().length > 0)
            ? null
            : <>
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
              </>
          }
        </div>
      </div>

      {/* --- WHCC Preview/Approval UI --- */}
      {canViewWhccDetails && (
        (() => {
          const whccPreview = whccPreviewByOrder[order.id];
          const approvalStatus = whccPreview?.approvalStatus || '';
          const previewPayload = whccPreview?.preview;
          const alreadySubmitted = Boolean(order.whccConfirmationId);
          const resubmitConfirmed = whccResubmitConfirmed[order.id] || false;
          const handleApprove = async () => {
            if (alreadySubmitted && !resubmitConfirmed) {
              setWhccResubmitConfirmed((cur) => ({ ...cur, [order.id]: true }));
              return;
            }
            setWhccApprovalLoading((cur) => ({ ...cur, [order.id]: true }));
            setWhccApprovalError((cur) => ({ ...cur, [order.id]: null }));
            try {
              await approveWhccOrder(order.id);
              await ensureOrderDetailsLoaded(order.id);
              setWhccResubmitConfirmed((cur) => ({ ...cur, [order.id]: false }));
              setMessage('Order approved and submitted to WHCC.');
            } catch (err: any) {
              setWhccApprovalError((cur) => ({ ...cur, [order.id]: err?.response?.data?.error || 'Failed to approve order.' }));
            } finally {
              setWhccApprovalLoading((cur) => ({ ...cur, [order.id]: false }));
            }
          };
          const handleReject = async () => {
            setWhccApprovalLoading((cur) => ({ ...cur, [order.id]: true }));
            setWhccApprovalError((cur) => ({ ...cur, [order.id]: null }));
            try {
              await rejectWhccOrder(order.id);
              await ensureOrderDetailsLoaded(order.id);
              setMessage('Order rejected.');
            } catch (err: any) {
              setWhccApprovalError((cur) => ({ ...cur, [order.id]: err?.response?.data?.error || 'Failed to reject order.' }));
            } finally {
              setWhccApprovalLoading((cur) => ({ ...cur, [order.id]: false }));
            }
          };
          return (
            <div className="whcc-approval-section">
              <div style={{ marginBottom: 8 }}>
                <strong>WHCC Approval Status:</strong>{' '}
                <span className={`whcc-approval-status whcc-approval-status-${approvalStatus}`}>{approvalStatus || 'unknown'}</span>
              </div>
              {approvalStatus === 'pending' && (
                <div style={{ marginBottom: 8 }}>
                  {alreadySubmitted && !resubmitConfirmed && (
                    <div style={{ padding: 10, borderRadius: 8, background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.3)', marginBottom: 10, color: '#fbbf24', fontSize: 13 }}>
                      <strong>⚠ Already submitted to WHCC</strong> — This order was already submitted to WHCC. Do you want to resubmit?
                    </div>
                  )}
                  <button
                    className="btn btn-success"
                    style={{ marginRight: 8 }}
                    disabled={whccApprovalLoading[order.id]}
                    onClick={handleApprove}
                  >
                    {whccApprovalLoading[order.id] ? (alreadySubmitted && !resubmitConfirmed ? 'Processing…' : 'Approving…') : (alreadySubmitted && resubmitConfirmed ? 'Confirm & Resubmit' : 'Approve & Submit to WHCC')}
                  </button>
                  {alreadySubmitted && resubmitConfirmed && (
                    <button
                      className="btn btn-secondary"
                      style={{ marginLeft: 8 }}
                      disabled={whccApprovalLoading[order.id]}
                      onClick={() => setWhccResubmitConfirmed((cur) => ({ ...cur, [order.id]: false }))}
                    >
                      Cancel
                    </button>
                  )}
                  <button
                    className="btn btn-danger"
                    style={{ marginLeft: 8 }}
                    disabled={whccApprovalLoading[order.id] || (alreadySubmitted && !resubmitConfirmed)}
                    onClick={handleReject}
                  >
                    {whccApprovalLoading[order.id] ? 'Rejecting…' : 'Reject'}
                  </button>
                  {whccApprovalError[order.id] && (
                    <div style={{ color: '#fca5a5', marginTop: 6 }}>{whccApprovalError[order.id]}</div>
                  )}
                </div>
              )}
              {previewPayload && (
                <details className="whcc-preview-panel" open>
                  <summary className="whcc-preview-summary">WHCC Order Preview Payload</summary>
                  <pre className="whcc-preview-content">{JSON.stringify(previewPayload, null, 2)}</pre>
                </details>
              )}
            </div>
          );
        })()
      )}
      {/* --- End WHCC Preview/Approval UI --- */}
      {canViewWhccDetails && (hasWhccData || !order.labSubmitted) && (
        <div className="whcc-detail-section">
          <div className="whcc-detail-header">
            <span className="whcc-detail-title">WHCC Lab Details</span>
          </div>
          <div className="whcc-sync-summary" style={{ marginBottom: 14, padding: '12px 14px', borderRadius: 8, background: 'rgba(255, 255, 255, 0.04)', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
            <div style={{ fontWeight: 700, marginBottom: 6, color: '#e5e7eb' }}>Latest WHCC sync</div>
            <div className="whcc-detail-grid" style={{ gap: 10 }}>
              <div className="whcc-detail-field">
                <span className="whcc-detail-label">Confirmation ID</span>
                <span className="whcc-confirmation-id">{whccSyncSummary.confirmationId || 'Pending'}</span>
              </div>
              <div className="whcc-detail-field">
                <span className="whcc-detail-label">WHCC Order #</span>
                <span className="whcc-detail-value">{whccSyncSummary.orderNumber || 'Pending'}</span>
              </div>
              <div className="whcc-detail-field">
                <span className="whcc-detail-label">Webhook Status</span>
                <span className="whcc-detail-value">{whccSyncSummary.webhookStatus || 'Pending'}</span>
              </div>
              <div className="whcc-detail-field">
                <span className="whcc-detail-label">Webhook Event</span>
                <span className="whcc-detail-value">{whccSyncSummary.webhookEvent || 'Pending'}</span>
              </div>
              <div className="whcc-detail-field">
                <span className="whcc-detail-label">Last sync</span>
                <span className="whcc-detail-value">{whccSyncSummary.lastUpdatedAt ? formatDateTime(whccSyncSummary.lastUpdatedAt) : 'Pending'}</span>
              </div>
            </div>
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
            {isSuperAdmin && whccPriceAuditSummary && (
              <>
                <div className="whcc-detail-field">
                  <span className="whcc-detail-label">Expected WHCC Cost</span>
                  <span className="whcc-detail-value">{formatCurrency(whccPriceAuditSummary.expectedTotalCost)}</span>
                </div>
                <div className="whcc-detail-field">
                  <span className="whcc-detail-label">Returned WHCC Cost</span>
                  <span className="whcc-detail-value">{formatCurrency(whccPriceAuditSummary.actualTotalCost)}</span>
                </div>
                <div className="whcc-detail-field">
                  <span className="whcc-detail-label">Cost Difference</span>
                  <span className="whcc-detail-value">{formatCurrency(whccPriceAuditSummary.differenceAmount)}</span>
                </div>
                <div className="whcc-detail-field">
                  <span className="whcc-detail-label">Mismatched Items</span>
                  <span className="whcc-detail-value">{String(whccPriceAuditSummary.mismatchCount || 0)}</span>
                </div>
              </>
            )}
          </div>
          {isSuperAdmin && whccPriceAuditSummary && (
            <div className="whcc-log-panel" style={{ marginBottom: 14 }}>
              <div className="whcc-log-summary" style={{ cursor: 'default' }}>
                <span>WHCC Price Audit</span>
                <span className="whcc-log-run-at">Run: {formatDateTime(whccPriceAudit?.runAt) || 'Unknown'}</span>
              </div>
              <div style={{ padding: '12px 14px' }}>
                {mismatchedWhccPriceDifferences.length ? (
                  <div style={{ display: 'grid', gap: 10 }}>
                    {mismatchedWhccPriceDifferences.map((item: any) => (
                      <div key={`${item.localItemId || item.productUID || item.productName}`} style={{ border: '1px solid rgba(245, 158, 11, 0.28)', borderRadius: 8, padding: '10px 12px', background: 'rgba(15, 23, 42, 0.92)' }}>
                        <div style={{ fontWeight: 700, marginBottom: 4, color: '#f8fafc' }}>
                          {item.productName || `Item ${item.localItemId || 'Unknown'}`}
                        </div>
                        <div style={{ color: '#94a3b8', fontSize: 13 }}>
                          Item #{item.localItemId || '—'} · Qty {item.quantity || 1}
                          {item.expectedVariantName ? ` · Variant ${item.expectedVariantName}` : ''}
                        </div>
                        <div style={{ marginTop: 6, display: 'grid', gap: 4, fontSize: 14 }}>
                          <div style={{ color: '#e5e7eb' }}><strong>Expected:</strong> {formatCurrency(item.expectedLineCost)} ({formatCurrency(item.expectedUnitCost)}/unit)</div>
                          <div style={{ color: '#e5e7eb' }}><strong>WHCC returned:</strong> {formatCurrency(item.actualLineCost)} ({formatCurrency(item.actualUnitCost)}/unit)</div>
                          <div style={{ color: '#e5e7eb' }}><strong>Difference:</strong> {formatCurrency(item.differenceAmount)}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ color: '#94a3b8' }}>No WHCC price differences detected for this submission.</div>
                )}
              </div>
            </div>
          )}
          {order.whccLastError && (
            <div className="whcc-error-box">
              <span className="whcc-error-label">⚠ Last Error</span>
              <pre className="whcc-error-content">
                {formatWhccPayload(order.whccLastError)}
              </pre>
            </div>
          )}
          <div className="whcc-log-list">
            {user?.role === 'super_admin' && renderWhccLogBlock('WHCC Price Audit', order.whccPriceAudit, false, order.whccPriceAudit?.runAt)}
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
          <MemoAdminOrderItemCard key={item.id} item={item} />
        ))}
      </div>

      {hasDigitalDownloads && (
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
                : `✉ Resend Download Link${digitalItemCount > 1 ? 's' : ''}`}
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
        {(discount.amount > 0 || discount.code) && (
          <>
            {discount.code && (
              <div className="admin-order-pricing-row"><span>Coupon</span><span>{discount.code}</span></div>
            )}
            {discount.amount > 0 && (
              <div className="admin-order-pricing-row"><span>Discount</span><span>-${discount.amount.toFixed(2)}</span></div>
            )}
          </>
        )}
        <div className="admin-order-pricing-row admin-order-pricing-total"><span>Total Charged</span><span>${Number(order.totalAmount).toFixed(2)}</span></div>
        <div className="admin-order-pricing-row"><span>Studio Price Total</span><span>${studioPriceTotal.toFixed(2)}</span></div>
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

  const whccPreviewModalPortal = whccPreviewOrderId
    ? ReactDOM.createPortal(
        <WhccPreviewModal
          orderId={whccPreviewOrderId}
          onClose={() => setWhccPreviewOrderId(null)}
          onSubmitted={async (submittedOrderId) => {
            await ensureOrderDetailsLoaded(submittedOrderId);
            await loadData();
            setMessage(`Order #${submittedOrderId} submitted to WHCC. Order details refreshed.`);
          }}
        />,
        document.body
      )
    : null;

  return (
    <AdminLayout>
      <div className="admin-orders-container">
        <div className="admin-orders-header">
          <h1>Orders</h1>
        </div>
        {message && <div className="admin-orders-message">{message}</div>}

        <div className="batch-queue-section">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h2 style={{ margin: 0 }}>Batch Shipping Queue</h2>
            <button
              onClick={() => setBatchSectionCollapsed(!batchSectionCollapsed)}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontSize: 18,
                padding: '0 8px',
                color: '#7cc7ff'
              }}
              title={batchSectionCollapsed ? 'Expand' : 'Collapse'}
            >
              {batchSectionCollapsed ? '▶' : '▼'}
            </button>
          </div>
          {!batchSectionCollapsed && (
            <>
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
                <div className="form-group" style={{ marginTop: '12px' }}>
                  <label htmlFor="batchSpecialInstructions">Special Instructions for WHCC</label>
                  <textarea
                    id="batchSpecialInstructions"
                    className="input"
                    value={batchSpecialInstructions}
                    onChange={(e) => setBatchSpecialInstructions(e.target.value)}
                    rows={3}
                    maxLength={500}
                    placeholder="Optional notes to include in WHCC Special Instructions"
                    style={{ minHeight: '84px', resize: 'vertical' }}
                  />
                  <small style={{ color: 'var(--text-secondary)' }}>
                    Sent with the batch release in WHCC's special instructions field.
                  </small>
                </div>
              </div>






              <button className="batch-action-button" onClick={handleSubmitBatch} disabled={!batchQueue.eligibleOrderIds.length || Boolean(batchReleaseProgress?.active)}>
                {batchReleaseProgress?.active ? 'Submitting Batch Orders…' : 'Release Eligible Batch Orders'}
              </button>
              {/* ...existing code... */}




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
                        {/* Removed Ready Date column */}
                        <th>Total</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {batchQueue.orders.map((order) => {
                        const statusDisplay = getQueueOrderStatusDisplay(order);
                        // Patch: fallback for missing fields
                        const createdAt = order.createdAt;
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
                            {/* Removed Ready Date cell */}
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
              <strong>Studio Profit</strong>
              <div>${shippingReport.studioProfitTotal.toFixed(2)}</div>
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
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              style={{ padding: '8px 12px', borderRadius: '4px', border: '1px solid #ccc', fontFamily: 'inherit' }}
              aria-label="Filter by status"
            >
              <option value="">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="processing">Processing</option>
              <option value="completed">Completed</option>
              <option value="shipped">Shipped</option>
              <option value="cancelled">Cancelled</option>
              <option value="waiting">Waiting</option>
            </select>
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
                              {/* Only show preview button and 'Not submitted' for non-submitted, non-completed orders */}
                              {!order.whccConfirmationId && !order.whccSubmitResponse?.Received && ['pending', 'waiting'].includes(String(order.status).toLowerCase()) ? (
                                <>
                                  <div className="whcc-pill whcc-muted">Not submitted</div>
                                  <button
                                    className="batch-action-button whcc-preview-btn"
                                    style={{ marginTop: 6, marginBottom: 2 }}
                                    onClick={e => { e.stopPropagation(); setWhccPreviewOrderId(order.id); }}
                                  >
                                    View WHCC Preview
                                  </button>
                                </>
                              ) : order.whccConfirmationId ? (
                                <div className="whcc-pill whcc-success">ID: {order.whccConfirmationId}</div>
                              ) : null}
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

                        {/* Batch Status Update UI for expanded group */}
                        {isExpanded && (
                          <tr>
                            <td colSpan={tableColumnCount}>
                              <div className="batch-status-update-section" style={{ margin: '16px 0', padding: '12px', border: '1px solid #eee', borderRadius: '8px', background: '#fafbfc' }}>
                                <h4>Batch Status Update & Notification</h4>
                                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
                                  <label><strong>Status:</strong></label>
                                  <select className="input" style={{ minWidth: 140 }} value={batchStatusUpdate.status} onChange={e => setBatchStatusUpdate(s => ({ ...s, status: e.target.value }))}>
                                    <option value="">Select status…</option>
                                    <option value="completed">Completed</option>
                                    <option value="delivered">Delivered</option>
                                  </select>
                                  <label style={{ marginLeft: 12 }}><strong>Message:</strong></label>
                                  <input className="input" style={{ flex: 1, minWidth: 220 }} maxLength={300} placeholder="e.g. Orders are ready for pickup." value={batchStatusUpdate.message} onChange={e => setBatchStatusUpdate(s => ({ ...s, message: e.target.value }))} />
                                  <button className="batch-action-button" style={{ marginLeft: 12 }}
                                    disabled={group.orders.length === 0 || !batchStatusUpdate.status || batchStatusUpdate.loading}
                                    onClick={async () => {
                                      setBatchStatusUpdate(s => ({ ...s, loading: true, result: '' }));
                                      try {
                                        const orderIds = group.orders.map(o => o.id);
                                        const res = await orderService.batchUpdateStatus(orderIds, batchStatusUpdate.status, batchStatusUpdate.message);
                                        setBatchStatusUpdate(s => ({ ...s, loading: false, result: res?.success ? `Updated ${res.updatedCount} orders and sent emails.` : (res?.error || 'Failed to update orders') }));
                                        await loadData();
                                      } catch (err) {
                                        setBatchStatusUpdate(s => ({ ...s, loading: false, result: 'Failed to update orders.' }));
                                      }
                                    }}>
                                    {batchStatusUpdate.loading ? 'Updating…' : 'Update Status & Notify Customers'}
                                  </button>
                                </div>
                                {batchStatusUpdate.result && <div className="admin-orders-message" style={{ marginTop: 8 }}>{batchStatusUpdate.result}</div>}
                              </div>
                            </td>
                          </tr>
                        )}

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
      {whccPreviewModalPortal}

    </AdminLayout>
  );
};
export default AdminOrders;
