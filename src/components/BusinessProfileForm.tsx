import React, { useState, useEffect } from 'react';
import { 
  Building2, 
  User, 
  Phone, 
  MessageCircle, 
  Mail, 
  MapPin, 
  ShieldCheck, 
  Tag, 
  FileText, 
  Camera, 
  Save, 
  ChevronRight, 
  ChevronLeft,
  CheckCircle2,
  AlertCircle,
  Truck,
  Package,
  IndianRupee
} from 'lucide-react';
import { auth } from '../lib/firebase';
import { saveBusinessProfile, getBusinessProfile, uploadImage, isGstUnique } from '../lib/firestore';
import { type BusinessProfile } from '../db';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const CATEGORIES = [
  'Hardware',
  'Electronics',
  'Grocery',
  'Paint',
  'Others'
];

const DELIVERY_OPTIONS = [
  { id: 'pickup', label: 'Pickup Only', icon: Package },
  { id: 'local', label: 'Local Delivery', icon: Truck },
  { id: 'courier', label: 'Courier', icon: Truck }
];

interface BusinessProfileFormProps {
  onSuccess?: () => void;
  initialData?: Partial<BusinessProfile> | null;
  ownerId: string;
}

export default function BusinessProfileForm({ onSuccess, initialData, ownerId }: BusinessProfileFormProps) {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [formData, setFormData] = useState<Partial<BusinessProfile>>({
    businessName: '',
    ownerName: '',
    mobile: '',
    whatsapp: '',
    email: '',
    address: '',
    city: '',
    state: '',
    gstNumber: '',
    categories: [],
    description: '',
    logoUrl: '',
    pricingType: 'show',
    moq: 1,
    deliveryType: 'pickup',
    ...initialData
  });

  const userId = ownerId;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleCategoryToggle = (category: string) => {
    setFormData(prev => {
      const categories = prev.categories || [];
      if (categories.includes(category)) {
        return { ...prev, categories: categories.filter(c => c !== category) };
      }
      if (categories.length >= 3) return prev;
      return { ...prev, categories: [...categories, category] };
    });
  };

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setFormData(prev => ({ ...prev, logoUrl: reader.result as string }));
      };
      reader.readAsDataURL(file);
    }
  };

  const calculateCompletion = () => {
    const fields = [
      'businessName', 'mobile', 'whatsapp', 'categories', 
      'description', 'pricingType', 'moq', 'deliveryType'
    ];
    let completed = 0;
    fields.forEach(f => {
      if (formData[f as keyof BusinessProfile] && (Array.isArray(formData[f as keyof BusinessProfile]) ? (formData[f as keyof BusinessProfile] as any).length > 0 : true)) {
        completed++;
      }
    });
    
    // Optional but recommended fields
    if (formData.gstNumber) completed += 0.5;
    if (formData.logoUrl) completed += 0.5;
    if (formData.city && formData.state) completed += 0.5;
    if (formData.address) completed += 0.5;

    const totalPossible = fields.length + 2; // 2 for the 4 half-point optional fields
    return Math.min(Math.round((completed / totalPossible) * 100), 100);
  };

  const handleSubmit = async () => {
    if (!userId) return;
    
    // Validation
    if (!formData.businessName || !formData.mobile || !formData.whatsapp || !formData.description || (formData.categories?.length || 0) === 0) {
      setError('Please fill all required fields');
      return;
    }

    if (formData.gstNumber) {
      const unique = await isGstUnique(formData.gstNumber, userId);
      if (!unique) {
        setError('GST number is already in use by another seller.');
        setLoading(false);
        return;
      }
    }

    setLoading(true);
    setError(null);
    try {
      let finalLogoUrl = formData.logoUrl || '';
      if (imageFile) {
        finalLogoUrl = await uploadImage(imageFile, `logos/${userId}`);
      }

      const profileData: BusinessProfile = {
        userId,
        businessName: formData.businessName!,
        ownerName: formData.ownerName || '',
        mobile: formData.mobile!,
        whatsapp: formData.whatsapp!,
        email: formData.email || '',
        address: formData.address || '',
        city: formData.city || '',
        state: formData.state || '',
        gstNumber: formData.gstNumber || '',
        categories: formData.categories!,
        description: formData.description!,
        logoUrl: finalLogoUrl,
        pricingType: (formData.pricingType as any) || 'show',
        moq: Number(formData.moq) || 1,
        deliveryType: (formData.deliveryType as any) || 'pickup',
        createdAt: initialData?.createdAt || Date.now(),
        updatedAt: Date.now(),
        totalOrdersCompleted: initialData?.totalOrdersCompleted || 0,
        totalInquiriesCompleted: initialData?.totalInquiriesCompleted || 0,
        inquiriesWon: initialData?.inquiriesWon || 0,
        inquiriesLost: initialData?.inquiriesLost || 0,
        competitionCount: initialData?.competitionCount || 0,
        verificationLevel: initialData?.verificationLevel || (formData.gstNumber ? 'gst_verified' : 'basic'),
        rating: initialData?.rating || 0,
        totalRatings: initialData?.totalRatings || 0,
        isTopRated: initialData?.isTopRated || false,
        isFastResponder: initialData?.isFastResponder || false,
      };

      await saveBusinessProfile(userId, profileData);
      if (onSuccess) onSuccess();
    } catch (err) {
      console.error('Error saving profile:', err);
      setError('Failed to save profile. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const completion = calculateCompletion();

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      {/* Header & Progress */}
      <div className="p-6 border-b bg-gray-50/50">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Business Profile</h2>
            <p className="text-sm text-gray-500">Build trust with your B2B partners</p>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-indigo-600">{completion}%</div>
            <div className="text-xs font-medium text-gray-400 uppercase tracking-wider">Completion</div>
          </div>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div 
            className="bg-indigo-600 h-2 rounded-full transition-all duration-500" 
            style={{ width: `${completion}%` }}
          />
        </div>
      </div>

      <div className="p-6">
        {/* Step Navigation Bar */}
        <div className="flex overflow-x-auto whitespace-nowrap gap-2 mb-6 border-b border-gray-200 pb-2">
          {['Basic Info', 'Categories & Description', 'Selling Settings'].map((label, index) => (
            <button
              key={index}
              type="button"
              onClick={() => setStep(index + 1)}
              className={cn(
                "px-4 py-2 text-sm font-bold rounded-lg transition-all",
                step === index + 1
                  ? "bg-indigo-600 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-xl flex items-center gap-3 text-red-700 text-sm">
            <AlertCircle className="w-5 h-5 shrink-0" />
            {error}
          </div>
        )}

        {/* Step 1: Basic Info */}
        {step === 1 && (
          <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-gray-400" />
                  Business Name *
                </label>
                <input
                  type="text"
                  name="businessName"
                  value={formData.businessName}
                  onChange={handleChange}
                  placeholder="e.g. Agarwal Hardware Store"
                  className="w-full px-4 py-2 border rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                  <User className="w-4 h-4 text-gray-400" />
                  Owner Name
                </label>
                <input
                  type="text"
                  name="ownerName"
                  value={formData.ownerName}
                  onChange={handleChange}
                  placeholder="e.g. Rajesh Agarwal"
                  className="w-full px-4 py-2 border rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                  <Phone className="w-4 h-4 text-gray-400" />
                  Mobile Number *
                </label>
                <input
                  type="tel"
                  name="mobile"
                  value={formData.mobile}
                  onChange={handleChange}
                  placeholder="10-digit mobile number"
                  className="w-full px-4 py-2 border rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                  <MessageCircle className="w-4 h-4 text-gray-400" />
                  WhatsApp Number *
                </label>
                <div className="flex gap-2">
                  <input
                    type="tel"
                    name="whatsapp"
                    value={formData.whatsapp}
                    onChange={handleChange}
                    placeholder="WhatsApp number"
                    className="flex-1 px-4 py-2 border rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setFormData(prev => ({ ...prev, whatsapp: prev.mobile }))}
                    className="px-3 py-2 text-xs font-medium text-indigo-600 bg-indigo-50 rounded-xl hover:bg-indigo-100 transition-colors"
                  >
                    Same as Mobile
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                  <Mail className="w-4 h-4 text-gray-400" />
                  Email Address
                </label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  placeholder="business@example.com"
                  className="w-full px-4 py-2 border rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-gray-400" />
                  GST Number (Recommended)
                </label>
                <input
                  type="text"
                  name="gstNumber"
                  value={formData.gstNumber}
                  onChange={handleChange}
                  placeholder="15-digit GSTIN"
                  className="w-full px-4 py-2 border rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all uppercase"
                />
                {!formData.gstNumber && (
                  <p className="text-[10px] text-orange-600 font-medium">Add GST to get "Verified" badge and increase trust.</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-3 space-y-2">
                <label className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-gray-400" />
                  Business Address
                </label>
                <textarea
                  name="address"
                  value={formData.address}
                  onChange={handleChange}
                  rows={2}
                  placeholder="Full shop/office address"
                  className="w-full px-4 py-2 border rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all resize-none"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-700">City</label>
                <input
                  type="text"
                  name="city"
                  value={formData.city}
                  onChange={handleChange}
                  placeholder="City"
                  className="w-full px-4 py-2 border rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-700">State</label>
                <input
                  type="text"
                  name="state"
                  value={formData.state}
                  onChange={handleChange}
                  placeholder="State"
                  className="w-full px-4 py-2 border rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                />
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Categories & Description */}
        {step === 2 && (
          <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
            <div className="space-y-4">
              <label className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <Tag className="w-4 h-4 text-gray-400" />
                Business Categories * (Select up to 3)
              </label>
              <div className="flex flex-wrap gap-2">
                {CATEGORIES.map(cat => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => handleCategoryToggle(cat)}
                    className={cn(
                      "px-4 py-2 rounded-full text-sm font-medium border transition-all",
                      formData.categories?.includes(cat)
                        ? "bg-indigo-600 border-indigo-600 text-white shadow-md shadow-indigo-100"
                        : "bg-white border-gray-200 text-gray-600 hover:border-indigo-300"
                    )}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <FileText className="w-4 h-4 text-gray-400" />
                Business Description *
              </label>
              <textarea
                name="description"
                value={formData.description}
                onChange={handleChange}
                rows={3}
                maxLength={150}
                placeholder="Briefly describe what you sell and your specialty..."
                className="w-full px-4 py-2 border rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all resize-none"
              />
              <div className="flex justify-end">
                <span className={cn(
                  "text-[10px] font-medium",
                  (formData.description?.length || 0) > 140 ? "text-red-500" : "text-gray-400"
                )}>
                  {formData.description?.length || 0}/150
                </span>
              </div>
            </div>

            <div className="space-y-4">
              <label className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <Camera className="w-4 h-4 text-gray-400" />
                Business Logo
              </label>
              <div className="flex items-center gap-6">
                <div className="w-24 h-24 bg-gray-100 rounded-2xl border-2 border-dashed border-gray-300 flex items-center justify-center overflow-hidden shrink-0">
                  {formData.logoUrl ? (
                    <img src={formData.logoUrl} alt="Logo Preview" className="w-full h-full object-cover" />
                  ) : (
                    <Building2 className="w-8 h-8 text-gray-300" />
                  )}
                </div>
                <div className="space-y-2">
                  <label className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 cursor-pointer transition-colors shadow-sm">
                    <Camera className="w-4 h-4" />
                    Upload Logo
                    <input type="file" className="hidden" accept="image/*" onChange={handleLogoChange} />
                  </label>
                  <p className="text-xs text-gray-400">Recommended: Square image, max 2MB</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Selling Settings */}
        {step === 3 && (
          <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-4">
                <label className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                  <IndianRupee className="w-4 h-4 text-gray-400" />
                  Pricing Visibility
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setFormData(prev => ({ ...prev, pricingType: 'show' }))}
                    className={cn(
                      "p-4 rounded-xl border text-left transition-all",
                      formData.pricingType === 'show'
                        ? "border-indigo-600 bg-indigo-50 ring-1 ring-indigo-600"
                        : "border-gray-200 hover:border-indigo-300"
                    )}
                  >
                    <p className="font-bold text-gray-900">Show Price</p>
                    <p className="text-xs text-gray-500 mt-1">Buyers see your rates</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormData(prev => ({ ...prev, pricingType: 'hide' }))}
                    className={cn(
                      "p-4 rounded-xl border text-left transition-all",
                      formData.pricingType === 'hide'
                        ? "border-indigo-600 bg-indigo-50 ring-1 ring-indigo-600"
                        : "border-gray-200 hover:border-indigo-300"
                    )}
                  >
                    <p className="font-bold text-gray-900">Hide Price</p>
                    <p className="text-xs text-gray-500 mt-1">Contact for price</p>
                  </button>
                </div>
              </div>

              <div className="space-y-4">
                <label className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                  <Package className="w-4 h-4 text-gray-400" />
                  Minimum Order Quantity (MOQ)
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    name="moq"
                    min="1"
                    value={formData.moq}
                    onChange={handleChange}
                    className="w-full px-4 py-2 border rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                  />
                  <span className="text-sm text-gray-500 font-medium whitespace-nowrap">Units</span>
                </div>
                <p className="text-[10px] text-gray-400">Minimum quantity a buyer must order.</p>
              </div>
            </div>

            <div className="space-y-4">
              <label className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <Truck className="w-4 h-4 text-gray-400" />
                Delivery Options
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {DELIVERY_OPTIONS.map(opt => {
                  const Icon = opt.icon;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, deliveryType: opt.id as any }))}
                      className={cn(
                        "p-4 rounded-xl border flex flex-col items-center gap-2 transition-all",
                        formData.deliveryType === opt.id
                          ? "border-indigo-600 bg-indigo-50 ring-1 ring-indigo-600"
                          : "border-gray-200 hover:border-indigo-300"
                      )}
                    >
                      <Icon className={cn(
                        "w-6 h-6",
                        formData.deliveryType === opt.id ? "text-indigo-600" : "text-gray-400"
                      )} />
                      <span className="text-sm font-bold text-gray-900">{opt.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Navigation Buttons */}
        <div className="mt-10 pt-6 border-t flex justify-between items-center">
          {step > 1 ? (
            <button
              type="button"
              onClick={() => setStep(prev => prev - 1)}
              className="flex items-center gap-2 px-6 py-2 text-gray-600 font-bold hover:text-gray-900 transition-colors"
            >
              <ChevronLeft className="w-5 h-5" />
              Back
            </button>
          ) : (
            <div />
          )}

          {step < 3 ? (
            <button
              type="button"
              onClick={() => setStep(prev => prev + 1)}
              className="flex items-center gap-2 bg-indigo-600 text-white px-8 py-2.5 rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100"
            >
              Next Step
              <ChevronRight className="w-5 h-5" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={loading}
              className="flex items-center gap-2 bg-indigo-600 text-white px-10 py-2.5 rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 disabled:opacity-50"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <Save className="w-5 h-5" />
              )}
              Save Profile
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
