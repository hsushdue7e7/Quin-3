import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  X, Save, Package, Hash, Tag, Layers, ChevronDown, 
  AlertCircle, TrendingUp, Info,
  Plus, Trash2, Loader2, Barcode, Shield,
  Clock, Calendar, Users, AppWindow, Scan, Sparkles,
  Zap, ArrowRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn, formatCurrency } from '../lib/utils';
import { type Product } from '../db';
import { PRODUCT_CATEGORIES } from '../constants/categories';

interface ProductFormProps {
  initialData?: Product | null;
  ownerId: string;
  onSave: (product: Product) => Promise<void>;
  onClose: () => void;
  isSaving: boolean;
}

export function ProductForm({ initialData, ownerId, onSave, onClose, isSaving }: ProductFormProps) {
  const [formData, setFormData] = useState<Partial<Product>>(initialData || {
    type: 'product',
    trackInventory: true,
    gstRate: 0,
    stock: 0,
    minStock: 5,
    costPrice: 0,
    price: 0,
    imageUrls: [],
    attributes: {}
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);

  // Profit calculations
  const profit = useMemo(() => {
    const sell = Number(formData.price) || 0;
    const cost = Number(formData.costPrice) || 0;
    return sell - cost;
  }, [formData.price, formData.costPrice]);

  const margin = useMemo(() => {
    const sell = Number(formData.price) || 0;
    return sell > 0 ? (profit / sell) * 100 : 0;
  }, [profit, formData.price]);

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!formData.name?.trim()) newErrors.name = 'Product name is required';
    if (!formData.sku?.trim()) newErrors.sku = 'SKU is required';
    if (formData.type === 'product' && !formData.category) newErrors.category = 'Category is required';
    if (!formData.price || formData.price <= 0) newErrors.price = 'Selling price must be greater than zero';
    if (formData.costPrice && formData.costPrice < 0) newErrors.costPrice = 'Cost price cannot be negative';
    
    if (formData.type === 'product' && formData.trackInventory) {
      if (formData.stock !== undefined && formData.stock < 0) newErrors.stock = 'Stock cannot be negative';
      if (formData.minStock !== undefined && formData.minStock < 0) newErrors.minStock = 'Low stock alert cannot be negative';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleChange = (field: keyof Product, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  const handleAttributeChange = (name: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      attributes: {
        ...(prev.attributes || {}),
        [name]: value
      }
    }));
  };

  const generateSKU = () => {
    if (!formData.name) return;
    const sku = formData.name
      .trim()
      .split(/\s+/)
      .map(word => word.slice(0, 3).toUpperCase())
      .join('-')
      .replace(/[^A-Z0-9-]/g, '') + '-' + Math.floor(1000 + Math.random() * 9000);
    handleChange('sku', sku);
  };

  const handleSave = async () => {
    if (!validate()) {
      const firstError = Object.keys(errors)[0];
      const element = document.getElementsByName(firstError)[0];
      element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    const finalData: Product = {
      id: formData.id || crypto.randomUUID(),
      userId: ownerId,
      name: formData.name!,
      type: formData.type as 'product' | 'service',
      sku: formData.sku!,
      hsnCode: formData.hsnCode || '',
      gstRate: formData.gstRate || 0,
      costPrice: formData.costPrice || 0,
      price: formData.price!,
      stock: formData.type === 'product' ? (formData.stock || 0) : 0,
      primaryUnit: formData.primaryUnit || (formData.type === 'service' ? 'Hour' : 'Pcs'),
      secondaryUnit: formData.type === 'product' ? formData.secondaryUnit : undefined,
      conversionRate: formData.type === 'product' ? formData.conversionRate : undefined,
      category: formData.category || 'other',
      minStock: formData.type === 'product' ? (formData.minStock || 0) : 0,
      trackInventory: formData.type === 'product' ? !!formData.trackInventory : false,
      attributes: formData.attributes || {},
      imageUrl: formData.imageUrl || '',
      imageUrls: formData.imageUrls || [],
      createdAt: formData.createdAt || Date.now(),
      updatedAt: Date.now(),
      description: formData.description || ''
    };

    await onSave(finalData);
  };

  const categoryDef = PRODUCT_CATEGORIES.find(c => c.id === formData.category);

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-end sm:items-center justify-center"
    >
      <motion.div 
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        className="w-full h-[92vh] sm:h-auto sm:max-h-[90vh] sm:max-w-3xl bg-slate-50 sm:rounded-[2rem] shadow-2xl flex flex-col overflow-hidden"
      >
        {/* Sticky Header */}
        <div className="bg-white px-6 py-4 border-b border-slate-200 flex items-center justify-between sticky top-0 z-20 shadow-sm">
          <div className="flex items-center gap-4">
            <button 
              onClick={onClose}
              className="p-2 hover:bg-slate-100 rounded-xl text-slate-500 transition-colors"
            >
              <X size={20} />
            </button>
            <div>
              <h2 className="text-xl font-black text-slate-900">
                {initialData ? 'Edit Item' : 'New Item'}
              </h2>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                {formData.type === 'service' ? <Zap size={10} className="text-indigo-500" /> : <Package size={10} className="text-blue-500" />}
                {formData.type} Management
              </p>
            </div>
          </div>
          
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="hidden sm:flex px-6 py-2.5 bg-slate-900 text-white rounded-xl font-bold text-sm items-center gap-2 hover:bg-slate-800 transition-all active:scale-95 disabled:opacity-50"
          >
            {isSaving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
            {initialData ? 'Update Item' : 'Save Item'}
          </button>
          
          <div className="sm:hidden flex items-center gap-2">
             <button
                onClick={handleSave}
                disabled={isSaving}
                className="p-2.5 bg-slate-900 text-white rounded-xl font-bold transition-all disabled:opacity-50"
              >
                {isSaving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
              </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-8 space-y-6">
          {/* SECTION 1: PRODUCT TYPE */}
          <section className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm">
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
              <AppWindow size={14} className="text-slate-300" />
              Item Type
            </h3>
            <div className="flex bg-slate-50 p-1.5 rounded-2xl border border-slate-100">
              <button
                type="button"
                onClick={() => handleChange('type', 'product')}
                className={cn(
                  "flex-1 py-3 px-4 rounded-xl text-sm font-black transition-all flex items-center justify-center gap-2",
                  formData.type === 'product' 
                    ? "bg-slate-900 text-slate-50 shadow-lg shadow-slate-200 scale-[1.02]" 
                    : "text-slate-400 hover:text-slate-600"
                )}
              >
                <Package size={18} />
                Physical Product
              </button>
              <button
                type="button"
                onClick={() => {
                  handleChange('type', 'service');
                  handleChange('trackInventory', false);
                }}
                className={cn(
                  "flex-1 py-3 px-4 rounded-xl text-sm font-black transition-all flex items-center justify-center gap-2",
                  formData.type === 'service' 
                    ? "bg-slate-900 text-slate-50 shadow-lg shadow-slate-200 scale-[1.02]" 
                    : "text-slate-400 hover:text-slate-600"
                )}
              >
                <Zap size={18} />
                Service
              </button>
            </div>
          </section>

          {/* SECTION 2: BASIC INFO */}
          <section className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm space-y-5">
             <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-2">
                <Info size={14} className="text-slate-300" />
                Basic Details
              </h3>
              
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-600 ml-1">Item Title *</label>
                  <div className="relative group">
                    <Package className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-500 transition-colors" size={20} />
                    <input 
                      name="name"
                      value={formData.name || ''}
                      onChange={(e) => handleChange('name', e.target.value)}
                      placeholder="Enter a professional name..."
                      className={cn(
                        "w-full pl-12 pr-4 py-3.5 bg-slate-50 border-slate-200 rounded-2xl text-sm font-medium focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all outline-none",
                        errors.name && "border-rose-300 bg-rose-50/30 ring-rose-500/10"
                      )}
                    />
                  </div>
                  {errors.name && <p className="text-[10px] text-rose-500 font-bold ml-4 uppercase tracking-wider">{errors.name}</p>}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-600 ml-1">SKU / Code *</label>
                    <div className="relative group">
                      <Barcode className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                      <input 
                        name="sku"
                        value={formData.sku || ''}
                        onChange={(e) => handleChange('sku', e.target.value.toUpperCase())}
                        placeholder="SKU_001"
                        className={cn(
                          "w-full pl-12 pr-12 py-3.5 bg-slate-50 border-slate-200 rounded-2xl text-sm font-mono focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all outline-none",
                          errors.sku && "border-rose-300"
                        )}
                      />
                      <button 
                        type="button"
                        onClick={generateSKU}
                        className="absolute right-3 top-1/2 -translate-y-1/2 p-2 text-indigo-500 hover:bg-white rounded-xl transition-all"
                        title="Auto Generate SKU"
                      >
                        <Sparkles size={16} />
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-600 ml-1">HSN/SAC Code</label>
                    <div className="relative group">
                      <Hash className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                      <input 
                        name="hsnCode"
                        value={formData.hsnCode || ''}
                        onChange={(e) => handleChange('hsnCode', e.target.value)}
                        placeholder="e.g. 8471"
                        className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border-slate-200 rounded-2xl text-sm font-medium focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all outline-none"
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-600 ml-1">Category *</label>
                    <div className="relative group">
                      <Layers className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                      <select 
                        name="category"
                        value={formData.category || ''}
                        onChange={(e) => handleChange('category', e.target.value)}
                        className={cn(
                          "w-full pl-12 pr-4 py-3.5 bg-slate-50 border-slate-200 rounded-2xl text-sm font-medium focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 appearance-none transition-all outline-none",
                          errors.category && "border-rose-300"
                        )}
                      >
                        <option value="">Select Category</option>
                        {PRODUCT_CATEGORIES.map(cat => (
                          <option key={cat.id} value={cat.id}>{cat.label}</option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={18} />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-600 ml-1">GST Rate</label>
                    <div className="relative group">
                      <Shield className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                      <select 
                        name="gstRate"
                        value={formData.gstRate || 0}
                        onChange={(e) => handleChange('gstRate', Number(e.target.value))}
                        className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border-slate-200 rounded-2xl text-sm font-medium focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 appearance-none transition-all outline-none"
                      >
                        <option value={0}>0% (Exempt)</option>
                        <option value={5}>5%</option>
                        <option value={12}>12%</option>
                        <option value={18}>18%</option>
                        <option value={28}>28%</option>
                      </select>
                      <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={18} />
                    </div>
                  </div>
                </div>

                {/* DYNAMIC ATTRIBUTES */}
                <AnimatePresence>
                  {categoryDef && categoryDef.fields.length > 0 && (
                    <motion.div 
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="p-5 bg-indigo-50/50 rounded-2xl border border-indigo-100/50 grid grid-cols-1 sm:grid-cols-2 gap-4"
                    >
                      <div className="col-span-full">
                         <h4 className="text-[10px] font-black text-indigo-400 uppercase tracking-widest flex items-center gap-2">
                           <Zap size={12} />
                           Specification for {categoryDef.label}
                         </h4>
                      </div>
                      {categoryDef.fields.map(field => (
                        <div key={field.name} className="space-y-1.5">
                          <label className="text-[11px] font-bold text-slate-500 ml-1">
                            {field.label} {field.required && '*'}
                          </label>
                          {field.type === 'select' ? (
                            <select
                              value={formData.attributes?.[field.name] || ''}
                              onChange={(e) => handleAttributeChange(field.name, e.target.value)}
                              className="w-full px-4 py-3 bg-white border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all"
                            >
                              <option value="">Select...</option>
                              {field.options?.map(opt => (
                                <option key={opt} value={opt}>{opt}</option>
                              ))}
                            </select>
                          ) : (
                            <input
                              type={field.type}
                              value={formData.attributes?.[field.name] || ''}
                              onChange={(e) => handleAttributeChange(field.name, e.target.value)}
                              placeholder={`Enter ${field.label.toLowerCase()}...`}
                              className="w-full px-4 py-3 bg-white border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all"
                            />
                          )}
                        </div>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
          </section>

          {/* SECTION 3: PRICING */}
          <section className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm space-y-6">
            <div className="flex items-center justify-between">
               <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <TrendingUp size={14} className="text-slate-300" />
                Pricing Architecture
              </h3>
              <div className={cn(
                "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-tighter flex items-center gap-1.5",
                profit >= 0 ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"
              )}>
                {profit >= 0 ? "+" : ""}
                {formatCurrency(profit)} Profit per unit
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-600 ml-1">Cost Price (Purchased At)</label>
                <div className="relative group">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">₹</span>
                  <input 
                    type="number"
                    value={formData.costPrice || ''}
                    onChange={(e) => handleChange('costPrice', parseFloat(e.target.value))}
                    placeholder="0.00"
                    className="w-full pl-10 pr-4 py-3.5 bg-slate-50 border-slate-200 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-600 ml-1">Selling Price *</label>
                <div className="relative group">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">₹</span>
                  <input 
                    type="number"
                    value={formData.price || ''}
                    onChange={(e) => handleChange('price', parseFloat(e.target.value))}
                    placeholder="0.00"
                    className={cn(
                      "w-full pl-10 pr-4 py-3.5 bg-slate-50 border-slate-200 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all text-indigo-600",
                      errors.price && "border-rose-300"
                    )}
                  />
                </div>
              </div>
            </div>

            <div className="bg-slate-50 rounded-2xl p-4 flex flex-col sm:flex-row items-center gap-3 justify-between">
               <div className="flex items-center gap-3">
                 <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-indigo-600 shadow-sm">
                   <TrendingUp size={20} />
                 </div>
                 <div>
                   <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">Profit Margin</p>
                   <p className={cn(
                     "text-lg font-black mt-0.5",
                     margin >= 0 ? "text-emerald-600" : "text-rose-600"
                   )}>
                     {margin.toFixed(1)}%
                   </p>
                 </div>
               </div>
               
               <div className="h-px w-full sm:h-8 sm:w-px bg-slate-200" />

               <div className="flex-1 px-4 space-y-1 w-full">
                  <div className="flex justify-between text-[10px] font-bold text-slate-500">
                    <span>Low Margin</span>
                    <span>Sweet Spot</span>
                    <span>High Profit</span>
                  </div>
                  <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.max(0, Math.min(100, margin))}%` }}
                      className={cn(
                        "h-full rounded-full transition-colors duration-500",
                        margin < 10 ? "bg-rose-500" : margin < 30 ? "bg-amber-500" : "bg-emerald-500"
                      )}
                    />
                  </div>
               </div>
            </div>
          </section>

          {/* SECTION 4: INVENTORY/SERVICE SPECIFIC */}
          {formData.type === 'product' ? (
            <section className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                  <Layers size={14} className="text-slate-300" />
                  Inventory Logic
                </h3>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={formData.trackInventory}
                    onChange={(e) => handleChange('trackInventory', e.target.checked)}
                    className="sr-only peer" 
                  />
                  <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-slate-900"></div>
                </label>
              </div>

              <AnimatePresence>
                {formData.trackInventory && (
                  <motion.div 
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="space-y-5"
                  >
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-600 ml-1">Opening Stock</label>
                        <input 
                          type="number"
                          value={formData.stock || 0}
                          onChange={(e) => handleChange('stock', parseInt(e.target.value))}
                          className="w-full px-4 py-3.5 bg-slate-50 border-slate-200 rounded-2xl text-sm font-black focus:ring-2 focus:ring-indigo-500/20 outline-none"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-600 ml-1">Low Stock Alert At</label>
                        <div className="relative">
                           <AlertCircle className="absolute left-4 top-1/2 -translate-y-1/2 text-amber-500" size={16} />
                           <input 
                              type="number"
                              value={formData.minStock || 0}
                              onChange={(e) => handleChange('minStock', parseInt(e.target.value))}
                              className="w-full pl-10 pr-4 py-3.5 bg-slate-50 border-slate-200 rounded-2xl text-sm font-black focus:ring-2 focus:ring-indigo-500/20 outline-none"
                            />
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                       <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-600 ml-1">Primary Unit</label>
                        <input 
                          value={formData.primaryUnit || ''}
                          onChange={(e) => handleChange('primaryUnit', e.target.value)}
                          placeholder="e.g. PCS, Box"
                          className="w-full px-4 py-3.5 bg-slate-50 border-slate-200 rounded-2xl text-sm font-medium focus:ring-2 focus:ring-indigo-500/20 outline-none"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-600 ml-1">Secondary Unit (Optional)</label>
                        <input 
                          value={formData.secondaryUnit || ''}
                          onChange={(e) => handleChange('secondaryUnit', e.target.value)}
                          placeholder="e.g. Pack"
                          className="w-full px-4 py-3.5 bg-slate-50 border-slate-200 rounded-2xl text-sm font-medium focus:ring-2 focus:ring-indigo-500/20 outline-none"
                        />
                      </div>
                    </div>

                    {formData.secondaryUnit && (
                      <div className="p-4 bg-blue-50 rounded-2xl border border-blue-100 flex items-center justify-between">
                         <div className="flex items-center gap-3">
                           <Layers size={20} className="text-blue-600" />
                           <p className="text-xs font-bold text-blue-900">1 {formData.primaryUnit} consists of...</p>
                         </div>
                         <div className="flex items-center gap-2">
                           <input 
                            type="number"
                            value={formData.conversionRate || ''}
                            onChange={(e) => handleChange('conversionRate', parseInt(e.target.value))}
                            className="w-20 px-3 py-1.5 bg-white border-blue-200 rounded-lg text-sm font-bold text-center outline-none"
                           />
                           <span className="text-xs font-black text-blue-600">{formData.secondaryUnit}</span>
                         </div>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </section>
          ) : (
            <section className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm space-y-6">
               <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                  <Zap size={14} className="text-indigo-400" />
                  Service Parameters
                </h3>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                   <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-600 ml-1">Service Duration</label>
                    <div className="relative">
                      <Clock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                      <input 
                        value={formData.attributes?.duration || ''}
                        onChange={(e) => handleAttributeChange('duration', e.target.value)}
                        placeholder="e.g. 1 Hour"
                        className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border-slate-200 rounded-2xl text-sm font-medium focus:ring-2 focus:ring-indigo-500/20 outline-none"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-600 ml-1">Availability</label>
                    <div className="relative">
                      <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                      <input 
                        value={formData.attributes?.availability || ''}
                        onChange={(e) => handleAttributeChange('availability', e.target.value)}
                        placeholder="e.g. Mon-Fri"
                        className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border-slate-200 rounded-2xl text-sm font-medium focus:ring-2 focus:ring-indigo-500/20 outline-none"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5 col-span-full">
                    <label className="text-xs font-bold text-slate-600 ml-1">Staff Assigned</label>
                    <div className="relative">
                      <Users className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                      <input 
                        value={formData.attributes?.staff || ''}
                        onChange={(e) => handleAttributeChange('staff', e.target.value)}
                        placeholder="e.g. Senior Technician"
                        className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border-slate-200 rounded-2xl text-sm font-medium focus:ring-2 focus:ring-indigo-500/20 outline-none"
                      />
                    </div>
                  </div>
                </div>
            </section>
          )}

          {/* SECTION 7: ADVANCED COLLAPSIBLE */}
          <section className="space-y-4">
             <button
              onClick={() => setIsAdvancedOpen(!isAdvancedOpen)}
              className="w-full flex items-center justify-between p-6 bg-slate-100 rounded-3xl border border-slate-200 hover:bg-slate-200 transition-all"
             >
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-white rounded-xl text-slate-600 shadow-sm">
                    <Zap size={20} />
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-black text-slate-900">Advanced Settings</p>
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Pricing Policy • Tax • Batching</p>
                  </div>
                </div>
                <div className={cn("transition-transform duration-300", isAdvancedOpen && "rotate-180")}>
                  <ChevronDown size={20} className="text-slate-400" />
                </div>
             </button>

             <AnimatePresence>
                {isAdvancedOpen && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: -20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: -20 }}
                    className="bg-white rounded-[2rem] p-6 border border-slate-100 shadow-xl space-y-6"
                  >
                    <div className="space-y-4">
                      <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
                        <div>
                          <p className="text-sm font-black text-slate-900">Tax Inclusive Pricing</p>
                          <p className="text-[10px] text-slate-500">Sell at final price including GST</p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input type="checkbox" className="sr-only peer" />
                          <div className="w-11 h-6 bg-slate-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:bg-slate-900 transition-all after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5"></div>
                        </label>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Internal Notes</label>
                        <textarea 
                          className="w-full bg-slate-50 border-slate-100 rounded-2xl p-4 text-sm font-medium resize-none focus:bg-white transition-all outline-none"
                          rows={3}
                          placeholder="Store size, location, or private data..."
                          value={formData.description || ''}
                          onChange={(e) => handleChange('description', e.target.value)}
                        />
                      </div>
                    </div>
                  </motion.div>
                )}
             </AnimatePresence>
          </section>
        </div>

        {/* Sticky Actions Sidebar/Bottom */}
        <div className="p-6 bg-white border-t border-slate-200 flex items-center justify-between gap-4 z-20">
          <button 
            onClick={onClose}
            className="px-8 py-3.5 text-slate-500 font-black text-sm hover:text-slate-900 transition-colors uppercase tracking-widest"
          >
            Discard
          </button>
          
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex-1 py-4 bg-slate-900 text-white rounded-[1.25rem] font-black text-sm flex items-center justify-center gap-3 hover:bg-slate-800 transition-all active:scale-95 shadow-xl shadow-slate-200 disabled:bg-slate-400"
          >
            {isSaving ? (
              <>
                <Loader2 size={20} className="animate-spin" />
                Processing...
              </>
            ) : (
              <>
                Save changes
                <ArrowRight size={20} className="text-slate-400" />
              </>
            )}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
