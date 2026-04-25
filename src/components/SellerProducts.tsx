import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Package, Search, Camera, Loader2, X, Download, AlertTriangle, ShieldCheck } from 'lucide-react';
import { type Product } from '../db';
import { saveProductFirestore, deleteProductFirestore, uploadImage } from '../lib/firestore';
import { auth, db } from '../lib/firebase';
import { collection, query, where, getDocs, doc } from 'firebase/firestore';
import { PRODUCT_CATEGORIES } from '../constants/categories';

interface SellerProductsProps {
  products: Product[];
  onProductsChange: () => void;
}

export default function SellerProducts({ products, onProductsChange }: SellerProductsProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Partial<Product> | null>(null);
  const [loading, setLoading] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [showImportModal, setShowImportModal] = useState(false);
  const [inventoryProducts, setInventoryProducts] = useState<Product[]>([]);
  const [importLoading, setImportLoading] = useState(false);

  const fetchInventory = async () => {
    if (!auth.currentUser) return;
    setImportLoading(true);
    try {
      const q = query(collection(db, 'products'), where('userId', '==', auth.currentUser.uid));
      const snapshot = await getDocs(q);
      setInventoryProducts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Product)));
    } catch (error) {
      console.error('Error fetching inventory:', error);
    } finally {
      setImportLoading(false);
    }
  };

  const handleImport = async (product: Product) => {
    if (!auth.currentUser) return;
    setLoading(true);
    setSaveError(null);
    try {
      console.log(`Importing product ${product.name} to B2B...`);
      const b2bProduct: Product = {
        ...product,
        id: crypto.randomUUID(), // New ID for B2B collection
        userId: auth.currentUser.uid,
        isPublic: true,
        moq: 1,
        updatedAt: Date.now()
      };
      await saveProductFirestore(b2bProduct);
      console.log('Product imported successfully');
      setShowImportModal(false);
      onProductsChange();
    } catch (error) {
      console.error('Error importing product:', error);
      let errorMessage = 'Failed to import product';
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
      alert(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const [isUploading, setIsUploading] = useState(false);

  const calculateQualityScore = (product: Partial<Product>) => {
    let score = 0;
    const imageUrls = product.imageUrls || (product.imageUrl ? [product.imageUrl] : []);
    
    if (product.name && product.name.length > 5) score += 20;
    if (product.category) score += 10;
    if (product.description && product.description.length > 50) score += 20;
    if (imageUrls.length > 0) score += 20;
    if (product.moq && product.moq > 1) score += 10;
    if (product.tags && product.tags.length > 2) score += 10;
    if (product.bulkPricing && product.bulkPricing.length > 0) score += 10;
    return score;
  };

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []) as File[];
    if (files.length === 0 || !auth.currentUser) return;

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
        console.log(`Uploading B2B image: ${file.name}`);
        const url = await uploadImage(file, `b2b_products/${auth.currentUser.uid}`);
        uploadedUrls.push(url);
      }

      setEditingProduct(prev => {
        const currentUrls = prev?.imageUrls || (prev?.imageUrl ? [prev.imageUrl] : []);
        const newUrls = [...currentUrls, ...uploadedUrls];
        return {
          ...prev,
          imageUrl: newUrls[0] || '',
          imageUrls: newUrls
        };
      });

      // If we're editing an existing product, update Firestore immediately
      if (editingProduct?.id) {
        const productRef = doc(db, 'b2b_products', editingProduct.id);
        const currentUrls = editingProduct.imageUrls || (editingProduct.imageUrl ? [editingProduct.imageUrl] : []);
        const newUrls = [...currentUrls, ...uploadedUrls];
        
        await saveProductFirestore({
          ...editingProduct as Product,
          imageUrl: newUrls[0],
          imageUrls: newUrls,
          updatedAt: Date.now()
        });
        onProductsChange();
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
        saveProductFirestore({
          ...updatedProduct as Product,
          updatedAt: Date.now()
        }).then(() => onProductsChange());
      }
      
      return updatedProduct;
    });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser) return;
    
    setLoading(true);
    setSaveError(null);
    try {
      console.log('Saving B2B product data...');
      
      const productId = editingProduct?.id || crypto.randomUUID();
      const imageUrls = editingProduct?.imageUrls || (editingProduct?.imageUrl ? [editingProduct.imageUrl] : []);
      
      // Validation
      if (!editingProduct?.name || editingProduct.name.length < 3) {
        throw new Error('Product name is required (min 3 chars)');
      }
      if (!editingProduct?.category) {
        throw new Error('Category is required');
      }
      if (imageUrls.length === 0) {
        throw new Error('At least one product image is required');
      }
      if (!editingProduct?.description || editingProduct.description.length < 20) {
        throw new Error('Description is required (min 20 chars for better quality)');
      }

      // Duplicate check (simple name check for same user)
      const isDuplicate = products.some(p => 
        p.id !== editingProduct?.id && 
        p.name.toLowerCase() === editingProduct?.name?.toLowerCase()
      );
      if (isDuplicate) {
        throw new Error('A product with this name already exists in your catalogue');
      }

      // Collect category attributes
      const categoryId = editingProduct?.category || '';
      const attributes = editingProduct?.attributes || {};

      const qualityScore = calculateQualityScore(editingProduct || {});

      const productToSave: Product = {
        id: productId,
        userId: auth.currentUser.uid,
        name: editingProduct?.name || '',
        type: editingProduct?.type || 'product',
        sku: editingProduct?.sku || `SKU-${Math.floor(Math.random() * 10000)}`,
        description: editingProduct?.description || '',
        price: Number(editingProduct?.price) || 0,
        costPrice: Number(editingProduct?.costPrice) || 0,
        category: categoryId,
        attributes,
        imageUrl: imageUrls[0] || '',
        imageUrls: imageUrls,
        moq: Number(editingProduct?.moq) || 1,
        primaryUnit: editingProduct?.primaryUnit || 'pcs',
        stock: Number(editingProduct?.stock) || 0,
        minStock: Number(editingProduct?.minStock) || 0,
        trackInventory: editingProduct?.trackInventory ?? true,
        isPublic: editingProduct?.isPublic ?? true,
        tags: editingProduct?.tags || [],
        bulkPricing: editingProduct?.bulkPricing || [],
        qualityScore,
        isHighQuality: qualityScore >= 80,
        createdAt: editingProduct?.createdAt || Date.now(),
        updatedAt: Date.now()
      };

      await saveProductFirestore(productToSave);
      
      setIsEditing(false);
      setEditingProduct(null);
      onProductsChange();
      console.log('B2B product save process completed');
    } catch (error) {
      console.error('Error in handleSave:', error);
      let errorMessage = 'Failed to save product';
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
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this product?')) return;
    
    try {
      await deleteProductFirestore(id);
      onProductsChange();
    } catch (error) {
      console.error('Error deleting product:', error);
      alert('Failed to delete product');
    }
  };

  const filteredProducts = products.filter(p => 
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.category.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (isEditing) {
    return (
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-gray-900">
            {editingProduct?.id ? 'Edit Product' : 'Add New Product'}
          </h2>
          <button
            onClick={() => {
              setIsEditing(false);
              setEditingProduct(null);
            }}
            className="text-gray-500 hover:text-gray-700"
          >
            Cancel
          </button>
        </div>

        <form onSubmit={handleSave} className="space-y-6">
          {saveError && (
            <div className="bg-red-50 text-red-600 p-3 rounded-xl text-xs font-medium border border-red-100 flex items-center gap-2">
              <AlertTriangle size={14} />
              {saveError}
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-gray-700">Product Name *</label>
              <input
                type="text"
                required
                value={editingProduct?.name || ''}
                onChange={e => setEditingProduct(prev => ({ ...prev, name: e.target.value }))}
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                placeholder="e.g. Premium Widget"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-gray-700">Category *</label>
              <select
                required
                value={editingProduct?.category || ''}
                onChange={e => {
                  const newCategory = e.target.value;
                  setEditingProduct(prev => ({ 
                    ...prev, 
                    category: newCategory,
                    attributes: {} // Reset attributes when category changes
                  }));
                }}
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
              >
                <option value="">Select Category</option>
                {PRODUCT_CATEGORIES.map(cat => (
                  <option key={cat.id} value={cat.id}>{cat.label}</option>
                ))}
              </select>
            </div>

            {/* Dynamic Category Fields */}
            {editingProduct?.category && (
              <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6 bg-gray-50 p-4 rounded-xl border border-gray-100">
                <div className="md:col-span-2">
                  <h3 className="text-sm font-bold text-gray-900 mb-2">Category Specific Details</h3>
                </div>
                {PRODUCT_CATEGORIES.find(c => c.id === editingProduct.category)?.fields.map(field => (
                  <div key={field.name} className="space-y-2">
                    <label className="text-sm font-semibold text-gray-700">
                      {field.label} {field.required && '*'}
                    </label>
                    {field.type === 'select' ? (
                      <select
                        required={field.required}
                        value={editingProduct.attributes?.[field.name] || ''}
                        onChange={e => setEditingProduct(prev => ({
                          ...prev,
                          attributes: { ...prev?.attributes, [field.name]: e.target.value }
                        }))}
                        className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                      >
                        <option value="">Select {field.label}</option>
                        {field.options?.map(opt => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type={field.type}
                        required={field.required}
                        value={editingProduct.attributes?.[field.name] || ''}
                        onChange={e => setEditingProduct(prev => ({
                          ...prev,
                          attributes: { ...prev?.attributes, [field.name]: e.target.value }
                        }))}
                        className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                        placeholder={`Enter ${field.label.toLowerCase()}`}
                      />
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-2">
              <label className="text-sm font-semibold text-gray-700">Price (₹) *</label>
              <input
                type="number"
                required
                min="0"
                step="0.01"
                value={editingProduct?.price || ''}
                onChange={e => setEditingProduct(prev => ({ ...prev, price: parseFloat(e.target.value) }))}
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-gray-700">Unit *</label>
              <input
                type="text"
                required
                value={editingProduct?.primaryUnit || 'pcs'}
                onChange={e => setEditingProduct(prev => ({ ...prev, primaryUnit: e.target.value }))}
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                placeholder="e.g. pcs, kg, box"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-gray-700">Min Order Quantity *</label>
              <input
                type="number"
                required
                min="1"
                value={editingProduct?.moq || 1}
                onChange={e => setEditingProduct(prev => ({ ...prev, moq: parseInt(e.target.value) }))}
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-gray-700">Tags / Keywords (comma separated)</label>
              <input
                type="text"
                value={editingProduct?.tags?.join(', ') || ''}
                onChange={e => setEditingProduct(prev => ({ 
                  ...prev, 
                  tags: e.target.value.split(',').map(t => t.trim()).filter(t => t !== '') 
                }))}
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                placeholder="e.g. organic, cotton, premium"
              />
            </div>

            <div className="md:col-span-2 space-y-4">
              <div className="flex justify-between items-center">
                <label className="text-sm font-semibold text-gray-700">Bulk Pricing (Optional)</label>
                <button
                  type="button"
                  onClick={() => setEditingProduct(prev => ({
                    ...prev,
                    bulkPricing: [...(prev?.bulkPricing || []), { minQuantity: 10, pricePerUnit: (prev?.price || 0) * 0.9 }]
                  }))}
                  className="text-xs font-bold text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
                >
                  <Plus size={14} /> Add Tier
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {(editingProduct?.bulkPricing || []).map((tier, idx) => (
                  <div key={idx} className="flex items-center gap-2 bg-gray-50 p-3 rounded-xl border border-gray-100">
                    <div className="flex-1 space-y-1">
                      <label className="text-[10px] uppercase font-bold text-gray-400">Min Qty</label>
                      <input
                        type="number"
                        value={tier.minQuantity}
                        onChange={e => {
                          const newPricing = [...(editingProduct?.bulkPricing || [])];
                          newPricing[idx] = { ...tier, minQuantity: parseInt(e.target.value) };
                          setEditingProduct(prev => ({ ...prev, bulkPricing: newPricing }));
                        }}
                        className="w-full bg-transparent border-none p-0 text-sm focus:ring-0"
                      />
                    </div>
                    <div className="flex-1 space-y-1">
                      <label className="text-[10px] uppercase font-bold text-gray-400">Price (₹)</label>
                      <input
                        type="number"
                        value={tier.pricePerUnit}
                        onChange={e => {
                          const newPricing = [...(editingProduct?.bulkPricing || [])];
                          newPricing[idx] = { ...tier, pricePerUnit: parseFloat(e.target.value) };
                          setEditingProduct(prev => ({ ...prev, bulkPricing: newPricing }));
                        }}
                        className="w-full bg-transparent border-none p-0 text-sm focus:ring-0"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const newPricing = (editingProduct?.bulkPricing || []).filter((_, i) => i !== idx);
                        setEditingProduct(prev => ({ ...prev, bulkPricing: newPricing }));
                      }}
                      className="p-1 text-red-500 hover:bg-red-50 rounded"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-semibold text-gray-700">Product Images</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-4">
                {/* Existing and New Previews */}
                {(editingProduct?.imageUrls || (editingProduct?.imageUrl ? [editingProduct.imageUrl] : [])).map((url, idx) => {
                  return (
                    <div key={idx} className="relative aspect-square border-2 border-gray-200 rounded-xl overflow-hidden bg-gray-50 group">
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
                <label className="aspect-square border-2 border-dashed border-gray-200 rounded-xl flex flex-col items-center justify-center bg-gray-50 hover:bg-gray-100 cursor-pointer transition-colors group relative">
                  {isUploading ? (
                    <Loader2 className="w-6 h-6 text-indigo-600 animate-spin" />
                  ) : (
                    <>
                      <Camera className="w-6 h-6 text-gray-300 group-hover:text-gray-400" />
                      <span className="text-[10px] font-medium text-gray-400 mt-1">Upload Image</span>
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
              <p className="text-xs text-gray-500">Upload one or more product photos. Recommended size: 800x600px.</p>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold text-gray-700">Description</label>
            <textarea
              rows={3}
              value={editingProduct?.description || ''}
              onChange={e => setEditingProduct(prev => ({ ...prev, description: e.target.value }))}
              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
              placeholder="Product description..."
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="isPublic"
              checked={editingProduct?.isPublic ?? true}
              onChange={e => setEditingProduct(prev => ({ ...prev, isPublic: e.target.checked }))}
              className="w-4 h-4 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500"
            />
            <label htmlFor="isPublic" className="text-sm font-medium text-gray-700">
              Visible in Catalogue
            </label>
          </div>

          <div className="flex justify-end pt-4">
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {loading ? 'Saving...' : 'Save Product'}
            </button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search products..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
          />
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <button
            onClick={() => {
              setShowImportModal(true);
              fetchInventory();
            }}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 whitespace-nowrap"
          >
            <Download className="w-4 h-4" />
            Import from Inventory
          </button>
          <button
            onClick={() => {
              setEditingProduct(null);
              setImageFiles([]);
              setImagePreviews([]);
              setIsEditing(true);
            }}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            Add Product
          </button>
        </div>
      </div>

      {/* Import Modal */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center">
              <h2 className="text-xl font-bold text-gray-900">Import from Inventory</h2>
              <button onClick={() => setShowImportModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="p-6 max-h-[60vh] overflow-y-auto">
              {importLoading ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
                </div>
              ) : inventoryProducts.length === 0 ? (
                <div className="text-center py-12">
                  <Package className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-500">No inventory products found to import.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {inventoryProducts.map(product => (
                    <div key={product.id} className="flex items-center gap-4 p-4 border rounded-xl hover:bg-gray-50 transition-colors">
                      <div className="h-16 w-16 bg-gray-100 rounded-lg flex items-center justify-center overflow-hidden flex-shrink-0">
                        {product.imageUrl ? (
                          <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover" />
                        ) : (
                          <Package className="w-8 h-8 text-gray-300" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-semibold text-gray-900 truncate">{product.name}</h4>
                        <p className="text-sm text-gray-500">₹{product.price.toFixed(2)}</p>
                      </div>
                      <button
                        onClick={() => handleImport(product)}
                        className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                        title="Import"
                      >
                        <Plus className="w-5 h-5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {filteredProducts.length === 0 ? (
        <div className="bg-white p-12 rounded-xl shadow-sm border border-gray-100 text-center">
          <Package className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No products found</h3>
          <p className="text-gray-500 mb-6">
            {searchQuery ? 'Try adjusting your search query' : 'Start building your catalogue by adding your first product'}
          </p>
          {!searchQuery && (
            <button
              onClick={() => {
                setEditingProduct(null);
                setIsEditing(true);
              }}
              className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
            >
              <Plus className="w-4 h-4" />
              Add Product
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredProducts.map(product => (
            <div key={product.id} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-shadow relative">
              {product.isHighQuality && (
                <div className="absolute top-2 left-2 bg-indigo-600 text-white px-2 py-1 rounded-full text-[10px] font-bold flex items-center gap-1 shadow-lg z-10">
                  <ShieldCheck className="w-3 h-3" /> HIGH QUALITY
                </div>
              )}
              {product.imageUrl ? (
                <div className="aspect-video w-full overflow-hidden bg-gray-100">
                  <img 
                    src={product.imageUrl} 
                    alt={product.name}
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                </div>
              ) : (
                <div className="aspect-video w-full bg-gray-50 flex items-center justify-center border-b border-gray-100">
                  <Package className="w-12 h-12 text-gray-300" />
                </div>
              )}
              
              <div className="p-4">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <h3 className="font-semibold text-gray-900 line-clamp-1">{product.name}</h3>
                    <p className="text-xs font-medium text-indigo-600">
                      {PRODUCT_CATEGORIES.find(c => c.id === product.category)?.label || product.category}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => {
                        setEditingProduct(product);
                        setImageFiles([]);
                        setImagePreviews([]);
                        setIsEditing(true);
                      }}
                      className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(product.id!)}
                      className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {product.attributes && Object.keys(product.attributes).length > 0 && (
                  <div className="mt-3 grid grid-cols-2 gap-x-2 gap-y-1">
                    {Object.entries(product.attributes).slice(0, 4).map(([key, value]) => (
                      <div key={key} className="flex flex-col">
                        <span className="text-[10px] text-gray-400 uppercase font-bold tracking-wider">
                          {PRODUCT_CATEGORIES.find(c => c.id === product.category)?.fields.find(f => f.name === key)?.label || key}
                        </span>
                        <span className="text-xs text-gray-700 font-medium truncate">{String(value)}</span>
                      </div>
                    ))}
                  </div>
                )}

                <div className="mt-4 flex items-end justify-between">
                  <div>
                    <p className="text-lg font-bold text-gray-900">₹{product.price.toFixed(2)}</p>
                    <p className="text-xs text-gray-500">per {product.primaryUnit}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      Stock: {product.trackInventory === false ? 'Not Tracked' : (product.stock || 0)}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                      product.isPublic ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'
                    }`}>
                      {product.isPublic ? 'Visible' : 'Hidden'}
                    </span>
                    <p className="text-xs text-gray-500 mt-1">MOQ: {product.moq}</p>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
