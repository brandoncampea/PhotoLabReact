import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { orderService } from '../../services/orderService';
import { WhccPriceAuditReport } from '../../types';

const formatCurrency = (value: unknown) => {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
};

const formatDateTime = (value: unknown) => {
  if (!value) return '—';
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString();
};

const SuperAdminWhccPriceAudit: React.FC = () => {
  const [report, setReport] = useState<WhccPriceAuditReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchDraft, setSearchDraft] = useState('');
  const [search, setSearch] = useState('');
  const [expandedOrderIds, setExpandedOrderIds] = useState<Record<number, boolean>>({});

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await orderService.getWhccPriceAuditReport({ limit: 200, search });
        if (!cancelled) {
          setReport(data);
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.response?.data?.error || err?.message || 'Failed to load WHCC price audit report');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [search]);

  const rows = useMemo(() => report?.results || [], [report]);

  return (
    <div style={{ padding: 24, maxWidth: 1400, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', marginBottom: 24, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0 }}>WHCC Price Audit</h1>
          <p style={{ margin: '8px 0 0', color: '#64748b' }}>
            Super-admin-only report of stored WHCC responses compared against current order-item WHCC cost snapshots.
          </p>
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            setSearch(searchDraft.trim());
          }}
          style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}
        >
          <input
            value={searchDraft}
            onChange={(event) => setSearchDraft(event.target.value)}
            placeholder="Search order #, WHCC #, studio, or customer email"
            style={{ minWidth: 320, padding: '10px 12px', borderRadius: 8, border: '1px solid #cbd5e1' }}
          />
          <button type="submit" className="btn">Search</button>
          {search && (
            <button
              type="button"
              className="btn"
              onClick={() => {
                setSearchDraft('');
                setSearch('');
              }}
            >
              Clear
            </button>
          )}
        </form>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 24 }}>
        <div style={{ padding: 16, border: '1px solid #e2e8f0', borderRadius: 12, background: '#fff' }}>
          <div style={{ color: '#64748b', fontSize: 13 }}>Orders Scanned</div>
          <div style={{ fontSize: 28, fontWeight: 700 }}>{report?.summary.ordersScanned ?? 0}</div>
        </div>
        <div style={{ padding: 16, border: '1px solid #e2e8f0', borderRadius: 12, background: '#fff' }}>
          <div style={{ color: '#64748b', fontSize: 13 }}>Orders With Mismatch</div>
          <div style={{ fontSize: 28, fontWeight: 700 }}>{report?.summary.ordersWithMismatch ?? 0}</div>
        </div>
        <div style={{ padding: 16, border: '1px solid #e2e8f0', borderRadius: 12, background: '#fff' }}>
          <div style={{ color: '#64748b', fontSize: 13 }}>Mismatch Items</div>
          <div style={{ fontSize: 28, fontWeight: 700 }}>{report?.summary.mismatchItems ?? 0}</div>
        </div>
        <div style={{ padding: 16, border: '1px solid #e2e8f0', borderRadius: 12, background: '#fff' }}>
          <div style={{ color: '#64748b', fontSize: 13 }}>Net Difference</div>
          <div style={{ fontSize: 28, fontWeight: 700 }}>{formatCurrency(report?.summary.totalDifferenceAmount ?? 0)}</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20, color: '#64748b', fontSize: 13 }}>
        <span style={{ padding: '4px 10px', borderRadius: 999, background: '#fff7ed', border: '1px solid #fed7aa' }}>Expected = your calculated WHCC product cost</span>
        <span style={{ padding: '4px 10px', borderRadius: 999, background: '#eff6ff', border: '1px solid #bfdbfe' }}>Returned = WHCC import/submit response amount</span>
        <span style={{ padding: '4px 10px', borderRadius: 999, background: '#f8fafc', border: '1px solid #cbd5e1' }}>Difference = Returned − Expected</span>
      </div>

      {loading && <div style={{ color: '#475569' }}>Loading WHCC audit report…</div>}
      {error && <div style={{ color: '#b91c1c', marginBottom: 16 }}>{error}</div>}
      {!loading && !error && rows.length === 0 && (
        <div style={{ padding: 24, border: '1px solid #e2e8f0', borderRadius: 12, background: '#fff' }}>
          No WHCC price mismatches found for the scanned orders.
        </div>
      )}

      <div style={{ display: 'grid', gap: 16 }}>
        {rows.map((row) => {
          const mismatches = (row.audit?.differences || []).filter((item) => item?.isMismatch);
          const isExpanded = Boolean(expandedOrderIds[row.orderId]);
          return (
            <div key={row.orderId} style={{ border: '1px solid #e2e8f0', borderRadius: 12, background: '#fff', overflow: 'hidden', boxShadow: '0 1px 2px rgba(15,23,42,0.04)' }}>
              <button
                type="button"
                onClick={() => setExpandedOrderIds((current) => ({ ...current, [row.orderId]: !current[row.orderId] }))}
                style={{
                  width: '100%',
                  padding: 16,
                  border: 'none',
                  borderBottom: isExpanded ? '1px solid #e2e8f0' : 'none',
                  background: '#f8fafc',
                  textAlign: 'left',
                  cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: 20, fontWeight: 700 }}>
                      {isExpanded ? '▼' : '▶'} Order #{row.orderId}
                    </div>
                    <div style={{ color: '#475569', marginTop: 4 }}>
                      {row.studioName || 'Unknown studio'} · {row.customerEmail || row.customerName || 'Unknown customer'}
                    </div>
                    <div style={{ color: '#64748b', fontSize: 13, marginTop: 4 }}>
                      {formatDateTime(row.orderDate)} · Status: {row.status || '—'} · WHCC #: {row.whccOrderNumber || '—'}
                    </div>
                    <div style={{ marginTop: 6 }}>
                      <Link to={`/admin/orders?orderId=${row.orderId}`} onClick={(event) => event.stopPropagation()} style={{ color: '#2563eb', fontSize: 13 }}>
                        Open order ↗
                      </Link>
                    </div>
                  </div>
                  <div style={{ minWidth: 300, display: 'grid', gap: 8, fontSize: 14 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, alignItems: 'center' }}>
                      <span style={{ color: '#64748b' }}>Expected</span>
                      <strong>{formatCurrency(row.audit?.summary?.expectedTotalCost ?? 0)}</strong>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, alignItems: 'center' }}>
                      <span style={{ color: '#64748b' }}>WHCC returned</span>
                      <strong>{formatCurrency(row.audit?.summary?.actualTotalCost ?? 0)}</strong>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, alignItems: 'center' }}>
                      <span style={{ color: '#64748b' }}>Difference</span>
                      <strong style={{ color: Number(row.audit?.summary?.differenceAmount || 0) === 0 ? '#0f172a' : '#b45309' }}>
                        {formatCurrency(row.audit?.summary?.differenceAmount ?? 0)}
                      </strong>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, alignItems: 'center' }}>
                      <span style={{ color: '#64748b' }}>Mismatches</span>
                      <strong>{row.audit?.summary?.mismatchCount ?? 0}</strong>
                    </div>
                  </div>
                </div>
              </button>
              {isExpanded && (
                <div style={{ padding: 16, display: 'grid', gap: 10 }}>
                  {mismatches.map((item, index) => (
                    <div key={`${row.orderId}-${item.localItemId || index}`} style={{ padding: 14, borderRadius: 10, border: '1px solid #fed7aa', background: '#fffaf0' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'baseline' }}>
                        <div style={{ fontWeight: 700 }}>{item.productName || `Item ${item.localItemId || index + 1}`}</div>
                        <div style={{ color: '#b45309', fontWeight: 700 }}>{formatCurrency(item.differenceAmount)}</div>
                      </div>
                      <div style={{ color: '#64748b', fontSize: 13, marginTop: 4 }}>
                        Item #{item.localItemId || '—'} · Qty {item.quantity || 1}
                        {item.expectedVariantName ? ` · Variant ${item.expectedVariantName}` : ''}
                      </div>
                      <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, fontSize: 14 }}>
                        <div style={{ padding: 10, borderRadius: 8, background: '#fff', border: '1px solid #fde68a' }}>
                          <div style={{ color: '#92400e', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.3 }}>Expected</div>
                          <div style={{ fontWeight: 700 }}>{formatCurrency(item.expectedLineCost)}</div>
                          <div style={{ color: '#64748b', fontSize: 12 }}>{formatCurrency(item.expectedUnitCost)}/unit</div>
                        </div>
                        <div style={{ padding: 10, borderRadius: 8, background: '#fff', border: '1px solid #bfdbfe' }}>
                          <div style={{ color: '#1d4ed8', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.3 }}>WHCC Returned</div>
                          <div style={{ fontWeight: 700 }}>{formatCurrency(item.actualLineCost)}</div>
                          <div style={{ color: '#64748b', fontSize: 12 }}>{formatCurrency(item.actualUnitCost)}/unit</div>
                        </div>
                        <div style={{ padding: 10, borderRadius: 8, background: '#fff', border: '1px solid #fecaca' }}>
                          <div style={{ color: '#b91c1c', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.3 }}>Difference</div>
                          <div style={{ fontWeight: 700 }}>{formatCurrency(item.differenceAmount)}</div>
                          <div style={{ color: '#64748b', fontSize: 12 }}>{item.matchedResponsePath || 'Matched from WHCC response'}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                  {!mismatches.length && (
                    <div style={{ color: '#64748b', fontSize: 14 }}>No mismatches for this order.</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default SuperAdminWhccPriceAudit;
