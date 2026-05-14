import React, { useState, useEffect } from 'react';
import { User as FirebaseUser } from 'firebase/auth';
import { type Product, UserRole } from '../db';
import { Plus, Search, Edit2, Trash2, AlertTriangle, Package, Database, Sparkles, Loader2 } from 'lucide-react';
import { formatCurrency, cn } from '../lib/utils';
import { db } from '../lib/firebase';
import { collection, query, where, getDocs, doc, writeBatch, getDoc } from 'firebase/firestore';
import { saveInventoryProduct, deleteInventoryProduct, withTimeout } from '../lib/firestore';
import { PRODUCT_CATEGORIES } from '../constants/categories';
import { ProductForm } from './ProductForm';

export function Inventory({ user, ownerId, role }: { user: FirebaseUser; ownerId: string; role: UserRole | null }) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<'recent' | 'oldest' | 'name'>('recent');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterLowStock, setFilterLowStock] = useState(false);

  const canEdit = role === 'admin' || role === 'inventory_manager';
  const showCostPrice = role === 'admin' || role === 'inventory_manager' || role === 'ca';

  const [products, setProducts] = useState<Product[]>([]);
  const [profile, setProfile] = useState<any>(null);
  const [aiInput, setAiInput] = useState('');
  const [isAILoading, setIsAILoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const handleAIQuickAdd = async () => {
    if (!aiInput.trim()) return;
    setIsAILoading(true);

    try {
      const response = await fetch('/api/assistant/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: aiInput,
          systemInstruction: `Extract product details from the description.
If some details are missing, use reasonable defaults.
Generate a unique SKU based on the name if not provided.
Return an ARRAY of objects with these properties:
{
  "name": "string",
  "type": "product" | "service",
  "sku": "string",
  "hsnCode": "string",
  "gstRate": number,
  "category": "string",
  "costPrice": number,
  "price": number,
  "stock": number,
  "primaryUnit": "string",
  "minStock": number,
  "trackInventory": boolean
}`
        })
      });

      if (!response.ok) throw new Error('AI extraction failed');
      const data = await response.json();
      const productsData = JSON.parse(data.text);
      
      // Add all products to the database
      const batch = writeBatch(db);
      for (const productData of productsData) {
        const productRef = doc(collection(db, 'products'));
        batch.set(productRef, {
          ...productData,
          userId: ownerId,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
      }
      await batch.commit();
      
      // Refresh products
      const q = query(collection(db, 'products'), where('userId', '==', ownerId));
      const snapshot = await getDocs(q);
      setProducts(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Product)));
      
      setAiInput('');
    } catch (err) {
      console.error('AI Error:', err);
      alert('Failed to process with AI. Please try again or add manually.');
    } finally {
      setIsAILoading(false);
    }
  };

  const [pendingAIData, setPendingAIData] = useState<any>(null);

  useEffect(() => {
    const fetchData = async () => {
      const q = query(collection(db, 'products'), where('userId', '==', ownerId));
      const snapshot = await getDocs(q);
      setProducts(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Product)));
      
      const profileDoc = await getDoc(doc(db, 'profiles', ownerId));
      if (profileDoc.exists()) {
        setProfile(profileDoc.data());
      }
    };
    fetchData();
  }, [ownerId]);

  const isGlobalInventoryEnabled = profile?.trackInventory !== false;
  const categories = Array.from(new Set(products?.map(p => p.category) || [])).sort();

  const filteredProducts = products?.filter(p => {
    const matchesSearch = String(p.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      String(p.sku || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = filterCategory === 'all' || p.category === filterCategory;
    const matchesLowStock = !filterLowStock || p.stock <= p.minStock;
    return matchesSearch && matchesCategory && matchesLowStock;
  }).sort((a, b) => {
    if (sortBy === 'recent') return (b.updatedAt || 0) - (a.updatedAt || 0);
    if (sortBy === 'oldest') return (a.updatedAt || 0) - (b.updatedAt || 0);
    return a.name.localeCompare(b.name);
  });

  const toggleSelectAll = () => {
    if (selectedIds.length === filteredProducts?.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredProducts?.map(p => p.id!).filter(Boolean) || []);
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const triggerAction = (action: { type: 'add' | 'edit' | 'delete' | 'bulk_update', product?: Product }) => {
    if (action.type === 'add') {
      setEditingProduct(null);
      setIsModalOpen(true);
    } else if (action.type === 'edit' && action.product) {
      setEditingProduct(action.product);
      setIsModalOpen(true);
    } else if (action.type === 'delete' && action.product?.id) {
      deleteProduct(action.product.id);
    } else if (action.type === 'bulk_update') {
      setIsBulkModalOpen(true);
    }
  };

  const handleProductSave = async (productData: Product) => {
    setIsSaving(true);
    try {
      await saveInventoryProduct(productData);
      setIsModalOpen(false);
      setEditingProduct(null);
      
      // Refresh products list
      const q = query(collection(db, 'products'), where('userId', '==', ownerId));
      const snapshot = await withTimeout(getDocs(q), 'LIST products');
      setProducts(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Product)));
    } catch (error) {
       console.error('Error in handleProductSave:', error);
       alert('Failed to save product. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleBulkUpdate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const mode = formData.get('mode') as 'add' | 'subtract' | 'set';
    const amount = parseInt(formData.get('amount') as string);

    if (isNaN(amount)) return;

    const batch = writeBatch(db);
    for (const id of selectedIds) {
      const product = products.find(p => p.id === id);
      if (product && product.type === 'product') {
        let newStock = product.stock;
        if (mode === 'add') newStock += amount;
        else if (mode === 'subtract') newStock -= amount;
        else if (mode === 'set') newStock = amount;

        const productDocRef = doc(db, 'products', id.toString());
        batch.update(productDocRef, { 
          stock: Math.max(0, newStock),
          updatedAt: Date.now()
        });
      }
    }
    await batch.commit();

    setIsBulkModalOpen(false);
    setSelectedIds([]);
    // Refresh products
    const q = query(collection(db, 'products'), where('userId', '==', ownerId));
    const snapshot = await getDocs(q);
    setProducts(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Product)));
  };

  const deleteProduct = async (id: string) => {
    try {
      await deleteInventoryProduct(id);
      // Refresh products
      const q = query(collection(db, 'products'), where('userId', '==', ownerId));
      const snapshot = await getDocs(q);
      setProducts(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Product)));
    } catch (error) {
      console.error('Error deleting product:', error);
      alert('Failed to delete product.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Inventory Management</h1>
          <p className="text-slate-500 text-sm">Track and manage your product stock levels.</p>
        </div>
        <div className="flex gap-3">
          {selectedIds.length > 0 && (
            <button
              onClick={() => triggerAction({ type: 'bulk_update' })}
              className="bg-amber-50 text-amber-700 border border-amber-200 px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-amber-100 transition-colors"
            >
              <Package size={18} />
              Bulk Update ({selectedIds.length})
            </button>
          )}
          <button
            onClick={() => triggerAction({ type: 'add' })}
            className="bg-slate-900 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-slate-800 transition-colors"
          >
            <Plus size={18} />
            Add Product/Service
          </button>
        </div>
      </div>

      {/* ... AI Quick Add Section ... */}

      {/* AI Quick Add Section */}
      {canEdit && (
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-50 rounded-xl text-indigo-600">
              <Sparkles size={20} />
            </div>
            <div>
              <h3 className="font-bold text-slate-900">AI Quick Add</h3>
              <p className="text-xs text-slate-500 text-sm">Describe a product to add it instantly (e.g., "Add 50 Wireless Mice at ₹500 each, selling for ₹800, category Electronics")</p>
            </div>
          </div>
          <div className="flex gap-3">
            <div className="relative flex-1">
              <input
                type="text"
                placeholder="Describe the product..."
                className="w-full pl-4 pr-4 py-3 bg-slate-50 border-slate-200 rounded-xl text-sm focus:ring-slate-900 focus:border-slate-900"
                value={aiInput}
                onChange={(e) => setAiInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAIQuickAdd()}
                disabled={isAILoading}
              />
              {isAILoading && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <Loader2 size={18} className="text-indigo-600 animate-spin" />
                </div>
              )}
            </div>
            <button
              onClick={handleAIQuickAdd}
              disabled={isAILoading || !aiInput.trim()}
              className="px-6 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 flex items-center gap-2 disabled:opacity-50"
            >
              {isAILoading ? 'Processing...' : 'Add with AI'}
            </button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-col md:flex-row gap-4 items-center">
          <div className="relative flex-1 w-full">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search by name or SKU..."
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border-slate-200 rounded-lg text-sm focus:ring-slate-900 focus:border-slate-900"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          
          <div className="flex flex-wrap gap-3 w-full md:w-auto">
            <select 
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="bg-slate-50 border-slate-200 rounded-lg text-sm px-3 py-2 focus:ring-slate-900"
            >
              <option value="recent">Recently Updated</option>
              <option value="oldest">Oldest First</option>
              <option value="name">Name (A-Z)</option>
            </select>

            <select 
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="bg-slate-50 border-slate-200 rounded-lg text-sm px-3 py-2 focus:ring-slate-900"
            >
              <option value="all">All Categories</option>
              {PRODUCT_CATEGORIES.map(cat => (
                <option key={cat.id} value={cat.id}>{cat.label}</option>
              ))}
            </select>

            <button
              onClick={() => setFilterLowStock(!filterLowStock)}
              className={cn(
                "px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2",
                filterLowStock 
                  ? "bg-red-50 text-red-700 border border-red-200" 
                  : "bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-100"
              )}
            >
              <AlertTriangle size={16} />
              Low Stock
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500 font-medium border-y border-slate-100">
              <tr>
                <th className="px-6 py-3 w-10">
                  <input 
                    type="checkbox" 
                    className="rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                    checked={selectedIds.length === filteredProducts?.length && filteredProducts?.length > 0}
                    onChange={toggleSelectAll}
                  />
                </th>
                <th className="px-6 py-3">Product</th>
                <th className="px-6 py-3 hidden lg:table-cell">SKU</th>
                <th className="px-6 py-3">Category</th>
                {isGlobalInventoryEnabled && <th className="px-6 py-3">Stock</th>}
                {showCostPrice && <th className="px-6 py-3 hidden lg:table-cell">Cost</th>}
                <th className="px-6 py-3">Price</th>
                {canEdit && <th className="px-6 py-3 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredProducts?.map((product) => (
                <tr 
                  key={product.id} 
                  className={cn(
                    "hover:bg-slate-50 transition-colors group",
                    product.stock <= product.minStock ? "bg-amber-50/50" : "",
                    selectedIds.includes(product.id!) ? "bg-slate-50" : ""
                  )}
                >
                  <td className="px-6 py-4">
                    <input 
                      type="checkbox" 
                      className="rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                      checked={selectedIds.includes(product.id!)}
                      onChange={() => toggleSelect(product.id!)}
                    />
                  </td>
                  <td className="px-6 py-4">
                    <div className="font-medium text-slate-900">{product.name}</div>
                    <div className="text-xs text-slate-500 lg:hidden">{product.sku}</div>
                  </td>
                  <td className="px-6 py-4 text-slate-500 font-mono hidden lg:table-cell">{product.sku}</td>
                  <td className="px-6 py-4">
                    <span className="bg-slate-100 text-slate-600 px-2 py-1 rounded text-xs">
                      {PRODUCT_CATEGORIES.find(c => c.id === product.category)?.label || product.category}
                    </span>
                  </td>
                  {isGlobalInventoryEnabled && (
                    <td className="px-6 py-4">
                      {product.type === 'service' ? (
                        <span className="text-slate-300">N/A</span>
                      ) : product.trackInventory === false ? (
                        <div className="flex items-center gap-2 text-slate-400 italic text-xs">
                          <Database size={14} />
                          Not Tracked
                        </div>
                      ) : (
                        <div className={cn(
                          "flex items-center gap-2 w-fit px-2 py-1 rounded-md",
                          product.stock <= product.minStock ? "bg-amber-100 text-amber-700" : "text-slate-700"
                        )}>
                          <span className="font-bold">
                            {product.stock} {product.primaryUnit}
                          </span>
                          {product.stock <= product.minStock && (
                            <AlertTriangle size={14} className="text-amber-600 animate-pulse" />
                          )}
                        </div>
                      )}
                    </td>
                  )}
                  {showCostPrice && <td className="px-6 py-4 text-slate-600 hidden lg:table-cell">{formatCurrency(product.costPrice)}</td>}
                  <td className="px-6 py-4 text-slate-900 font-semibold">{formatCurrency(product.price)}</td>
                  {canEdit && (
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2 md:opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => triggerAction({ type: 'edit', product })}
                          className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          onClick={() => {
                            if (confirm('Are you sure you want to delete this product?')) {
                              triggerAction({ type: 'delete', product });
                            }
                          }}
                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
              {filteredProducts?.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-400">
                    <Package size={48} className="mx-auto mb-3 opacity-20" />
                    <p>No products or services found</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen && (
        <ProductForm 
          initialData={editingProduct}
          ownerId={ownerId}
          onSave={handleProductSave}
          onClose={() => setIsModalOpen(false)}
          isSaving={isSaving}
        />
      )}

      {isBulkModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center">
              <h2 className="text-xl font-bold text-slate-900">Bulk Stock Update</h2>
              <button onClick={() => setIsBulkModalOpen(false)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>
            <form onSubmit={handleBulkUpdate} className="p-6 space-y-6">
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Update Mode</label>
                  <select name="mode" className="w-full rounded-xl border-slate-200 focus:ring-2 focus:ring-slate-900">
                    <option value="add">Add to Stock (+)</option>
                    <option value="subtract">Subtract from Stock (-)</option>
                    <option value="set">Set New Total (=)</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Quantity</label>
                  <input name="amount" type="number" required className="w-full rounded-xl border-slate-200 focus:ring-2 focus:ring-slate-900" placeholder="e.g. 10" />
                </div>
                <p className="text-xs text-slate-500 italic">
                  Updating {selectedIds.length} selected products.
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsBulkModalOpen(false)}
                  className="flex-1 px-4 py-2.5 border border-slate-200 text-slate-600 rounded-xl font-bold hover:bg-slate-50 transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2.5 bg-slate-900 text-white rounded-xl font-bold hover:bg-slate-800 transition-all shadow-lg shadow-slate-200"
                >
                  Update Stock
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
