import { useState, useEffect } from 'react';
import { User as FirebaseUser } from 'firebase/auth';
import { type Product, type InvoiceItem, type Invoice, UserRole } from '../db';
import { Plus, Trash2, Printer, Save, Search, User as UserIcon, FileText, IndianRupee, ChevronDown, ChevronUp } from 'lucide-react';
import { formatCurrency, generateInvoiceNumber, cn, formatPhone } from '../lib/utils';
import { PrintModal } from './PrintModal';
import { getInvoices, getProfile, getInvoice, type Profile as ProfileType } from '../lib/firestore';
import { db } from '../lib/firebase';
import { collection, query, where, getDocs, addDoc, updateDoc, doc } from 'firebase/firestore';

export function Billing({ 
  user, 
  ownerId,
  role,
  editId, 
  initialItems,
  isQuotation,
  onComplete 
}: { 
  user: FirebaseUser; 
  ownerId: string;
  role: UserRole | null;
  editId?: string; 
  initialItems?: InvoiceItem[];
  isQuotation?: boolean;
  onComplete?: () => void 
}) {
  const canSave = role === 'admin' || role === 'sales_manager';
  const [customerName, setCustomerName] = useState('');
  const [customerMobile, setCustomerMobile] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [showCustomerSuggestions, setShowCustomerSuggestions] = useState(false);
  const [isDirectSell, setIsDirectSell] = useState(false);
  const [isFullPayment, setIsFullPayment] = useState(false);
  const [isGstInvoice, setIsGstInvoice] = useState(false);
  const [customerGstin, setCustomerGstin] = useState('');
  const [stateOfSupply, setStateOfSupply] = useState('Uttar Pradesh');
  const [receivedAmount, setReceivedAmount] = useState<number | string>('');
  const [discount, setDiscount] = useState<number | string>('');
  const [validityDate, setValidityDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7); // Default 7 days
    return d.toISOString().split('T')[0];
  });
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'upi' | 'other'>('cash');
  const [taxPercentage, setTaxPercentage] = useState<number>(10);
  const [items, setItems] = useState<InvoiceItem[]>(initialItems || []);
  const [searchTerm, setSearchTerm] = useState('');
  const [showProductSearch, setShowProductSearch] = useState(false);
  const [showCustomItemModal, setShowCustomItemModal] = useState(false);
  const [customItem, setCustomItem] = useState({ name: '', price: '', unit: 'pcs' });
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [autoPrint, setAutoPrint] = useState(false);
  const [showMoreCustomerDetails, setShowMoreCustomerDetails] = useState(false);
  const [originalInvoice, setOriginalInvoice] = useState<Invoice | null>(null);
  
  const [products, setProducts] = useState<Product[]>([]);
  const [profile, setProfile] = useState<ProfileType | null>(null);
  const [allInvoices, setAllInvoices] = useState<Invoice[]>([]);

  const addCustomItem = () => {
    if (!customItem.name || !customItem.price) {
      alert('Please enter item name and price');
      return;
    }
    const price = parseFloat(customItem.price);
    if (isNaN(price)) {
      alert('Please enter a valid price');
      return;
    }
    setItems(prevItems => {
      const items = Array.isArray(prevItems) ? prevItems : [];
      return [...items, {
        productId: `custom-${Date.now()}`,
        name: customItem.name,
        quantity: 1,
        unit: customItem.unit,
        costPrice: 0,
        price: price,
        total: price,
        hsnCode: '',
        gstRate: 0,
        cgst: 0,
        sgst: 0,
        igst: 0
      }];
    });
    setCustomItem({ name: '', price: '', unit: 'pcs' });
    setShowCustomItemModal(false);
    setShowProductSearch(false);
  };

  useEffect(() => {
    const fetchData = async () => {
      const [prods, prof, invs] = await Promise.all([
        getDocs(query(collection(db, 'products'), where('userId', '==', ownerId))).then(s => s.docs.map(d => ({ id: d.id, ...d.data() } as Product))),
        getProfile(ownerId),
        getInvoices(ownerId)
      ]);
      setProducts(prods);
      setProfile(prof);
      setAllInvoices(invs);
    };
    fetchData();
  }, [ownerId]);

  const customerSuggestions = Array.from(new Set(allInvoices?.map(inv => JSON.stringify({
    name: inv.customerName,
    mobile: inv.customerMobile || ''
  }))) || []).map(s => JSON.parse(s as string))
    .filter(c => 
      String(c.name || '').toLowerCase().includes(customerName.toLowerCase()) && 
      customerName.length > 0 &&
      c.name !== 'Walk-in Customer'
    );
  
  useEffect(() => {
    if (profile && !editId) {
      setTaxPercentage(profile.taxPercentage ?? 10);
      if (profile.gstin) {
        setIsGstInvoice(true);
      }
      if (profile.state) {
        setStateOfSupply(profile.state);
      }
    }
  }, [profile, editId]);

  useEffect(() => {
    const directSellFlag = localStorage.getItem('quin_direct_sell');
    if (directSellFlag === 'true') {
      setIsDirectSell(true);
      setCustomerName('Walk-in Customer');
      localStorage.removeItem('quin_direct_sell');
    }

    if (editId) {
      getInvoice(editId, isQuotation).then(invoice => {
        if (invoice) {
          setOriginalInvoice(invoice);
          setCustomerName(invoice.customerName);
          setCustomerMobile(invoice.customerMobile || '');
          setCustomerAddress(invoice.customerAddress || '');
          setItems(invoice.items);
          setReceivedAmount(invoice.receivedAmount);
          setDiscount(invoice.discount || '');
          if (invoice.validityDate) {
            setValidityDate(new Date(invoice.validityDate).toISOString().split('T')[0]);
          }
          setPaymentMethod(invoice.paymentMethod || 'cash');
          setTaxPercentage(invoice.taxPercentage ?? 10);
          setIsFullPayment(invoice.receivedAmount >= invoice.total);
          setIsGstInvoice(invoice.isGstInvoice ?? false);
          setCustomerGstin(invoice.customerGstin || '');
          setStateOfSupply(invoice.stateOfSupply || profile?.state || 'Uttar Pradesh');
        }
      });
    } else {
      setOriginalInvoice(null);
      setCustomerName('');
      setCustomerMobile('');
      setItems(initialItems || []);
      setReceivedAmount('');
      setIsFullPayment(false);
    }
  }, [editId, initialItems]);

  const filteredProducts = products?.filter(p => 
    String(p.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    String(p.sku || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const addItem = (product: Product) => {
    if (!product || !product.id) {
      console.error('Product or Product ID is missing');
      return;
    }
    setItems(prevItems => {
      const items = Array.isArray(prevItems) ? prevItems : [];
      const existing = items.find(i => i.productId === product.id);
      if (existing) {
        return items.map(i => 
          i.productId === product.id 
            ? { ...i, quantity: (Number(i.quantity) || 0) + 1, total: ((Number(i.quantity) || 0) + 1) * (Number(i.price) || 0) }
            : i
        );
      } else {
        return [...items, {
          productId: product.id,
          name: product.name || 'Unknown Product',
          quantity: 1,
          unit: product.primaryUnit || 'pcs',
          basePrice: product.price || 0,
          conversionRate: product.conversionRate || 1,
          costPrice: product.costPrice || 0,
          price: product.price || 0,
          total: product.price || 0,
          hsnCode: product.hsnCode || '',
          gstRate: product.gstRate || 0,
          cgst: 0,
          sgst: 0,
          igst: 0
        }];
      }
    });
    setShowProductSearch(false);
    setSearchTerm('');
  };

  const updateUnit = (index: number, newUnit: string) => {
    setItems(prevItems => {
      const items = Array.isArray(prevItems) ? prevItems : [];
      if (!items[index]) return items;
      const newItems = [...items];
      const item = newItems[index];
      const product = products.find(p => p.id === item.productId);
      if (!product) return items;

      const basePrice = item.basePrice || product.price;
      const conversionRate = item.conversionRate || product.conversionRate || 1;

      let newPrice = basePrice;
      if (newUnit === product.secondaryUnit) {
        newPrice = basePrice / conversionRate;
      }

      newItems[index] = {
        ...item,
        unit: newUnit,
        price: newPrice,
        total: (Number(item.quantity) || 0) * newPrice
      };
      return newItems;
    });
  };

  const updateQuantity = (index: number, qty: number | string) => {
    setItems(prevItems => {
      const items = Array.isArray(prevItems) ? prevItems : [];
      if (!items[index]) return items;
      const newItems = [...items];
      if (qty === '') {
        newItems[index].quantity = '' as any;
        newItems[index].total = 0;
      } else {
        const parsedQty = typeof qty === 'string' ? parseFloat(qty) : qty;
        if (isNaN(parsedQty) || parsedQty < 0) return items;
        newItems[index].quantity = parsedQty;
        newItems[index].total = parsedQty * (Number(newItems[index].price) || 0);
      }
      return newItems;
    });
  };

  const updatePrice = (index: number, price: number | string) => {
    setItems(prevItems => {
      const items = Array.isArray(prevItems) ? prevItems : [];
      if (!items[index]) return items;
      const newItems = [...items];
      if (price === '') {
        newItems[index].price = '' as any;
        newItems[index].total = 0;
      } else {
        const parsedPrice = typeof price === 'string' ? parseFloat(price) : price;
        if (isNaN(parsedPrice) || parsedPrice < 0) return items;
        newItems[index].price = parsedPrice;
        newItems[index].total = (Number(newItems[index].quantity) || 0) * parsedPrice;
      }
      return newItems;
    });
  };

  const updateGstRate = (index: number, rate: number) => {
    setItems(prevItems => {
      const items = Array.isArray(prevItems) ? prevItems : [];
      if (!items[index]) return items;
      const newItems = [...items];
      newItems[index].gstRate = rate;
      return newItems;
    });
  };

  const removeItem = (index: number) => {
    setItems(prevItems => Array.isArray(prevItems) ? prevItems.filter((_, i) => i !== index) : []);
  };

  const subtotal = Array.isArray(items) ? items.reduce((sum, item) => sum + (Number(item.total) || 0), 0) : 0;
  
  // GST Calculations
  const isInterState = profile?.state !== stateOfSupply;
  
  const itemsWithGst = Array.isArray(items) ? items.map(item => {
    const rate = item.gstRate || 0;
    const itemGst = (Number(item.total) || 0) * (rate / 100);
    let cgst = 0, sgst = 0, igst = 0;
    
    if (isGstInvoice) {
      if (isInterState) {
        igst = itemGst;
      } else {
        cgst = itemGst / 2;
        sgst = itemGst / 2;
      }
    }
    
    return { ...item, cgst, sgst, igst };
  }) : [];

  const cgstTotal = itemsWithGst.reduce((sum, item) => sum + (item.cgst || 0), 0);
  const sgstTotal = itemsWithGst.reduce((sum, item) => sum + (item.sgst || 0), 0);
  const igstTotal = itemsWithGst.reduce((sum, item) => sum + (item.igst || 0), 0);
  const totalGst = cgstTotal + sgstTotal + igstTotal;

  const tax = isGstInvoice ? totalGst : (subtotal * (taxPercentage / 100));
  const total = subtotal + tax;
  
  const finalReceivedAmount = (isDirectSell || isFullPayment) ? total : (Number(receivedAmount) || 0);
  const creditAmount = Math.max(0, total - finalReceivedAmount);

  const handleSave = async () => {
    const finalCustomerName = isDirectSell ? 'Walk-in Customer' : customerName;

    if (!finalCustomerName || items.length === 0) {
      alert('Please enter customer name or select Direct Sell, and add at least one item.');
      return;
    }

    const invoiceData = {
      userId: ownerId,
      customerName: finalCustomerName,
      customerMobile: isDirectSell ? '' : customerMobile,
      customerAddress: isDirectSell ? '' : customerAddress,
      customerGstin: isGstInvoice ? customerGstin : '',
      isGstInvoice,
      stateOfSupply,
      ...(isQuotation ? { type: 'quotation' as const } : { type: 'invoice' as const }),
      validityDate: isQuotation ? new Date(validityDate).getTime() : undefined,
      discount: parseFloat(String(discount)) || 0,
      items: itemsWithGst,
      subtotal,
      tax,
      taxPercentage: isGstInvoice ? 0 : taxPercentage,
      totalGst: isGstInvoice ? totalGst : 0,
      cgstTotal: isGstInvoice ? cgstTotal : 0,
      sgstTotal: isGstInvoice ? sgstTotal : 0,
      igstTotal: isGstInvoice ? igstTotal : 0,
      total: total - (parseFloat(String(discount)) || 0),
      receivedAmount: finalReceivedAmount,
      paymentMethod,
      creditAmount,
      date: originalInvoice ? originalInvoice.date : Date.now(),
      invoiceNumber: originalInvoice ? originalInvoice.invoiceNumber : generateInvoiceNumber(),
      createdBy: originalInvoice?.createdBy || user.uid,
      staffName: originalInvoice?.staffName || user.displayName || user.email?.split('@')[0] || 'Staff'
    };

    try {
      // Stock Reconciliation
      const isGlobalInventoryEnabled = profile?.trackInventory !== false;

      if (isGlobalInventoryEnabled && !isQuotation) {
        // 1. Revert old items stock if editing
        if (originalInvoice) {
          for (const item of originalInvoice.items) {
            const productQuery = query(collection(db, 'products'), where('userId', '==', ownerId), where('id', '==', item.productId));
            const productSnapshot = await getDocs(productQuery);
            if (!productSnapshot.empty) {
              const productDoc = productSnapshot.docs[0];
              const product = productDoc.data() as Product;
              // Only revert if this product was being tracked
              if (product.trackInventory !== false) {
                await updateDoc(productDoc.ref, {
                  stock: product.stock + item.quantity
                });
              }
            }
          }
        }

        // 2. Apply new items stock
        for (const item of items) {
          const productQuery = query(collection(db, 'products'), where('userId', '==', ownerId), where('id', '==', item.productId));
          const productSnapshot = await getDocs(productQuery);
          if (!productSnapshot.empty) {
            const productDoc = productSnapshot.docs[0];
            const product = productDoc.data() as Product;
            // Only update if this product is being tracked
            if (product.trackInventory !== false) {
              await updateDoc(productDoc.ref, {
                stock: product.stock - item.quantity
              });
            }
          }
        }
      }

      if (originalInvoice?.id) {
        const collName = isQuotation ? 'quotations' : 'invoices';
        const docRef = doc(db, collName, originalInvoice.id.toString());
        await updateDoc(docRef, invoiceData);
        alert(isQuotation ? 'Quotation updated successfully!' : 'Sale/Invoice updated successfully!');
      } else {
        const collName = isQuotation ? 'quotations' : 'invoices';
        await addDoc(collection(db, collName), invoiceData);
      }

      if (isQuotation) {
        if (window.confirm("Quotation saved successfully! Do you want to print or share it now?")) {
           handlePrint();
           return; // do not call onComplete, allow them to use the print modal
        }
      } else if (!originalInvoice?.id) {
        alert('Sale/Invoice saved successfully!');
      }

      if (onComplete) {
        onComplete();
      } else {
        setItems([]);
        setCustomerName('');
        setCustomerMobile('');
        setReceivedAmount('');
        setIsFullPayment(false);
      }
    } catch (error) {
      console.error('Error saving invoice:', error);
      alert('Failed to save invoice.');
    }
  };

  const handlePrint = () => {
    if (items.length === 0) {
      alert('Please add at least one item to print.');
      return;
    }
    setAutoPrint(false);
    setShowPrintModal(true);
  };

  const handleQuickPrint = () => {
    if (items.length === 0) {
      alert('Please add at least one item to print.');
      return;
    }
    setAutoPrint(true);
    setShowPrintModal(true);
  };

  const currentInvoice: Invoice = {
    userId: ownerId,
    customerName: isDirectSell ? 'Walk-in Customer' : customerName,
    customerMobile: isDirectSell ? '' : customerMobile,
    customerAddress: isDirectSell ? '' : customerAddress,
    customerGstin: isGstInvoice ? customerGstin : '',
    isGstInvoice,
    stateOfSupply,
    ...(isQuotation ? { type: 'quotation' as const } : { type: 'invoice' as const }),
    validityDate: isQuotation ? new Date(validityDate).getTime() : undefined,
    discount: parseFloat(String(discount)) || 0,
    items: itemsWithGst,
    subtotal,
    tax,
    taxPercentage: isGstInvoice ? 0 : taxPercentage,
    totalGst: isGstInvoice ? totalGst : 0,
    cgstTotal: isGstInvoice ? cgstTotal : 0,
    sgstTotal: isGstInvoice ? sgstTotal : 0,
    igstTotal: isGstInvoice ? igstTotal : 0,
    total: total - (parseFloat(String(discount)) || 0),
    receivedAmount: finalReceivedAmount,
    paymentMethod,
    creditAmount,
    date: originalInvoice ? originalInvoice.date : Date.now(),
    invoiceNumber: originalInvoice ? originalInvoice.invoiceNumber : generateInvoiceNumber()
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
      {showPrintModal && (
        <PrintModal 
          invoice={currentInvoice} 
          profile={profile} 
          onClose={() => setShowPrintModal(false)} 
          autoPrint={autoPrint}
        />
      )}
      <div className="md:col-span-2 space-y-6">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-slate-100 flex justify-between items-center">
            <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <FileText size={20} className="text-slate-400" />
              {isQuotation ? 'Quotation Items' : 'Sale/Invoice Items'}
            </h2>
            <div className="relative">
              <button
                onClick={() => setShowProductSearch(!showProductSearch)}
                className="bg-slate-900 text-white px-4 py-2 rounded-lg flex items-center gap-2 text-sm"
              >
                <Plus size={16} />
                Add Item
              </button>

              {showProductSearch && (
                <div className="absolute right-0 mt-2 w-80 bg-white rounded-xl shadow-xl border border-slate-200 z-10 flex flex-col max-h-[60vh]">
                  <div className="p-3 border-b border-slate-100 flex items-center gap-2 shrink-0">
                    <Search size={16} className="text-slate-400" />
                    <input
                      autoFocus
                      type="text"
                      placeholder="Search products..."
                      className="w-full border-none focus:ring-0 p-0 text-sm"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </div>
                  <div className="overflow-y-auto pb-4">
                    {filteredProducts?.map(product => (
                      <button
                        key={product.id}
                        onClick={() => addItem(product)}
                        className="w-full p-3 text-left hover:bg-slate-50 flex justify-between items-center border-b border-slate-50 last:border-0"
                      >
                        <div>
                          <div className="font-medium text-sm text-slate-900">{product.name}</div>
                          <div className="text-xs text-slate-500">{product.sku} • Stock: {product.stock}</div>
                        </div>
                        <div className="text-sm font-semibold text-slate-700">{formatCurrency(product.price)}</div>
                      </button>
                    ))}
                    <button
                      onClick={() => {
                        setShowCustomItemModal(true);
                        setShowProductSearch(false);
                      }}
                      className="w-full p-3 text-left text-indigo-600 font-medium text-sm hover:bg-indigo-50 border-t border-slate-100"
                    >
                      + Add Custom Item
                    </button>
                  </div>
                </div>
              )}
              {showCustomItemModal && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                  <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm space-y-4">
                    <h3 className="font-bold text-lg">Add Custom Item</h3>
                    <input
                      type="text"
                      placeholder="Item Name"
                      className="w-full p-2 rounded border border-slate-200"
                      value={customItem.name}
                      onChange={(e) => setCustomItem({ ...customItem, name: e.target.value })}
                    />
                    <input
                      type="text"
                      placeholder="Price"
                      className="w-full p-2 rounded border border-slate-200"
                      value={customItem.price}
                      onChange={(e) => setCustomItem({ ...customItem, price: e.target.value })}
                    />
                    <input
                      type="text"
                      placeholder="Unit (e.g., pcs, kg, ltr)"
                      className="w-full p-2 rounded border border-slate-200"
                      value={customItem.unit}
                      onChange={(e) => setCustomItem({ ...customItem, unit: e.target.value })}
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => setShowCustomItemModal(false)}
                        className="flex-1 bg-slate-100 text-slate-700 py-2 rounded hover:bg-slate-200"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={addCustomItem}
                        className="flex-1 bg-indigo-600 text-white py-2 rounded hover:bg-indigo-700"
                      >
                        {isQuotation ? 'Add to Quotation' : 'Add to Sale/Invoice'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-500 font-medium border-b border-slate-100">
                <tr>
                  <th className="px-6 py-3">Item Name</th>
                  <th className="px-6 py-3">HSN/SAC</th>
                  <th className="px-6 py-3">Qty</th>
                  <th className="px-6 py-3">Unit</th>
                  <th className="px-6 py-3">Rate</th>
                  <th className="px-6 py-3">Tax %</th>
                  <th className="px-6 py-3">Amount</th>
                  <th className="px-6 py-3 text-right"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((item, index) => (
                  <tr key={index} className="hover:bg-slate-50 transition-colors group">
                    <td className="px-6 py-4 font-bold text-slate-900 min-w-[150px]">{item.name}</td>
                    <td className="px-6 py-4 text-slate-500 text-xs font-mono">{item.hsnCode || '-'}</td>
                    <td className="px-6 py-4">
                      <input
                        type="number"
                        className="w-16 py-1 px-2 border border-slate-200 rounded focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                        value={item.quantity}
                        onChange={(e) => updateQuantity(index, e.target.value)}
                      />
                    </td>
                    <td className="px-6 py-4 text-slate-600 text-xs font-bold uppercase tracking-wider">
                      {(() => {
                        const product = products.find(p => p.id === item.productId);
                        if (product?.secondaryUnit) {
                          return (
                            <select
                              className="w-full py-1 text-xs border border-slate-200 rounded focus:ring-0 bg-white"
                              value={item.unit}
                              onChange={(e) => updateUnit(index, e.target.value)}
                            >
                              <option value={product.primaryUnit}>{product.primaryUnit}</option>
                              <option value={product.secondaryUnit}>{product.secondaryUnit}</option>
                            </select>
                          );
                        }
                        return item.unit || 'pcs';
                      })()}
                    </td>
                    <td className="px-6 py-4">
                      <div className="relative">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-[10px]">₹</span>
                        <input
                          type="number"
                          className="w-24 py-1 pl-5 pr-2 text-sm border border-slate-200 rounded focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                          value={item.price}
                          onChange={(e) => updatePrice(index, e.target.value)}
                        />
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <select
                        className="w-20 py-1 text-xs border border-slate-200 rounded focus:ring-0 bg-white"
                        value={item.gstRate}
                        onChange={(e) => updateGstRate(index, parseFloat(e.target.value))}
                      >
                        <option value="0">0%</option>
                        <option value="5">5%</option>
                        <option value="12">12%</option>
                        <option value="18">18%</option>
                        <option value="28">28%</option>
                      </select>
                    </td>
                    <td className="px-6 py-4 font-black text-indigo-900">{formatCurrency(item.total)}</td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => removeItem(index)}
                        className="text-slate-400 hover:text-red-600 p-1 rounded hover:bg-red-50"
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
                {items.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-slate-400">
                      No items added to invoice
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="space-y-6">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <UserIcon size={20} className="text-slate-400" />
              Customer Info
            </h2>
            <div className="flex gap-2">
              <button
                onClick={() => setIsGstInvoice(!isGstInvoice)}
                className={cn(
                  "px-3 py-1 rounded-full text-[10px] font-bold transition-all",
                  isGstInvoice 
                    ? "bg-emerald-600 text-white" 
                    : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                )}
              >
                {isQuotation ? 'GST Quotation' : 'GST Sale/Invoice'}
              </button>
              <button
                onClick={() => {
                  setIsDirectSell(!isDirectSell);
                  if (!isDirectSell) {
                    setCustomerName('Walk-in Customer');
                    setCustomerMobile('');
                  } else {
                    setCustomerName('');
                  }
                }}
                className={cn(
                  "px-3 py-1 rounded-full text-[10px] font-bold transition-all",
                  isDirectSell 
                    ? "bg-slate-900 text-white" 
                    : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                )}
              >
                Direct Sell
              </button>
            </div>
          </div>
          <div className={cn("space-y-4 transition-opacity", isDirectSell ? "opacity-50 pointer-events-none" : "")}>
            <div className="space-y-1.5 relative">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Customer Name</label>
              <input
                value={customerName}
                onChange={(e) => {
                  setCustomerName(e.target.value);
                  setShowCustomerSuggestions(true);
                }}
                onFocus={() => setShowCustomerSuggestions(true)}
                onBlur={() => setTimeout(() => setShowCustomerSuggestions(false), 200)}
                className="w-full"
                placeholder="John Doe"
              />
              {showCustomerSuggestions && customerSuggestions.length > 0 && (
                <div className="absolute left-0 right-0 top-full mt-1 bg-white rounded-xl shadow-xl border border-slate-200 z-20 overflow-hidden">
                  {customerSuggestions.slice(0, 5).map((c, i) => (
                    <button
                      key={i}
                      onClick={() => {
                        setCustomerName(c.name);
                        setCustomerMobile(c.mobile);
                        setShowCustomerSuggestions(false);
                      }}
                      className="w-full p-3 text-left hover:bg-slate-50 flex items-center gap-3 border-b border-slate-50 last:border-0"
                    >
                      <div className="p-2 bg-slate-100 rounded-lg text-slate-400">
                        <UserIcon size={14} />
                      </div>
                      <div>
                        <div className="font-bold text-sm text-slate-900">{c.name}</div>
                        {c.mobile && <div className="text-[10px] text-slate-500">{formatPhone(c.mobile)}</div>}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Mobile Number (Optional)</label>
              <input
                value={customerMobile}
                onChange={(e) => {
                  let val = e.target.value;
                  // Remove non-numeric characters except +
                  val = val.replace(/[^0-9+]/g, '');
                  
                  // If it doesn't start with +91, add it
                  if (val.length > 0 && !val.startsWith('+91')) {
                    // If it starts with 0, remove it and add +91
                    if (val.startsWith('0')) {
                      val = '+91' + val.slice(1);
                    } else {
                      val = '+91' + val;
                    }
                  }
                  setCustomerMobile(val);
                }}
                className="w-full"
                placeholder="9876543210"
              />
              {allInvoices.some(inv => inv.customerMobile === customerMobile && inv.id !== originalInvoice?.id) && (
                <p className="text-[10px] text-amber-600 font-bold mt-1">
                  Warning: This mobile number is already in records. Transactions will be merged.
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Customer Address</label>
              <textarea
                value={customerAddress}
                onChange={(e) => setCustomerAddress(e.target.value)}
                className="w-full text-sm min-h-[60px]"
                placeholder="123 Street Name, City, State, ZIP"
              />
            </div>

            {isQuotation && (
              <div className="p-4 bg-indigo-50 rounded-xl border border-indigo-100 space-y-4">
                <h3 className="text-xs font-black text-indigo-900 uppercase tracking-widest flex items-center gap-2">
                   <FileText size={14} />
                   Quotation Specifics
                </h3>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-indigo-600 uppercase tracking-wider">Validity Date</label>
                  <input
                    type="date"
                    value={validityDate}
                    onChange={(e) => setValidityDate(e.target.value)}
                    className="w-full border-indigo-200 focus:ring-indigo-500 text-sm"
                  />
                  <p className="text-[10px] text-indigo-400 italic">Quotation expires after this date.</p>
                </div>
              </div>
            )}

            {isGstInvoice && (
              <>
                <button
                  onClick={() => setShowMoreCustomerDetails(!showMoreCustomerDetails)}
                  className="flex items-center gap-2 text-xs font-semibold text-indigo-600 uppercase tracking-wider hover:text-indigo-800"
                >
                  {showMoreCustomerDetails ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  {showMoreCustomerDetails ? 'Hide Details' : 'More Details'}
                </button>
                {showMoreCustomerDetails && (
                  <div className="space-y-4 pt-2">
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Customer GSTIN (Optional)</label>
                      <input
                        value={customerGstin}
                        onChange={(e) => setCustomerGstin(e.target.value.toUpperCase())}
                        className="w-full"
                        placeholder="09AAAAA0000A1Z5"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">State of Supply</label>
                      <select
                        value={stateOfSupply}
                        onChange={(e) => setStateOfSupply(e.target.value)}
                        className="w-full appearance-none"
                      >
                        <option value="Andhra Pradesh">Andhra Pradesh</option>
                        <option value="Arunachal Pradesh">Arunachal Pradesh</option>
                        <option value="Assam">Assam</option>
                        <option value="Bihar">Bihar</option>
                        <option value="Chhattisgarh">Chhattisgarh</option>
                        <option value="Goa">Goa</option>
                        <option value="Gujarat">Gujarat</option>
                        <option value="Haryana">Haryana</option>
                        <option value="Himachal Pradesh">Himachal Pradesh</option>
                        <option value="Jharkhand">Jharkhand</option>
                        <option value="Karnataka">Karnataka</option>
                        <option value="Kerala">Kerala</option>
                        <option value="Madhya Pradesh">Madhya Pradesh</option>
                        <option value="Maharashtra">Maharashtra</option>
                        <option value="Manipur">Manipur</option>
                        <option value="Meghalaya">Meghalaya</option>
                        <option value="Mizoram">Mizoram</option>
                        <option value="Nagaland">Nagaland</option>
                        <option value="Odisha">Odisha</option>
                        <option value="Punjab">Punjab</option>
                        <option value="Rajasthan">Rajasthan</option>
                        <option value="Sikkim">Sikkim</option>
                        <option value="Tamil Nadu">Tamil Nadu</option>
                        <option value="Telangana">Telangana</option>
                        <option value="Tripura">Tripura</option>
                        <option value="Uttar Pradesh">Uttar Pradesh</option>
                        <option value="Uttarakhand">Uttarakhand</option>
                        <option value="West Bengal">West Bengal</option>
                        <option value="Andaman and Nicobar Islands">Andaman and Nicobar Islands</option>
                        <option value="Chandigarh">Chandigarh</option>
                        <option value="Dadra and Nagar Haveli and Daman and Diu">Dadra and Nagar Haveli and Daman and Diu</option>
                        <option value="Delhi">Delhi</option>
                        <option value="Jammu and Kashmir">Jammu and Kashmir</option>
                        <option value="Ladakh">Ladakh</option>
                        <option value="Lakshadweep">Lakshadweep</option>
                        <option value="Puducherry">Puducherry</option>
                      </select>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {!isDirectSell && !isQuotation && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <IndianRupee size={20} className="text-slate-400" />
              Payment Details
            </h2>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Received Amount</label>
                <label className="flex items-center gap-2 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={isFullPayment}
                    onChange={(e) => {
                      setIsFullPayment(e.target.checked);
                      if (e.target.checked) setReceivedAmount('');
                    }}
                    className="w-4 h-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                  />
                  <span className="text-xs font-bold text-slate-600 group-hover:text-slate-900 transition-colors">Full Payment?</span>
                </label>
              </div>
              <div className="grid grid-cols-1 gap-3">
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">₹</span>
                  <input
                    type="number"
                    value={isFullPayment ? total.toFixed(2) : receivedAmount}
                    onChange={(e) => setReceivedAmount(e.target.value)}
                    disabled={isFullPayment}
                    className={cn(
                      "w-full pl-8",
                      isFullPayment ? "bg-slate-50 text-slate-500 border-slate-100" : ""
                    )}
                    placeholder="0.00"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {(['cash', 'upi', 'card', 'other'] as const).map((method) => (
                    <button
                      key={method}
                      onClick={() => setPaymentMethod(method)}
                      className={cn(
                        "py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all border",
                        paymentMethod === method 
                          ? "bg-slate-900 border-slate-900 text-white shadow-md shadow-slate-200" 
                          : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50"
                      )}
                    >
                      {method}
                    </button>
                  ))}
                </div>
              </div>
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-100 flex justify-between items-center">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Credit Amount</span>
                <span className={cn("font-bold", creditAmount > 0 ? "text-red-600" : "text-slate-900")}>
                  {formatCurrency(creditAmount)}
                </span>
              </div>
            </div>
          </div>
        )}

        <div className="bg-slate-900 rounded-xl shadow-lg p-6 text-white space-y-4">
          <h2 className="text-lg font-bold opacity-80">Summary</h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="opacity-60">Subtotal</span>
              <span>{formatCurrency(subtotal)}</span>
            </div>
            {isGstInvoice ? (
              <div className="space-y-2 py-2 border-y border-white/10">
                {!isInterState ? (
                  <>
                    <div className="flex justify-between">
                      <span className="opacity-60 text-xs">CGST Total</span>
                      <span className="text-xs">{formatCurrency(cgstTotal)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="opacity-60 text-xs">SGST Total</span>
                      <span className="text-xs">{formatCurrency(sgstTotal)}</span>
                    </div>
                  </>
                ) : (
                  <div className="flex justify-between">
                    <span className="opacity-60 text-xs text-indigo-400">IGST Total</span>
                    <span className="text-xs">{formatCurrency(igstTotal)}</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex justify-between items-center py-1">
                <div className="flex items-center gap-2">
                  <span className="opacity-60">Tax</span>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.1"
                      value={taxPercentage}
                      onChange={(e) => setTaxPercentage(parseFloat(e.target.value) || 0)}
                      className="w-16 bg-white/10 border-white/20 text-white text-xs py-1 px-2 rounded focus:ring-1 focus:ring-white/30 text-center"
                    />
                    <span className="absolute right-1 top-1/2 -translate-y-1/2 text-[10px] opacity-40">%</span>
                  </div>
                </div>
                <span>{formatCurrency(tax)}</span>
              </div>
            )}

            <div className="flex justify-between items-center py-2 border-t border-white/5">
              <span className="opacity-60">Discount</span>
              <div className="relative">
                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-white/40 text-xs">₹</span>
                <input
                  type="number"
                  value={discount}
                  onChange={(e) => setDiscount(e.target.value)}
                  className="w-24 bg-white/5 border-white/10 text-white text-sm py-1 pl-5 pr-2 rounded text-right"
                  placeholder="0"
                />
              </div>
            </div>

            {isQuotation && (
              <div className="flex justify-between items-center py-2 border-t border-white/5">
                <span className="opacity-60 text-xs uppercase font-bold tracking-wider">Validity Date</span>
                <input
                  type="date"
                  value={validityDate}
                  onChange={(e) => setValidityDate(e.target.value)}
                  className="bg-white/5 border-white/10 text-white text-xs py-1 px-2 rounded"
                />
              </div>
            )}

            <div className="pt-4 border-t border-white/20 flex justify-between text-2xl font-black text-indigo-400">
              <span className="text-white opacity-80 text-lg">Total</span>
              <span>{formatCurrency(total - (parseFloat(String(discount)) || 0))}</span>
            </div>
            {finalReceivedAmount > 0 && !isQuotation && (
              <div className="flex justify-between text-[10px] uppercase font-bold text-white/40 pt-1">
                <span>Paid via {paymentMethod}</span>
                <span>{formatCurrency(finalReceivedAmount)}</span>
              </div>
            )}
          </div>
          <div className="pt-4 flex gap-3 flex-wrap">
            <button
              onClick={handlePrint}
              className="flex-1 bg-white/10 hover:bg-white/20 text-white py-2.5 rounded-lg flex items-center justify-center gap-2 transition-colors min-w-[70px]"
              title="Open Print Options"
            >
              <Printer size={18} />
              Print
            </button>
            <button
              onClick={handleQuickPrint}
              className="flex-1 bg-white/10 hover:bg-white/20 text-white py-2.5 rounded-lg flex items-center justify-center gap-2 transition-colors min-w-[70px]"
              title="System Print Directly"
            >
              <FileText size={18} />
              Quick
            </button>
            {canSave && (
              <button
                onClick={handleSave}
                className="flex-1 bg-indigo-500 hover:bg-indigo-600 text-white py-2.5 rounded-lg flex items-center justify-center gap-2 transition-colors min-w-[70px]"
              >
                <Save size={18} />
                Save
              </button>
            )}
          </div>
        </div>
      </div>

    </div>
  );
}
