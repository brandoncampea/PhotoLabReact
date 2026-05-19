import React, { useState, useEffect } from 'react';
import {
  startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear, subWeeks, subMonths, subYears, format
} from 'date-fns';
import styles from './Reports.module.css';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';
import { studioService, Studio } from '../services/studioService';

const REPORTS = [
  { key: 'orders', label: 'Orders' },
  { key: 'sales-summary', label: 'Sales Summary' },
  { key: 'photo-uploads', label: 'Photo Uploads' },
  { key: 'product-popularity', label: 'Product Popularity' },
  { key: 'customer-list', label: 'Customer List' },
  { key: 'studio-sales-comparison', label: 'Studio Sales Comparison', superAdmin: true },
  { key: 'top-products', label: 'Top Products Across Studios', superAdmin: true },
  { key: 'studio-activity', label: 'Studio Activity', superAdmin: true },
  { key: 'failed-orders', label: 'Failed/Cancelled Orders' },
];

const Reports: React.FC = () => {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'super_admin';
  const [report, setReport] = useState(REPORTS[0].key);
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const handleQuickRange = (range: string) => {
    const today = new Date();
    let s = '', e = '';
    switch (range) {
      case 'this-week':
        s = format(startOfWeek(today, { weekStartsOn: 1 }), 'yyyy-MM-dd');
        e = format(endOfWeek(today, { weekStartsOn: 1 }), 'yyyy-MM-dd');
        break;
      case 'last-week': {
        const last = subWeeks(today, 1);
        s = format(startOfWeek(last, { weekStartsOn: 1 }), 'yyyy-MM-dd');
        e = format(endOfWeek(last, { weekStartsOn: 1 }), 'yyyy-MM-dd');
        break;
      }
      case 'this-month':
        s = format(startOfMonth(today), 'yyyy-MM-dd');
        e = format(endOfMonth(today), 'yyyy-MM-dd');
        break;
      case 'last-month': {
        const last = subMonths(today, 1);
        s = format(startOfMonth(last), 'yyyy-MM-dd');
        e = format(endOfMonth(last), 'yyyy-MM-dd');
        break;
      }
      case 'this-year':
        s = format(startOfYear(today), 'yyyy-MM-dd');
        e = format(endOfYear(today), 'yyyy-MM-dd');
        break;
      case 'last-year': {
        const last = subYears(today, 1);
        s = format(startOfYear(last), 'yyyy-MM-dd');
        e = format(endOfYear(last), 'yyyy-MM-dd');
        break;
      }
      default:
        break;
    }
    setStart(s);
    setEnd(e);
  };
  const [studioIds, setStudioIds] = useState<string[]>([]);
  const [studios, setStudios] = useState<Studio[]>([]);
    useEffect(() => {
      if (isSuperAdmin) {
        studioService.getAll().then(setStudios).catch(() => setStudios([]));
      }
    }, [isSuperAdmin]);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState('');

  const handleDownload = async () => {
    setError('');
    setDownloading(true);
    try {
      const params: any = {};
      // Only send valid, non-empty start/end
      if (start && /^\d{4}-\d{2}-\d{2}$/.test(start)) params.start = start;
      if (end && /^\d{4}-\d{2}-\d{2}$/.test(end)) params.end = end;
      // Only send studioIds if all are valid numbers and not empty
      if (
        isSuperAdmin &&
        studioIds.length > 0 &&
        studioIds.every(id => id && /^\d+$/.test(id)) &&
        report !== 'studio-sales-comparison' &&
        report !== 'top-products' &&
        report !== 'studio-activity'
      ) {
        params.studioIds = studioIds;
      }
      const response = await api.get(`/reports/${report}`, {
        params,
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${report}_report.csv`);
      document.body.appendChild(link);
      link.click();
      link.parentNode?.removeChild(link);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to download report');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className={styles['reports-section']}>
      <h2>Reports</h2>
      <div className={styles['report-controls']}>
        <label>
          Report:
          <select value={report} onChange={e => setReport(e.target.value)}>
            {REPORTS.filter(r => !r.superAdmin || isSuperAdmin).map(r => (
              <option key={r.key} value={r.key}>{r.label}</option>
            ))}
          </select>
        </label>
        <label>
          Start Date:
          <input type="date" value={start} onChange={e => setStart(e.target.value)} />
        </label>
        <label>
          End Date:
          <input type="date" value={end} onChange={e => setEnd(e.target.value)} />
        </label>
        <label style={{ minWidth: 180 }}>
          Quick Range:
          <select onChange={e => { if (e.target.value) handleQuickRange(e.target.value); }} defaultValue="">
            <option value="">Select...</option>
            <option value="this-week">This Week</option>
            <option value="last-week">Last Week</option>
            <option value="this-month">This Month</option>
            <option value="last-month">Last Month</option>
            <option value="this-year">This Year</option>
            <option value="last-year">Last Year</option>
          </select>
        </label>
        {isSuperAdmin && report !== 'studio-sales-comparison' && report !== 'top-products' && report !== 'studio-activity' && (
          <label>
            Studio ID:
            <select
              multiple
              value={studioIds}
              onChange={e => {
                const options = Array.from(e.target.selectedOptions).map(opt => opt.value);
                setStudioIds(options);
              }}
              style={{ minWidth: 180, minHeight: 80 }}
            >
              <option value="" disabled>
                All Studios
              </option>
              {studios.map(studio => (
                <option key={studio.id} value={studio.id.toString()}>
                  {studio.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <button onClick={handleDownload} disabled={downloading}>
          {downloading ? 'Downloading...' : 'Download CSV'}
        </button>
      </div>
      {error && <div className={styles.error}>{error}</div>}
    </div>
  );
};

export default Reports;
