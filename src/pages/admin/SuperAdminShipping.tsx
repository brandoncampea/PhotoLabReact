

import React, { useState, useEffect } from 'react';
import { shippingService } from '../../services/shippingService';
// Removed unused ShippingConfig import

const toDateTimeLocalValue = (value?: string | null) => {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return String(value).slice(0, 16);
  }
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  const hours = String(parsed.getHours()).padStart(2, '0');
  const minutes = String(parsed.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
};

const toApiDateTimeValue = (value: string) => {
  if (!value) return value;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toISOString();
};


const SuperAdminShipping = () => {
    const [rubric, setRubric] = useState(null);
    const [rubricDraft, setRubricDraft] = useState(null);
    const [rubricLoading, setRubricLoading] = useState(true);
    const [rubricError, setRubricError] = useState('');
    const [rubricMessage, setRubricMessage] = useState('');
    // Load rubric
    useEffect(() => {
      const loadRubric = async () => {
        setRubricLoading(true);
        setRubricError('');
        try {
          const data = await shippingService.getRubric();
          setRubric(data);
          setRubricDraft(JSON.parse(JSON.stringify(data.matrix)));
        } catch (e) {
          setRubricError('Failed to load shipping rubric');
        } finally {
          setRubricLoading(false);
        }
      };
      loadRubric();
    }, []);
    const handleRubricInput = (group, dest, value) => {
      setRubricDraft((prev) => {
        const next = { ...prev };
        if (!next[group]) next[group] = {};
        next[group][dest] = value;
        return next;
      });
    };

    const handleSaveRubric = async () => {
      setRubricMessage('');
      try {
        await shippingService.updateRubric({ matrix: rubricDraft });
        setRubricMessage('✓ Shipping rubric updated!');
        // Reload rubric from server
        const data = await shippingService.getRubric();
        setRubric(data);
        setRubricDraft(JSON.parse(JSON.stringify(data.matrix)));
      } catch (e) {
        setRubricMessage('✗ Failed to update rubric');
      }
      setTimeout(() => setRubricMessage(''), 2000);
    };
    // Add updateRubric to shippingService if not present
    if (!shippingService.updateRubric) {
      shippingService.updateRubric = async (body) => {
        const response = await shippingService.__api.put('/shipping/rubric', body);
        return response.data;
      };
      shippingService.__api = require('../../services/api').default;
    }
  // Removed unused config state
  const [batchDeadline, setBatchDeadline] = useState('');
  const [directShippingCharge, setDirectShippingCharge] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadConfig = async () => {
      setLoading(true);
      try {
        const data = await shippingService.getConfig();
        // Removed unused setConfig
        setBatchDeadline(toDateTimeLocalValue(data.batchDeadline));
        setDirectShippingCharge(data.directShippingCharge?.toString() || '');
        setIsActive(!!data.isActive);
      } catch (e) {
        setMessage('Failed to load shipping config');
      } finally {
        setLoading(false);
      }
    };
    loadConfig();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage('');
    try {
      await shippingService.updateConfig({
        batchDeadline: toApiDateTimeValue(batchDeadline),
        directShippingCharge: parseFloat(directShippingCharge),
        isActive,
      });
      // Removed unused setConfig
      setMessage('Shipping config updated!');
    } catch (e) {
      setMessage('Failed to update shipping config');
    }
    setTimeout(() => setMessage(''), 2000);
  };

  return (
    <>
      <h1 data-testid="superadmin-shipping-heading">Super Admin Shipping Settings</h1>
      <div className="superadmin-shipping-content">
        {loading ? (
          <div>Loading...</div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="batchDeadline">Batch Deadline</label>
              <input
                id="batchDeadline"
                type="datetime-local"
                className="superadmin-shipping-input"
                value={batchDeadline}
                onChange={e => setBatchDeadline(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="directShippingCharge">Direct Shipping Charge ($)</label>
              <input
                id="directShippingCharge"
                type="number"
                className="superadmin-shipping-input"
                value={directShippingCharge}
                onChange={e => setDirectShippingCharge(e.target.value)}
                min="0"
                step="0.01"
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="isActive">Batch Shipping Active</label>
              <input
                id="isActive"
                type="checkbox"
                checked={isActive}
                onChange={e => setIsActive(e.target.checked)}
              />
            </div>
            <button type="submit" className="superadmin-save">Save</button>
          </form>
        )}
        {message && <div className="success-message">{message}</div>}

        <div style={{ marginTop: 40 }}>
          <h2>WHCC Shipping Rubric (Super Admin Editable)</h2>
          {rubricLoading ? (
            <div>Loading rubric…</div>
          ) : rubricError ? (
            <div style={{ color: 'red' }}>{rubricError}</div>
          ) : rubric && rubricDraft ? (
            <form onSubmit={e => { e.preventDefault(); handleSaveRubric(); }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, marginBottom: 16 }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', padding: 10, borderBottom: '1px solid #ccc' }}>Product Group</th>
                    {Object.values(rubric.destinations).map(dest => (
                      <th key={dest} style={{ textAlign: 'right', padding: 10, borderBottom: '1px solid #ccc' }}>{dest}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(rubricDraft).map(([group, groupRules]) => (
                    <tr key={group}>
                      <td style={{ padding: 10, borderBottom: '1px solid #eee', fontWeight: 600 }}>{group}</td>
                      {Object.values(rubric.destinations).map(dest => (
                        <td key={group + '-' + dest} style={{ padding: 10, borderBottom: '1px solid #eee', textAlign: 'right' }}>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={groupRules[dest] ?? ''}
                            onChange={e => handleRubricInput(group, dest, e.target.value === '' ? '' : Number(e.target.value))}
                            style={{ width: 80, textAlign: 'right' }}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              <button type="submit" className="btn btn-primary">Save Rubric</button>
              {rubricMessage && <div style={{ marginTop: 10, color: rubricMessage.startsWith('✓') ? 'green' : 'red' }}>{rubricMessage}</div>}
            </form>
          ) : null}
        </div>
      </div>
    </>
  );
};

export default SuperAdminShipping;
