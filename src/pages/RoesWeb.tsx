import { useEffect, useMemo, useRef, useState } from 'react';
import { useCart } from '../contexts/CartContext';
import { roesService } from '../services/roesService';
import './RoesWeb.css';

interface RoesEventBus {
  emit: (event: string, payload?: unknown) => void;
  on: (event: string, handler: (payload: any) => void) => void;
  off?: (event: string, handler: (payload: any) => void) => void;
}

interface RoesGlobal {
  EventBus: RoesEventBus;
}

declare global {
  interface Window {
    $roes?: RoesGlobal;
  }
}

const RWC_SCRIPT_SRC = 'https://roeswebtest.com/roesWebComponents.js';
const RWC_STYLE_HREF = 'https://roeswebtest.com/style.css';
const DEFAULT_ROES_API_KEY =
  'b53d7da12f26a3ba6a21bb5c03b4aa257e70471a25bb771035bc025aeeb6dbc144df9aaa9d462657d599e33ebc20781fc55dd785dff0e56f564eac6666a6d5782e2df22cc5a8afae4ef84837efbe81659231a613d4a7cee3a80dbcf7dec86f63fc1762bf32c4ccb40a42d5abaa54bc2f2bdd5be4ba70c64884cfaf4c5bdcbb8d73d2142c9c35b0d9d0038198d4dc58991e59579236a1682b98b1f92849b3780f';

const sampleProductRef = {
  _id: '12086f5d29d:-8000',
  productpath: '12e9755ca14:-8000/NESuFKS/12086f5d29d:-8000',
};

const sampleImages = [
  {
    id: 'img-1',
    src: 'https://picsum.photos/id/1025/1600/1200',
    width: 1600,
    height: 1200,
    orientation: 'landscape',
    name: 'Sample Labrador',
  },
  {
    id: 'img-2',
    src: 'https://picsum.photos/id/1035/1400/1800',
    width: 1400,
    height: 1800,
    orientation: 'portrait',
    name: 'Sample Mountain',
  },
];

const priceListExample = {
  templates: [{ _id: sampleProductRef._id }],
  op: '+',
  value: 2.5,
};

let assetsPromise: Promise<void> | null = null;

function ensureAssetsLoaded(): Promise<void> {
  if (assetsPromise) return assetsPromise;

  assetsPromise = new Promise<void>((resolve, reject) => {
    try {
      const styleId = 'rwc-style';
      const scriptId = 'rwc-script';

      if (!document.getElementById(styleId)) {
        const link = document.createElement('link');
        link.id = styleId;
        link.rel = 'stylesheet';
        link.href = RWC_STYLE_HREF;
        document.head.appendChild(link);
      }

      const existingScript = document.getElementById(scriptId) as HTMLScriptElement | null;
      if (existingScript && (existingScript as any)._rwcLoaded) {
        resolve();
        return;
      }

      const script = existingScript ?? document.createElement('script');
      script.id = scriptId;
      script.src = RWC_SCRIPT_SRC;
      (script as any)._rwcLoaded = true;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Failed to load ROES Web Components script'));
      if (!existingScript) {
        document.head.appendChild(script);
      }
    } catch (err) {
      reject(err as Error);
    }
  });

  return assetsPromise;
}

const RoesWeb = () => {
  const { addToCart } = useCart();
  const apiKey = useMemo(() => {
    try {
      const stored = localStorage.getItem('roesConfig');
      if (stored) {
        const config = JSON.parse(stored);
        if (config.enabled && config.apiKey) return config.apiKey;
      }
    } catch (err) {
      console.warn('Failed to load ROES config from localStorage');
    }
    return import.meta.env.VITE_ROES_API_KEY || DEFAULT_ROES_API_KEY;
  }, []);
  const [status, setStatus] = useState('Loading ROES Web Components...');
  const [configId, setConfigId] = useState<string | null>(null);
  const [lastCart, setLastCart] = useState<any | null>(null);
  const [workspaceEvent, setWorkspaceEvent] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const initialized = useRef(false);
  const cleanupRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    ensureAssetsLoaded()
      .then(() => {
        if (!window.$roes?.EventBus) {
          setError('ROES Web Components failed to initialize.');
          return;
        }

        const bus = window.$roes.EventBus;
        setStatus('Sending API key...');
        bus.emit('apikey', apiKey);

        const onConfigLoaded = (id: unknown) => {
          setConfigId(String(id ?? 'unknown'));
          setStatus('Config loaded');
        };

        const onAddToCart = async (payload: any) => {
          setLastCart(payload);
          
          // Integrate ROES cart item into app cart if ROES is enabled
          if (roesService.isEnabled()) {
            try {
              // TODO: Update ROES integration to use new addToCart signature with product/size
              console.warn('ROES add to cart temporarily disabled - needs refactoring for new cart signature');
              roesService.logEvent('add_to_cart', { success: false, error: 'Not implemented' });
            } catch (err) {
              roesService.logEvent('add_to_cart', { success: false, error: err });
              console.error('Failed to add ROES item to cart:', err);
            }
          }
        };

        const onWorkspaceChanged = (payload: any) => {
          setWorkspaceEvent(payload);
        };

        bus.on('config_loaded', onConfigLoaded);
        bus.on('add_to_cart', onAddToCart);
        bus.on('workspace_changed', onWorkspaceChanged);

        cleanupRef.current = () => {
          bus.off?.('config_loaded', onConfigLoaded);
          bus.off?.('add_to_cart', onAddToCart);
          bus.off?.('workspace_changed', onWorkspaceChanged);
        };

        setStatus('API key sent — waiting for catalog...');
      })
      .catch((err) => {
        setError((err as Error).message);
      });

    return () => {
      cleanupRef.current();
    };
  }, [apiKey, addToCart]);

  const handleLoadProduct = () => {
    window.$roes?.EventBus.emit('roes_set_product', sampleProductRef);
  };

  const handleLoadImages = () => {
    window.$roes?.EventBus.emit('set_images', sampleImages);
  };

  const handleLoadPriceList = () => {
    window.$roes?.EventBus.emit('set_price_list', priceListExample);
  };

  return (
    <div className="roes-page">
      <div className="roes-panel">
        <div className="roes-header">
          <div>
            <h1>ROES Web Components</h1>
            <p className="roes-subhead">Embedded ROES editor and cart capture.</p>
          </div>
          <div className="roes-status">
            <span className="roes-badge">API key set</span>
            <span className="roes-status-text">{status}</span>
            {configId && <span className="roes-config">Config: {configId}</span>}
            {error && <span className="roes-error">{error}</span>}
          </div>
        </div>

        <div className="roes-actions">
          <button className="btn" onClick={handleLoadProduct} disabled={!!error}>
            Set sample product
          </button>
          <button className="btn" onClick={handleLoadImages} disabled={!!error}>
            Push sample images
          </button>
          <button className="btn" onClick={handleLoadPriceList} disabled={!!error}>
            Apply sample price tweak (+$2.50)
          </button>
        </div>

        <div className="roes-grid">
          <div className="roes-left">
            <div id="roes-order-item-editor" className="roes-editor-shell" />
          </div>
          <div className="roes-right">
            <div className="roes-card">
              <h3>Last add_to_cart event</h3>
              <pre className="roes-pre">
                {lastCart ? JSON.stringify(lastCart, null, 2) : 'Waiting for cart events...'}
              </pre>
            </div>
            <div className="roes-card">
              <h3>Last workspace_changed</h3>
              <pre className="roes-pre">
                {workspaceEvent ? JSON.stringify(workspaceEvent, null, 2) : 'Waiting for editor changes...'}
              </pre>
            </div>
            <div className="roes-card roes-hint">
              <h3>Notes</h3>
              <ul>
                <li>Override the API key via VITE_ROES_API_KEY in .env.local.</li>
                <li>Use add_to_cart payloads to bridge into your CartContext.</li>
                <li>Use roes_render_orderitem_thumbnail to render cart previews.</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RoesWeb;
