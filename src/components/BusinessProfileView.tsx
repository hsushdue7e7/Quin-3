import React, { useRef } from 'react';
import { 
  Building2, 
  MapPin, 
  Phone, 
  MessageCircle, 
  Mail, 
  ShieldCheck, 
  Tag, 
  Package, 
  Truck, 
  Calendar,
  CheckCircle2,
  Share2,
  ExternalLink,
  IndianRupee,
  Clock,
  Star,
  QrCode,
  Download
} from 'lucide-react';
import { type BusinessProfile, type Review } from '../db';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { QRCodeCanvas } from 'qrcode.react';
import { formatPhone } from '../lib/utils';
import { getSupplierReviews } from '../lib/firestore';
import { auth } from '../lib/firebase';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface BusinessProfileViewProps {
  profile: BusinessProfile;
  isOwner?: boolean;
  onEdit?: () => void;
  replyPercentage?: number;
  avgReplyTime?: string;
}

const TrustBadge = ({ level, type }: { level?: string, type?: 'top-rated' | 'fast-responder' }) => {
  if (type === 'top-rated') {
    return (
      <span className="px-2 py-1 bg-amber-50 text-amber-700 text-[10px] font-bold rounded-full flex items-center gap-1 border border-amber-100 shadow-sm">
        <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
        TOP RATED
      </span>
    );
  }
  if (type === 'fast-responder') {
    return (
      <span className="px-2 py-1 bg-blue-50 text-blue-700 text-[10px] font-bold rounded-full flex items-center gap-1 border border-blue-100 shadow-sm">
        <Clock className="h-3 w-3" />
        FAST RESPONDER
      </span>
    );
  }
  
  const config = {
    premium: { bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-100', label: 'PREMIUM', icon: ShieldCheck },
    gst_verified: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-100', label: 'GST VERIFIED', icon: ShieldCheck },
    basic: { bg: 'bg-gray-50', text: 'text-gray-700', border: 'border-gray-100', label: 'BASIC', icon: CheckCircle2 },
  }[level as 'premium' | 'gst_verified' | 'basic'] || { bg: 'bg-gray-50', text: 'text-gray-700', border: 'border-gray-100', label: 'BASIC', icon: CheckCircle2 };

  const Icon = config.icon;

  return (
    <span className={cn("px-2 py-1 text-[10px] font-bold rounded-full flex items-center gap-1 border shadow-sm", config.bg, config.text, config.border)}>
      <Icon className="h-3 w-3" />
      {config.label}
    </span>
  );
};

export default function BusinessProfileView({ profile, isOwner, onEdit, replyPercentage, avgReplyTime }: BusinessProfileViewProps) {
  const qrRef = useRef<HTMLDivElement>(null);
  const [reviews, setReviews] = React.useState<Review[]>([]);
  const [loadingReviews, setLoadingReviews] = React.useState(false);

  React.useEffect(() => {
    if (profile.userId) {
      setLoadingReviews(true);
      getSupplierReviews(profile.userId)
        .then(setReviews)
        .finally(() => setLoadingReviews(false));
    }
  }, [profile.userId]);

  const handleWhatsApp = () => {
    const message = encodeURIComponent(`Hello ${profile.businessName}, I saw your profile on the B2B Marketplace and I'm interested in your products.`);
    window.open(`https://wa.me/${profile.whatsapp}?text=${message}`, '_blank');
  };

  const profileUrl = `${window.location.origin}${window.location.pathname}?sellerId=${profile.userId}`;

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({
        title: profile.businessName,
        text: `Check out ${profile.businessName} on our B2B Network!`,
        url: profileUrl
      });
    } else {
      // Fallback: Copy to clipboard
      navigator.clipboard.writeText(profileUrl);
      alert('Profile link copied to clipboard!');
    }
  };

  const downloadQRCode = () => {
    const canvas = qrRef.current?.querySelector('canvas');
    if (canvas) {
      const url = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.download = `${profile.businessName.replace(/\s+/g, '_')}_QR.png`;
      link.href = url;
      link.click();
    }
  };

  const memberSince = new Date(profile.createdAt).toLocaleDateString('en-IN', {
    month: 'long',
    year: 'numeric'
  });

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Hero Section */}
      <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="h-32 bg-gradient-to-r from-indigo-600 to-violet-600 relative">
          {isOwner && (
            <button 
              onClick={onEdit}
              className="absolute top-4 right-4 px-4 py-2 bg-white/20 backdrop-blur-md text-white rounded-xl text-sm font-bold hover:bg-white/30 transition-colors border border-white/30"
            >
              Edit Profile
            </button>
          )}
        </div>
        <div className="px-8 pb-8">
          <div className="relative -mt-12 flex flex-col md:flex-row md:items-end gap-6">
            <div className="w-32 h-32 bg-white rounded-3xl p-1 shadow-xl ring-4 ring-white shrink-0">
              <div className="w-full h-full bg-gray-50 rounded-2xl flex items-center justify-center overflow-hidden">
                {profile.logoUrl ? (
                  <img src={profile.logoUrl} alt={profile.businessName} className="w-full h-full object-cover" />
                ) : (
                  <Building2 className="w-12 h-12 text-gray-300" />
                )}
              </div>
            </div>
            <div className="flex-1 space-y-2">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-3xl font-black text-gray-900 tracking-tight">{profile.businessName}</h1>
                <div className="flex flex-wrap gap-2">
                  <TrustBadge level={profile.verificationLevel || (profile.gstNumber ? 'gst_verified' : 'basic')} />
                  {profile.isTopRated && <TrustBadge type="top-rated" />}
                  {profile.isFastResponder && <TrustBadge type="fast-responder" />}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-4 text-gray-500 text-sm font-medium">
                <div className="flex items-center gap-1.5">
                  <MapPin className="w-4 h-4" />
                  {profile.city}, {profile.state}
                </div>
                <div className="flex items-center gap-1.5">
                  <Calendar className="w-4 h-4" />
                  Member since {memberSince}
                </div>
                {profile.rating && profile.rating > 0 && (
                  <div className="flex items-center gap-1.5 bg-yellow-50 px-2 py-0.5 rounded-lg border border-yellow-100">
                    <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />
                    <span className="text-yellow-700 font-bold">{profile.rating.toFixed(1)}</span>
                    <span className="text-yellow-600/60 text-xs">({profile.totalRatings} reviews)</span>
                  </div>
                )}
              </div>
            </div>
            <div className="flex gap-3">
              <button 
                onClick={handleShare}
                className="p-3 bg-gray-50 text-gray-600 rounded-2xl hover:bg-gray-100 transition-colors border border-gray-200"
              >
                <Share2 className="w-5 h-5" />
              </button>
              <button 
                onClick={handleWhatsApp}
                className="flex items-center gap-2 bg-emerald-600 text-white px-6 py-3 rounded-2xl font-bold hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100"
              >
                <MessageCircle className="w-5 h-5" />
                WhatsApp
              </button>
              <button 
                onClick={() => {/* Inquiry logic here */}}
                className="flex items-center gap-2 bg-indigo-600 text-white px-6 py-3 rounded-2xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100"
              >
                <Package className="w-5 h-5" />
                Inquiry
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Details */}
        <div className="lg:col-span-2 space-y-6">
          {/* About Section */}
          <div className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100 space-y-4">
            <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <Tag className="w-5 h-5 text-indigo-600" />
              About Business
            </h3>
            <p className="text-gray-600 leading-relaxed font-medium">
              {profile.description}
            </p>
            <div className="flex flex-wrap gap-2 pt-2">
              {profile.categories.map(cat => (
                <span key={cat} className="px-4 py-1.5 bg-indigo-50 text-indigo-700 rounded-full text-xs font-bold border border-indigo-100">
                  {cat}
                </span>
              ))}
            </div>
          </div>

          {/* Trust Indicators */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 flex items-center gap-4">
              <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <div className="text-2xl font-black text-gray-900">{profile.totalOrdersCompleted}+</div>
                <div className="text-xs font-bold text-gray-400 uppercase tracking-wider">Orders Completed</div>
              </div>
            </div>
            <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 flex items-center gap-4">
              <div className="w-12 h-12 bg-amber-50 rounded-2xl flex items-center justify-center text-amber-600">
                <Clock className="w-6 h-6" />
              </div>
              <div>
                <div className="text-2xl font-black text-gray-900">{replyPercentage !== undefined ? `${replyPercentage.toFixed(0)}%` : 'N/A'}</div>
                <div className="text-xs font-bold text-gray-400 uppercase tracking-wider">Reply Rate ({avgReplyTime || 'N/A'})</div>
              </div>
            </div>
          </div>

          {/* Contact Info */}
          <div className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100 space-y-6">
            <h3 className="text-lg font-bold text-gray-900">Contact Details</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-gray-50 rounded-xl flex items-center justify-center text-gray-400">
                  <Phone className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-xs font-bold text-gray-400 uppercase">Mobile</div>
                  <div className="text-gray-900 font-bold">{formatPhone(profile.mobile)}</div>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-gray-50 rounded-xl flex items-center justify-center text-gray-400">
                  <MessageCircle className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-xs font-bold text-gray-400 uppercase">WhatsApp</div>
                  <div className="text-gray-900 font-bold">{formatPhone(profile.whatsapp)}</div>
                </div>
              </div>
              {profile.email && (
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-gray-50 rounded-xl flex items-center justify-center text-gray-400">
                    <Mail className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-gray-400 uppercase">Email</div>
                    <div className="text-gray-900 font-bold">{profile.email}</div>
                  </div>
                </div>
              )}
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-gray-50 rounded-xl flex items-center justify-center text-gray-400">
                  <MapPin className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-xs font-bold text-gray-400 uppercase">Location</div>
                  <div className="text-gray-900 font-bold">{profile.city}, {profile.state}</div>
                </div>
              </div>
            </div>
            {profile.address && (
              <div className="pt-4 border-t">
                <div className="text-xs font-bold text-gray-400 uppercase mb-1">Full Address</div>
                <p className="text-gray-700 font-medium">{profile.address}</p>
              </div>
            )}
          </div>

          {/* Reviews Section */}
          <div className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100 space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <Star className="w-5 h-5 text-yellow-400 fill-yellow-400" />
                Buyer Reviews
              </h3>
              <span className="text-sm text-gray-500 font-medium">{reviews.length} reviews</span>
            </div>

            <div className="space-y-6">
              {loadingReviews ? (
                <div className="py-8 text-center text-gray-400">Loading reviews...</div>
              ) : reviews.length === 0 ? (
                <div className="py-8 text-center text-gray-400 italic bg-gray-50 rounded-2xl border-2 border-dashed">
                  No reviews yet for this supplier.
                </div>
              ) : (
                reviews.map((review) => (
                  <div key={review.id} className="space-y-2 pb-6 border-b last:border-0 last:pb-0">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-indigo-50 rounded-full flex items-center justify-center text-indigo-600 font-bold text-xs">
                          {review.buyerName.charAt(0)}
                        </div>
                        <div>
                          <p className="text-sm font-bold text-gray-900">{review.buyerName}</p>
                          <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">
                            {new Date(review.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center">
                        {[1, 2, 3, 4, 5].map((s) => (
                          <Star
                            key={s}
                            className={cn(
                              "w-3 h-3",
                              s <= review.rating ? "text-yellow-400 fill-yellow-400" : "text-gray-200"
                            )}
                          />
                        ))}
                      </div>
                    </div>
                    <p className="text-sm text-gray-600 leading-relaxed italic">"{review.comment}"</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Selling Settings */}
        <div className="space-y-6">
          <div className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100 space-y-6">
            <h3 className="text-lg font-bold text-gray-900">Selling Terms</h3>
            
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl">
                <div className="flex items-center gap-3">
                  <IndianRupee className="w-5 h-5 text-indigo-600" />
                  <span className="text-sm font-bold text-gray-700">Pricing</span>
                </div>
                <span className={cn(
                  "text-xs font-black uppercase px-2 py-1 rounded-lg",
                  profile.pricingType === 'show' ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                )}>
                  {profile.pricingType === 'show' ? 'Visible' : 'On Request'}
                </span>
              </div>

              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl">
                <div className="flex items-center gap-3">
                  <Package className="w-5 h-5 text-indigo-600" />
                  <span className="text-sm font-bold text-gray-700">Min. Order</span>
                </div>
                <span className="text-sm font-black text-gray-900">{profile.moq} Units</span>
              </div>

              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl">
                <div className="flex items-center gap-3">
                  <Truck className="w-5 h-5 text-indigo-600" />
                  <span className="text-sm font-bold text-gray-700">Delivery</span>
                </div>
                <span className="text-xs font-black text-gray-900 uppercase">
                  {profile.deliveryType}
                </span>
              </div>
            </div>

            <div className="p-4 bg-indigo-50 rounded-2xl border border-indigo-100">
              <div className="flex items-start gap-3">
                <ShieldCheck className="w-5 h-5 text-indigo-600 shrink-0" />
                <div>
                  <p className="text-sm font-bold text-indigo-900">Verified Supplier</p>
                  <p className="text-xs text-indigo-700 mt-1">This business has a verified GSTIN and a history of successful B2B orders.</p>
                </div>
              </div>
            </div>
          </div>

          {/* QR Code Section */}
          <div className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <QrCode className="w-5 h-5 text-indigo-600" />
                Business QR
              </h3>
              <button 
                onClick={downloadQRCode}
                className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                title="Download QR Code"
              >
                <Download className="w-5 h-5" />
              </button>
            </div>
            <div ref={qrRef} className="flex flex-col items-center justify-center p-6 bg-gray-50 rounded-2xl border-2 border-dashed border-gray-200">
              <QRCodeCanvas 
                value={profileUrl}
                size={160}
                level="H"
                includeMargin={true}
                className="rounded-xl shadow-sm"
              />
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-4 text-center">
                Scan to view profile
              </p>
            </div>
            <p className="text-xs text-gray-500 text-center leading-relaxed">
              Share this QR code with your buyers to give them direct access to your B2B profile and catalog.
            </p>
          </div>

          {isOwner && (
            <div className="bg-gradient-to-br from-indigo-600 to-violet-700 p-8 rounded-3xl shadow-xl text-white space-y-4">
              <h3 className="text-lg font-bold">Grow Your Business</h3>
              <p className="text-white/80 text-sm leading-relaxed">
                Complete your profile to 100% to appear higher in search results and build more trust with potential buyers.
              </p>
              <button 
                onClick={onEdit}
                className="w-full py-3 bg-white text-indigo-600 rounded-2xl font-bold hover:bg-indigo-50 transition-colors shadow-lg"
              >
                Improve Profile
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
