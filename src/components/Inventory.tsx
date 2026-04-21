import React, { useState, useEffect } from 'react';
import { User as FirebaseUser } from 'firebase/auth';
import { type Product, UserRole } from '../db';
import { Plus, Search, Edit2, Trash2, AlertTriangle, Package, Database, Sparkles, Loader2, Camera, X } from 'lucide-react';
import { formatCurrency, cn } from '../lib/utils';
import { PasswordPrompt } from './PasswordPrompt';
import { db } from '../lib/firebase';
import { collection, query, where, getDocs, doc, writeBatch, getDoc } from 'firebase/firestore';
import { GoogleGenAI, Type } from "@google/genai";
import { uploadImage, saveInventoryProduct, deleteInventoryProduct, withTimeout } from '../lib/firestore';
import { PRODUCT_CATEGORIES } from '../constants/categories';

export function Inventory({ user, ownerId, role }: { user: FirebaseUser; ownerId: string; role: UserRole | null }) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [showPasswordPrompt, setShowPasswordPrompt] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [pendingAction, setPendingAction] = useState<{ type: 'add' | 'edit' | 'delete' | 'bulk_update', product?: Product }>({ type: 'add' });
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
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);

  const [isUploading, setIsUploading] = useState(false);

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const MAX_SIZE = 5 * 1024 * 1024; // 5MB
    const validFiles = files.filter(file => {
      if (file.size > MAX_SIZE) {
        setSaveError(`Image ${file.name} is too large. Max size is 5MB.`);
        return false;
      }
      return true;
    });

    if (validFiles.length === 0) return;

    setIsUploading(true);
    setSaveError(null);

    try {
      const uploadedUrls: string[] = [];
      for (const file of validFiles) {
        console.log(`Uploading inventory image: ${file.name}`);
        const url = await uploadImage(file, `inventory/${ownerId}`);
        uploadedUrls.push(url);
      }

      setEditingProduct(prev => {
        if (!prev) return null;
        const currentUrls = prev.imageUrls || (prev.imageUrl ? [prev.imageUrl] : []);
        const newUrls = [...currentUrls, ...uploadedUrls];
        return {
          ...prev,
          imageUrl: newUrls[0] || '',
          imageUrls: newUrls
        };
      });

      // If we're editing an existing product, update Firestore immediately
      if (editingProduct?.id) {
        const currentUrls = editingProduct.imageUrls || (editingProduct.imageUrl ? [editingProduct.imageUrl] : []);
        const newUrls = [...currentUrls, ...uploadedUrls];
        
        await saveInventoryProduct({
          ...editingProduct,
          imageUrl: newUrls[0],
          imageUrls: newUrls,
          updatedAt: Date.now()
        });
        
        // Refresh products list
        const q = query(collection(db, 'products'), where('userId', '==', ownerId));
        const snapshot = await getDocs(q);
        setProducts(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Product)));
      }
    } catch (error) {
      console.error('Error uploading images:', error);
      setSaveError('Failed to upload images. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  const removeImage = async (index: number) => {
    setEditingProduct(prev => {
      if (!prev) return null;
      const newUrls = (prev.imageUrls || []).filter((_, i) => i !== index);
      const updatedProduct = { ...prev, imageUrls: newUrls, imageUrl: newUrls[0] || '' };
      
      // If editing existing, sync to Firestore
      if (prev.id) {
        saveInventoryProduct({
          ...updatedProduct,
          updatedAt: Date.now()
        }).then(async () => {
          const q = query(collection(db, 'products'), where('userId', '==', ownerId));
          const snapshot = await getDocs(q);
          setProducts(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Product)));
        });
      }
      
      return updatedProduct;
    });
  };

  const handleAIQuickAdd = async () => {
    if (!aiInput.trim()) return;
    setIsAILoading(true);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Extract product details from this description: "${aiInput}". 
        If some details are missing, use reasonable defaults. 
        Generate a unique SKU based on the name if not provided.
        Current date: ${new Date().toISOString()}`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING, description: "Product or service name" },
                type: { type: Type.STRING, enum: ["product", "service"], description: "Whether this is a physical product or a service" },
                sku: { type: Type.STRING, description: "Unique SKU or Service Code" },
                hsnCode: { type: Type.STRING, description: "HSN Code for products or SAC Code for services" },
                gstRate: { type: Type.NUMBER, description: "GST Rate (e.g., 5, 12, 18, 28)" },
                category: { type: Type.STRING, description: "Product category" },
                costPrice: { type: Type.NUMBER, description: "Cost price" },
                price: { type: Type.NUMBER, description: "Selling price" },
                stock: { type: Type.NUMBER, description: "Initial stock quantity" },
                primaryUnit: { type: Type.STRING, description: "Primary unit (e.g., Pcs, Box)" },
                minStock: { type: Type.NUMBER, description: "Low stock alert level" },
                trackInventory: { type: Type.BOOLEAN, description: "Whether to track inventory" }
              },
              required: ["name", "sku", "category", "costPrice", "price", "stock", "primaryUnit", "minStock", "trackInventory"]
            }
          }
        }
      });

      const productsData = JSON.parse(response.text);
      
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
      const q = query(collection(db, 'products'), where('userId', '==', user.uid));
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
      const q = query(collection(db, 'products'), where('userId', '==', user.uid));
      const snapshot = await getDocs(q);
      setProducts(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Product)));
      
      const profileDoc = await getDoc(doc(db, 'profiles', ownerId));
      if (profileDoc.exists()) {
        setProfile(profileDoc.data());
      }
    };
    fetchData();
  }, [ownerId]);

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

  const [skuValue, setSkuValue] = useState('');

  const generateSKU = (name: string) => {
    return name
      .trim()
      .split(/\s+/)
      .map(word => word.slice(0, 3).toUpperCase())
      .join('-')
      .replace(/[^A-Z0-9-]/g, '');
  };

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!editingProduct) {
      setSkuValue(generateSKU(e.target.value));
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSaving(true);
    setSaveError(null);
    const formData = new FormData(e.currentTarget);
    const costPrice = parseFloat(formData.get('costPrice') as string);
    const price = parseFloat(formData.get('price') as string);
    const stock = parseInt(formData.get('stock') as string);
    const minStock = parseInt(formData.get('minStock') as string);
    const conversionRateStr = formData.get('conversionRate') as string;
    const conversionRate = conversionRateStr ? parseInt(conversionRateStr) : undefined;

    if (isNaN(costPrice) || isNaN(price) || isNaN(stock) || isNaN(minStock)) {
      setSaveError('Please enter valid numbers for prices and stock.');
      setIsSaving(false);
      return;
    }
    
    if (conversionRateStr && isNaN(conversionRate!)) {
      setSaveError('Please enter a valid number for conversion rate.');
      setIsSaving(false);
      return;
    }

    try {
      console.log('Saving inventory product data...');
      
      const productId = editingProduct?.id || crypto.randomUUID();
      const imageUrls = editingProduct?.imageUrls || (editingProduct?.imageUrl ? [editingProduct.imageUrl] : []);
      
      // Collect category attributes
      const categoryId = formData.get('category') as string;
      const categoryDef = PRODUCT_CATEGORIES.find(c => c.id === categoryId);
      const attributes: Record<string, any> = {};
      if (categoryDef) {
        categoryDef.fields.forEach(field => {
          const value = formData.get(`attr_${field.name}`);
          if (value !== null) {
            attributes[field.name] = field.type === 'number' ? Number(value) : value;
          }
        });
      }

      const productData: Product = {
        id: productId,
        userId: ownerId,
        name: formData.get('name') as string,
        type: formData.get('type') as 'product' | 'service',
        sku: formData.get('sku') as string,
        hsnCode: formData.get('hsnCode') as string,
        gstRate: parseFloat(formData.get('gstRate') as string) || 0,
        costPrice,
        price,
        stock,
        primaryUnit: formData.get('primaryUnit') as string,
        secondaryUnit: formData.get('secondaryUnit') as string || undefined,
        conversionRate,
        minStock,
        trackInventory: formData.get('trackInventory') === 'on',
        category: categoryId,
        attributes,
        imageUrl: imageUrls[0] || '',
        imageUrls: imageUrls,
        createdAt: editingProduct?.createdAt || Date.now(),
        updatedAt: Date.now(),
      };

      await saveInventoryProduct(productData);
      
      // Close modal
      setIsModalOpen(false);
      setEditingProduct(null);
      setImageFiles([]);
      setImagePreviews([]);
      setIsSaving(false);

      // Refresh products list
      const q = query(collection(db, 'products'), where('userId', '==', ownerId));
      const snapshot = await withTimeout(getDocs(q), 'LIST products');
      setProducts(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Product)));
      console.log('Product save process completed');
    } catch (error) {
      console.error('Error in handleSubmit:', error);
      let errorMessage = 'Failed to save product. Please try again.';
      if (error instanceof Error) {
        try {
          const parsed = JSON.parse(error.message);
          if (parsed.error) {
            errorMessage = `Firestore Error: ${parsed.error} (${parsed.operationType})`;
          } else {
            errorMessage = error.message;
          }
        } catch (e) {
          errorMessage = error.message;
        }
      }
      setSaveError(errorMessage);
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
      if (product) {
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

  const handleActionSuccess = () => {
    if (pendingAction.type === 'add') {
      setEditingProduct(null);
      setSkuValue('');
      setImageFiles([]);
      setImagePreviews([]);
      setIsModalOpen(true);
    } else if (pendingAction.type === 'edit' && pendingAction.product) {
      setEditingProduct(pendingAction.product);
      setSkuValue(pendingAction.product.sku);
      setImageFiles([]);
      setImagePreviews([]);
      setIsModalOpen(true);
    } else if (pendingAction.type === 'delete' && pendingAction.product?.id) {
      deleteProduct(pendingAction.product.id);
    } else if (pendingAction.type === 'bulk_update') {
      setIsBulkModalOpen(true);
    }
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

  const isGlobalInventoryEnabled = profile?.trackInventory !== false;

  return (
    <div className="space-y-6">
      <PasswordPrompt
        isOpen={showPasswordPrompt}
        onClose={() => setShowPasswordPrompt(false)}
        onSuccess={handleActionSuccess}
        title="Inventory Security"
        description={`Please enter your password to ${pendingAction.type} product.`}
        userId={ownerId}
      />
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Inventory Management</h1>
          <p className="text-slate-500 text-sm">Track and manage your product stock levels.</p>
        </div>
        <div className="flex gap-3">
          {selectedIds.length > 0 && (
            <button
              onClick={() => {
                setPendingAction({ type: 'bulk_update' });
                setShowPasswordPrompt(true);
              }}
              className="bg-amber-50 text-amber-700 border border-amber-200 px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-amber-100 transition-colors"
            >
              <Package size={18} />
              Bulk Update ({selectedIds.length})
            </button>
          )}
          <button
            onClick={() => {
              setPendingAction({ type: 'add' });
              setShowPasswordPrompt(true);
            }}
            className="bg-slate-900 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-slate-800 transition-colors"
          >
            <Plus size={18} />
            Add Product/Service
          </button>
        </div>
      </div>

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
                      {product.trackInventory === false ? (
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
                          onClick={() => {
                            setPendingAction({ type: 'edit', product });
                            setShowPasswordPrompt(true);
                          }}
                          className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          onClick={() => {
                            if (confirm('Are you sure you want to delete this product?')) {
                              setPendingAction({ type: 'delete', product });
                              setShowPasswordPrompt(true);
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
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center">
              <h2 className="text-xl font-bold text-slate-900">
                {editingProduct ? 'Edit Product' : 'Add New Product'}
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                ✕
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              {saveError && (
                <div className="bg-red-50 text-red-600 p-3 rounded-xl text-xs font-medium border border-red-100 flex items-center gap-2">
                  <AlertTriangle size={14} />
                  {saveError}
                </div>
              )}
              
              <div className="flex bg-slate-100 p-1 rounded-xl mb-4">
                <button
                  type="button"
                  onClick={() => setEditingProduct(prev => ({ ...prev!, type: 'product' }))}
                  className={cn(
                    "flex-1 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all",
                    (editingProduct?.type || 'product') === 'product' ? "bg-white shadow-sm text-slate-900" : "text-slate-500"
                  )}
                >
                  Product
                </button>
                <button
                  type="button"
                  onClick={() => setEditingProduct(prev => ({ ...prev!, type: 'service' }))}
                  className={cn(
                    "flex-1 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all",
                    editingProduct?.type === 'service' ? "bg-white shadow-sm text-slate-900" : "text-slate-500"
                  )}
                >
                  Service
                </button>
                <input type="hidden" name="type" value={editingProduct?.type || 'product'} />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2 space-y-1.5">
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Product Name</label>
                  <input 
                    name="name" 
                    required 
                    defaultValue={editingProduct?.name} 
                    onChange={handleNameChange}
                    className="w-full" 
                    placeholder="e.g. Wireless Mouse" 
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">SKU / Service Code</label>
                  <input 
                    name="sku" 
                    required 
                    value={skuValue}
                    onChange={(e) => setSkuValue(e.target.value)}
                    className="w-full font-mono" 
                    placeholder={editingProduct?.type === 'service' ? "SERV-001" : "PROD-001"} 
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    {editingProduct?.type === 'service' ? 'SAC Code' : 'HSN Code'}
                  </label>
                  <input name="hsnCode" defaultValue={editingProduct?.hsnCode} className="w-full" placeholder={editingProduct?.type === 'service' ? "e.g. 9983" : "e.g. 8471"} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">GST Rate (%)</label>
                  <select name="gstRate" defaultValue={editingProduct?.gstRate || 0} className="w-full">
                    <option value="0">0% (Exempt)</option>
                    <option value="5">5%</option>
                    <option value="12">12%</option>
                    <option value="18">18%</option>
                    <option value="28">28%</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Category</label>
                  <select 
                    name="category" 
                    required 
                    defaultValue={editingProduct?.category} 
                    className="w-full"
                    onChange={(e) => {
                      // Force re-render to show dynamic fields
                      setEditingProduct(prev => ({ ...prev!, category: e.target.value, attributes: {} }));
                    }}
                  >
                    <option value="">Select Category</option>
                    {PRODUCT_CATEGORIES.map(cat => (
                      <option key={cat.id} value={cat.id}>{cat.label}</option>
                    ))}
                  </select>
                </div>

                {/* Dynamic Category Fields */}
                {editingProduct?.category && (
                  <div className="col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
                    <div className="col-span-2">
                      <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Category Details</h4>
                    </div>
                    {PRODUCT_CATEGORIES.find(c => c.id === editingProduct.category)?.fields.map(field => (
                      <div key={field.name} className="space-y-1.5">
                        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                          {field.label} {field.required && '*'}
                        </label>
                        {field.type === 'select' ? (
                          <select
                            name={`attr_${field.name}`}
                            required={field.required}
                            defaultValue={editingProduct.attributes?.[field.name] || ''}
                            className="w-full"
                          >
                            <option value="">Select {field.label}</option>
                            {field.options?.map(opt => (
                              <option key={opt} value={opt}>{opt}</option>
                            ))}
                          </select>
                        ) : (
                          <input
                            name={`attr_${field.name}`}
                            type={field.type}
                            required={field.required}
                            defaultValue={editingProduct.attributes?.[field.name] || ''}
                            className="w-full"
                            placeholder={`Enter ${field.label.toLowerCase()}`}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                )}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Cost Price (₹)</label>
                  <input name="costPrice" type="number" step="0.01" required defaultValue={editingProduct?.costPrice} className="w-full" placeholder="2000.00" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Selling Price (₹)</label>
                  <input name="price" type="number" step="0.01" required defaultValue={editingProduct?.price} className="w-full" placeholder="2999.00" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Unit</label>
                  <input name="primaryUnit" required defaultValue={editingProduct?.primaryUnit || (editingProduct?.type === 'service' ? 'Hour' : '')} className="w-full" placeholder={editingProduct?.type === 'service' ? "e.g. Hour, Visit" : "e.g. Box"} />
                </div>
                {editingProduct?.type !== 'service' && (
                  <>
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Secondary Unit (Opt)</label>
                      <input name="secondaryUnit" defaultValue={editingProduct?.secondaryUnit} className="w-full" placeholder="e.g. Piece" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Conversion Rate</label>
                      <input name="conversionRate" type="number" defaultValue={editingProduct?.conversionRate} className="w-full" placeholder="e.g. 12" />
                    </div>
                  </>
                )}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    {editingProduct?.type === 'service' ? 'Availability / Limit' : 'Initial Stock'}
                  </label>
                  <input name="stock" type="number" required defaultValue={editingProduct?.stock || (editingProduct?.type === 'service' ? 999999 : '')} className="w-full" placeholder="100" />
                </div>
                <div className="space-y-1.5 col-span-2">
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Low Stock Alert Level</label>
                  <input name="minStock" type="number" required defaultValue={editingProduct?.minStock || 10} className="w-full" placeholder="10" />
                </div>
                <div className="space-y-1.5 col-span-2">
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Product Images</label>
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
                    {/* Existing and New Previews */}
                    {(editingProduct?.imageUrls || (editingProduct?.imageUrl ? [editingProduct.imageUrl] : [])).map((url, idx) => {
                      return (
                        <div key={idx} className="relative aspect-square border-2 border-slate-200 rounded-lg overflow-hidden bg-white group">
                          <img 
                            src={url} 
                            alt={`Preview ${idx + 1}`} 
                            className="w-full h-full object-cover"
                          />
                          <button
                            type="button"
                            onClick={() => removeImage(idx)}
                            className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      );
                    })}
                    
                    {/* Add Button */}
                    <label className="aspect-square border-2 border-dashed border-slate-200 rounded-lg flex flex-col items-center justify-center bg-white hover:bg-slate-50 cursor-pointer transition-colors group relative">
                      {isUploading ? (
                        <Loader2 className="w-5 h-5 text-indigo-600 animate-spin" />
                      ) : (
                        <>
                          <Camera className="w-5 h-5 text-slate-300 group-hover:text-slate-400" />
                          <span className="text-[8px] font-medium text-slate-400 mt-1">Upload Image</span>
                        </>
                      )}
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={handleImageChange}
                        disabled={isUploading}
                        className="hidden"
                      />
                    </label>
                  </div>
                  <p className="text-[10px] text-slate-500 leading-tight">Upload one or more product photos. They will be stored securely.</p>
                </div>
                <div className="space-y-1.5 col-span-2">
                  <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-200">
                    <div className="flex items-center gap-2">
                      <div className={`p-1.5 rounded-lg ${editingProduct?.trackInventory !== false ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-200 text-slate-500'}`}>
                        <Database size={16} />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-slate-900">Track Inventory</h4>
                        <p className="text-[10px] text-slate-500">Enable stock tracking for this product.</p>
                      </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input 
                        type="checkbox" 
                        name="trackInventory"
                        defaultChecked={editingProduct?.type === 'service' ? (editingProduct.trackInventory === true) : (editingProduct?.trackInventory !== false)}
                        className="sr-only peer" 
                      />
                      <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-slate-900"></div>
                    </label>
                  </div>
                </div>
              </div>
              <div className="pt-4 flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 px-4 py-2 border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="flex-1 px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isSaving && <Loader2 size={16} className="animate-spin" />}
                  {editingProduct ? 'Update' : 'Save'} {editingProduct?.type === 'service' ? 'Service' : 'Product'}
                </button>
              </div>
            </form>
          </div>
        </div>
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
