


import { useState } from 'react';
import AdminWhccConfig from './AdminWhccConfig';
import AdminRoesConfig from './AdminRoesConfig';
import AdminMpixConfig from './AdminMpixConfig';


export default function AdminLabs() {
  const [tab, setTab] = useState<'whcc' | 'roes' | 'mpix'>('whcc');

  return (
    <div style={{ maxWidth: 900, margin: '2rem auto', padding: '2rem', background: '#191929', borderRadius: 12, boxShadow: '0 4px 24px rgba(0,0,0,0.25)' }}>
      <div style={{ display: 'flex', gap: 12, marginBottom: 32 }}>
        <button
          onClick={() => setTab('whcc')}
          style={{
            background: tab === 'whcc' ? '#232336' : 'transparent',
            color: tab === 'whcc' ? '#fff' : '#b3b8d1',
            border: '1px solid #39395a',
            borderRadius: 6,
            padding: '6px 18px',
            fontWeight: 700,
            fontSize: '1rem',
            cursor: 'pointer',
            letterSpacing: '0.02em',
            outline: 'none',
            transition: 'background 0.15s, color 0.15s',
          }}
        >
          WHCC
        </button>
        <button
          onClick={() => setTab('roes')}
          style={{
            background: tab === 'roes' ? '#232336' : 'transparent',
            color: tab === 'roes' ? '#fff' : '#b3b8d1',
            border: '1px solid #39395a',
            borderRadius: 6,
            padding: '6px 18px',
            fontWeight: 700,
            fontSize: '1rem',
            cursor: 'pointer',
            letterSpacing: '0.02em',
            outline: 'none',
            transition: 'background 0.15s, color 0.15s',
          }}
        >
          ROES
        </button>
        <button
          onClick={() => setTab('mpix')}
          style={{
            background: tab === 'mpix' ? '#232336' : 'transparent',
            color: tab === 'mpix' ? '#fff' : '#b3b8d1',
            border: '1px solid #39395a',
            borderRadius: 6,
            padding: '6px 18px',
            fontWeight: 700,
            fontSize: '1rem',
            cursor: 'pointer',
            letterSpacing: '0.02em',
            outline: 'none',
            transition: 'background 0.15s, color 0.15s',
          }}
        >
          Mpix
        </button>
      </div>
      <div>
        {tab === 'whcc' && <AdminWhccConfig />}
        {tab === 'roes' && <AdminRoesConfig />}
        {tab === 'mpix' && <AdminMpixConfig />}
      </div>
    </div>
  );
}
