import React, { useState } from 'react';


interface Product {
  id: any;
  name: string;
  sizes: any[];
}

interface PackageItem {
  productId: any;
  sizeId: any;
  quantity: number;
}

interface Package {
  id: string;
  name: string;
  price: number;
  items: PackageItem[];
}

interface AdminPackagesProps {
  products: Product[];
}

const AdminPackages: React.FC<AdminPackagesProps> = ({ products }) => {
  const [packages, setPackages] = useState<Package[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<{ name: string; price: number; items: PackageItem[] }>({ name: '', price: 0, items: [] });
  const [productFilter, setProductFilter] = useState('');
  const [sizeFilter, setSizeFilter] = useState('');

  // Helper to get cost for a package
  const getPackageCost = (pkg: Package | typeof form) => {
    return pkg.items.reduce((sum, item) => {
      const product = products.find(p => p.id === item.productId);
      const size = product?.sizes.find((s: any) => s.id === item.sizeId);
      return sum + ((size?.cost || 0) * item.quantity);
    }, 0);
  };

  const getPackageProfit = (pkg: Package | typeof form) => pkg.price - getPackageCost(pkg);

  // Form handlers
  const handleSelectItem = (productId: any, sizeId: any, checked: boolean) => {
    setForm(prev => {
      if (checked) {
        if (!prev.items.some(item => item.productId === productId && item.sizeId === sizeId)) {
          return { ...prev, items: [...prev.items, { productId, sizeId, quantity: 1 }] };
        }
        return prev;
      } else {
        return { ...prev, items: prev.items.filter(item => !(item.productId === productId && item.sizeId === sizeId)) };
      }
    });
  };

  const handleQuantityChange = (productId: any, sizeId: any, quantity: number) => {
    setForm(prev => ({
      ...prev,
      items: prev.items.map(item =>
        item.productId === productId && item.sizeId === sizeId
          ? { ...item, quantity }
          : item
      ),
    }));
  };

  const handleSave = () => {
    if (!form.name.trim()) return;
    if (editingId) {
      setPackages(pkgs => pkgs.map(pkg => pkg.id === editingId ? { ...form, id: editingId } : pkg));
      setEditingId(null);
    } else {
      setPackages(pkgs => [...pkgs, { ...form, id: Date.now().toString() }]);
    }
    setForm({ name: '', price: 0, items: [] });
  };

  const handleEdit = (pkg: Package) => {
    setEditingId(pkg.id);
    setForm({ name: pkg.name, price: pkg.price, items: pkg.items });
  };

  const handleDelete = (id: string) => {
    setPackages(pkgs => pkgs.filter(pkg => pkg.id !== id));
    if (editingId === id) setEditingId(null);
  };

  return (
    <div>
      <h3>{editingId ? 'Edit Package' : 'Create Package'}</h3>
      <div style={{ border: '1px solid #ccc', padding: 16, marginBottom: 24, borderRadius: 8 }}>
        <div style={{ marginBottom: 8 }}>
          <label style={{ marginRight: 8 }}>Package Name:</label>
          <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} style={{ width: 200, marginRight: 16 }} />
          <label style={{ marginRight: 8 }}>Package Price:</label>
          <input type="number" value={form.price} min={0} step={0.01} onChange={e => setForm(f => ({ ...f, price: Number(e.target.value) }))} style={{ width: 100 }} />
        </div>
        {/* Filters */}
        <div style={{ display: 'flex', gap: 16, marginBottom: 12 }}>
          <input
            type="text"
            placeholder="Filter by product name"
            value={productFilter}
            onChange={e => setProductFilter(e.target.value)}
            style={{ minWidth: 180 }}
          />
          <input
            type="text"
            placeholder="Filter by size name"
            value={sizeFilter}
            onChange={e => setSizeFilter(e.target.value)}
            style={{ minWidth: 140 }}
          />
        </div>
        <table style={{ width: '100%', marginBottom: 8 }}>
          <thead>
            <tr>
              <th>Select</th>
              <th>Product</th>
              <th>Size</th>
              <th>Quantity</th>
              <th>Cost</th>
            </tr>
          </thead>
          <tbody>
            {products.flatMap(product =>
              product.sizes
                .filter((size: any) =>
                  product.name.toLowerCase().includes(productFilter.toLowerCase()) &&
                  size.name.toLowerCase().includes(sizeFilter.toLowerCase())
                )
                .map((size: any) => {
                  const checked = form.items.some(item => item.productId === product.id && item.sizeId === size.id);
                  const quantity = form.items.find(item => item.productId === product.id && item.sizeId === size.id)?.quantity || 1;
                  return (
                    <tr key={product.id + '-' + size.id}>
                      <td>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={e => handleSelectItem(product.id, size.id, e.target.checked)}
                        />
                      </td>
                      <td>{product.name}</td>
                      <td>{size.name}</td>
                      <td>
                        <input
                          type="number"
                          min={1}
                          value={quantity}
                          disabled={!checked}
                          onChange={e => handleQuantityChange(product.id, size.id, Math.max(1, Number(e.target.value)))}
                          style={{ width: 60 }}
                        />
                      </td>
                      <td>{((size.cost || 0) * quantity).toLocaleString('en-US', { style: 'currency', currency: 'USD' })}</td>
                    </tr>
                  );
                })
            )}
          </tbody>
        </table>
        <div style={{ marginTop: 8 }}>
          <strong>Package Cost:</strong> {getPackageCost(form).toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
          <span style={{ marginLeft: 24, color: getPackageProfit(form) >= 0 ? 'green' : 'red' }}>
            <strong>Package Profit:</strong> {getPackageProfit(form).toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
          </span>
        </div>
        <button onClick={handleSave} style={{ marginTop: 12 }}>{editingId ? 'Update Package' : 'Save Package'}</button>
        {editingId && <button onClick={() => { setEditingId(null); setForm({ name: '', price: 0, items: [] }); }} style={{ marginLeft: 12 }}>Cancel</button>}
      </div>
      <h3>Saved Packages</h3>
      <table style={{ width: '100%' }}>
        <thead>
          <tr>
            <th>Name</th>
            <th>Products & Sizes</th>
            <th>Price</th>
            <th>Cost</th>
            <th>Profit</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {packages.map(pkg => (
            <tr key={pkg.id}>
              <td>{pkg.name}</td>
              <td>
                {pkg.items.length === 0 ? (
                  <span style={{ color: '#aaa' }}>No items</span>
                ) : (
                  <ul style={{ margin: 0, paddingLeft: 18 }}>
                    {pkg.items.map(item => {
                      const product = products.find(p => p.id === item.productId);
                      const size = product?.sizes.find((s: any) => s.id === item.sizeId);
                      return (
                        <li key={item.productId + '-' + item.sizeId}>
                          {product?.name || 'Unknown Product'}
                          {size ? ` - ${size.name}` : ''}
                          {item.quantity > 1 ? ` (x${item.quantity})` : ''}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </td>
              <td>{pkg.price.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}</td>
              <td>{getPackageCost(pkg).toLocaleString('en-US', { style: 'currency', currency: 'USD' })}</td>
              <td style={{ color: getPackageProfit(pkg) >= 0 ? 'green' : 'red' }}>{getPackageProfit(pkg).toLocaleString('en-US', { style: 'currency', currency: 'USD' })}</td>
              <td>
                <button onClick={() => handleEdit(pkg)}>Edit</button>
                <button onClick={() => handleDelete(pkg.id)} style={{ marginLeft: 8 }}>Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default AdminPackages;
