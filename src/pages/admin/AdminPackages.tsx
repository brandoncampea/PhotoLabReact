import React, { useEffect, useState } from 'react';
import AdminPackages from '../../components/AdminPackages';
import { productService } from '../../services/productService';
import { studioPriceListService } from '../../services/studioPriceListService';
import { useAuth } from '../../contexts/AuthContext';

const AdminPackagesPage: React.FC = () => {
  const { user } = useAuth();
  const effectiveStudioId = Number(localStorage.getItem('viewAsStudioId') || user?.studioId || 0);
  const [products, setProducts] = useState<any[]>([]);
  const [priceLists, setPriceLists] = useState<any[]>([]);
  const [selectedPriceListId, setSelectedPriceListId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch price lists on mount
  useEffect(() => {
    const fetchPriceLists = async () => {
      setLoading(true);
      try {
        const priceListData = effectiveStudioId ? await studioPriceListService.getLists(effectiveStudioId) : [];
        setPriceLists(Array.isArray(priceListData) ? priceListData : []);
        if (Array.isArray(priceListData) && priceListData.length > 0) {
          setSelectedPriceListId(priceListData[0].id);
        }
      } catch (err) {
        setError('Failed to load price lists');
      } finally {
        setLoading(false);
      }
    };
    fetchPriceLists();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveStudioId]);

  // Fetch offered products for selected price list
  useEffect(() => {
    const fetchProducts = async () => {
      if (!selectedPriceListId) {
        setProducts([]);
        return;
      }
      setLoading(true);
      try {
        const items = await studioPriceListService.getItems(selectedPriceListId);
        // Only include offered items and group by product, with sizes and category
        const offered = (items || []).filter((item: any) => !!item.is_offered);
        // Group by product id
        const grouped: Record<string, any> = {};
        offered.forEach((item: any) => {
          if (!grouped[item.product_id]) {
            grouped[item.product_id] = {
              id: item.product_id,
              name: item.product_name,
              category: item.product_category || 'Uncategorized',
              sizes: [],
            };
          }
          grouped[item.product_id].sizes.push({
            id: item.product_size_id,
            name: item.size_name,
            cost: item.base_cost,
          });
        });
        setProducts(Object.values(grouped));
      } catch (err) {
        setProducts([]);
      } finally {
        setLoading(false);
      }
    };
    fetchProducts();
  }, [selectedPriceListId]);

  if (loading) return <div>Loading products and price lists...</div>;
  if (error) return <div>{error}</div>;

  return (
    <div>
      <h2>Manage Packages</h2>
      {priceLists.length === 0 ? (
        <div>No price lists found. Please create a price list first.</div>
      ) : (
        <div style={{ marginBottom: 20 }}>
          <label htmlFor="price-list-select" style={{ marginRight: 8 }}>Select Price List:</label>
          <select
            id="price-list-select"
            value={selectedPriceListId ?? ''}
            onChange={e => setSelectedPriceListId(Number(e.target.value))}
          >
            {priceLists.map((pl: any) => (
              <option key={pl.id} value={pl.id}>{pl.name}</option>
            ))}
          </select>
        </div>
      )}
      {selectedPriceListId && (
        <AdminPackages products={products} priceListId={selectedPriceListId} />
      )}
    </div>
  );
};

export default AdminPackagesPage;
