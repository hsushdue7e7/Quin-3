import React, { useState, useEffect } from 'react';
import { 
  Building2,
  ShoppingCart,
  Users, 
  Search, 
  UserPlus, 
  Check, 
  X, 
  ShoppingBag, 
  History, 
  ArrowRight, 
  Store,
  Clock,
  Package,
  AlertCircle,
  TrendingUp,
  ShieldCheck,
  MessageSquare,
  MessageCircle,
  MapPin,
  Tag,
  Star,
  Info,
  Send,
  Plus,
  Trash2,
  Edit2,
  Filter,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  Image as ImageIcon,
  User as UserIcon,
  Phone,
  Trophy,
  CheckCircle2,
} from 'lucide-react';
import { auth } from '../lib/firebase';
import { 
  getConnections, 
  searchBusiness, 
  sendConnectionRequest, 
  updateConnectionStatus, 
  getProfile,
  getSellerProducts,
  placeB2BOrder,
  getB2BOrders,
  updateB2BOrderStatus,
  discoverBusinesses,
  discoverB2BProfiles,
  sendInquiry,
  markInquiryAsViewed,
  subscribeToInquiries,
  updateInquiryStatus,
  addInquiryMessage,
  getBusinessProfile,
  discoverProducts,
  saveInventoryProduct,
  getPopularSearches,
  getSearchSuggestions,
  trackSearchQuery,
  submitInquiryQuote,
  updateQuoteStatus,
  createOrderFromInquiry,
  updateConversionStats
} from '../lib/firestore';
import { createNotification } from '../services/NotificationService';
import { collection, query, where, getDocs, doc, getDoc, updateDoc, increment } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { type Connection, type User, type Profile, type Product, type B2BOrder, type InvoiceItem, type Inquiry, type BusinessProfile, type Review, type PopularSearch } from '../db';
import { clsx, type ClassValue } from 'clsx';
import { Receipt } from 'lucide-react';
import { twMerge } from 'tailwind-merge';
import BusinessProfileView from './BusinessProfileView';
import BusinessProfileForm from './BusinessProfileForm';
import SellerProducts from './SellerProducts';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
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
    basic: { bg: 'bg-gray-50', text: 'text-gray-700', border: 'border-gray-100', label: 'BASIC', icon: Check },
  }[level as 'premium' | 'gst_verified' | 'basic'] || { bg: 'bg-gray-50', text: 'text-gray-700', border: 'border-gray-100', label: 'BASIC', icon: Check };

  const Icon = config.icon;

  return (
    <span className={cn("px-2 py-1 text-[10px] font-bold rounded-full flex items-center gap-1 border shadow-sm", config.bg, config.text, config.border)}>
      <Icon className="h-3 w-3" />
      {config.label}
    </span>
  );
};

const RatingStars = ({ rating, total }: { rating: number, total: number }) => {
  return (
    <div className="flex items-center gap-1">
      <div className="flex items-center">
        {[1, 2, 3, 4, 5].map((s) => (
          <Star
            key={s}
            className={cn(
              "w-3 h-3",
              s <= Math.round(rating) ? "text-yellow-400 fill-yellow-400" : "text-gray-200"
            )}
          />
        ))}
      </div>
      <span className="text-xs font-bold text-gray-700">{rating.toFixed(1)}</span>
      <span className="text-[10px] text-gray-400">({total})</span>
    </div>
  );
};

interface B2BNetworkProps {
  ownerId: string;
  onGenerateInvoice?: (items: InvoiceItem[]) => void;
}

export default function B2BNetwork({ ownerId, onGenerateInvoice }: B2BNetworkProps) {
  const [activeTab, setActiveTab] = useState<'discover' | 'orders' | 'seller-dashboard' | 'seller-profile' | 'seller-products' | 'product-detail' | 'suppliers' | 'connections'>('discover');
  const [connections, setConnections] = useState<Connection[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [discoveryResults, setDiscoveryResults] = useState<BusinessProfile[]>([]);
  const [productDiscoveryResults, setProductDiscoveryResults] = useState<(Product & { businessName?: string, city?: string, state?: string })[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<(Product & { businessName?: string, city?: string, state?: string }) | null>(null);
  const [popularSearches, setPopularSearches] = useState<PopularSearch[]>([]);
  const [searchSuggestions, setSearchSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState<BusinessProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [myProfile, setMyProfile] = useState<Profile | null>(null);
  const [myBusinessProfile, setMyBusinessProfile] = useState<BusinessProfile | null>(null);
  const [myProducts, setMyProducts] = useState<Product[]>([]);
  const [selectedSeller, setSelectedSeller] = useState<string | null>(null);
  const [sellerProfile, setSellerProfile] = useState<BusinessProfile | null>(null);
  const [sellerProducts, setSellerProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<{ [productId: string]: number }>({});
  const [orders, setOrders] = useState<B2BOrder[]>([]);
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [competitionInquiries, setCompetitionInquiries] = useState<{ [competitionId: string]: Inquiry[] }>({});
  const [orderRole, setOrderRole] = useState<'buyer' | 'seller'>('buyer');
  const [showInquiryModal, setShowInquiryModal] = useState<{ product: Product | null, sellerId: string } | null>(null);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [inquiryMessage, setInquiryMessage] = useState('');
  const [inquiryQty, setInquiryQty] = useState(1);
  const [inquiryBuyerName, setInquiryBuyerName] = useState('');
  const [inquiryBuyerPhone, setInquiryBuyerPhone] = useState('');
  const [sendToMultiple, setSendToMultiple] = useState(true);
  const [replyingToInquiry, setReplyingToInquiry] = useState<string | null>(null);
  const [replyMessageText, setReplyMessageText] = useState('');
  const [replyPriceQuote, setReplyPriceQuote] = useState<string>('');
  const [replyQuoteQty, setReplyQuoteQty] = useState<string>('');
  const [replyQuoteDeliveryTime, setReplyQuoteDeliveryTime] = useState<string>('');
  const [showFilters, setShowFilters] = useState(false);
  const [filterCategory, setFilterCategory] = useState('');
  const [b2bCategories, setB2bCategories] = useState<string[]>([]);

  useEffect(() => {
    const fetchB2bCategories = async () => {
      try {
        const catSnapshot = await getDocs(collection(db, 'categories'));
        const names = catSnapshot.docs.map(doc => doc.data().name as string).filter(Boolean);
        const uniqueNames = Array.from(new Set(names)).sort((a, b) => a.localeCompare(b));
        setB2bCategories(uniqueNames);
      } catch (err) {
        console.error('Error fetching B2B categories', err);
      }
    };
    fetchB2bCategories();
  }, []);
  const [filterMinPrice, setFilterMinPrice] = useState('');
  const [filterMaxPrice, setFilterMaxPrice] = useState('');
  const [filterLocation, setFilterLocation] = useState('');
  const [filterMinRating, setFilterMinRating] = useState(0);
  const [filterVerifiedOnly, setFilterVerifiedOnly] = useState(false);
  const [showReviewModal, setShowReviewModal] = useState<{ sellerId: string, sellerName: string } | null>(null);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState('');

  const userId = ownerId;

  useEffect(() => {
    if (userId) {
      loadData();
      getPopularSearches(6).then(setPopularSearches);
    }
  }, [userId]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchQuery.length >= 2) {
        getSearchSuggestions(searchQuery).then(setSearchSuggestions);
      } else {
        setSearchSuggestions([]);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const loadData = async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const [conns, profile, b2bOrders, discovery, myBizProfile, myProds, prodDiscovery] = await Promise.all([
        getConnections(userId),
        getProfile(userId),
        getB2BOrders(userId, orderRole),
        discoverB2BProfiles(),
        getBusinessProfile(userId),
        getSellerProducts(userId),
        discoverProducts()
      ]);
      setConnections(conns);
      setMyProfile(profile);
      setMyBusinessProfile(myBizProfile);
      setOrders(b2bOrders);
      setMyProducts(myProds);
      setDiscoveryResults(discovery.filter(p => p.userId !== userId));
      setProductDiscoveryResults(prodDiscovery.filter(p => p.userId !== userId));
    } catch (error) {
      console.error('Error loading B2B data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleReviewSubmit = async () => {
    if (!userId || !myProfile || !showReviewModal) return;
    if (!reviewComment.trim()) {
      alert('Please enter a comment');
      return;
    }

    setLoading(true);
    try {
      const review: Omit<Review, 'id'> = {
        sellerId: showReviewModal.sellerId,
        buyerId: userId,
        buyerName: myBusinessProfile?.businessName || myProfile.businessName || 'Anonymous Buyer',
        buyerBusinessName: myBusinessProfile?.businessName || myProfile.businessName || 'Anonymous Business',
        rating: reviewRating,
        comment: reviewComment,
        createdAt: Date.now()
      };

      const { addSupplierReview } = await import('../lib/firestore');
      await addSupplierReview(review);
      
      setShowReviewModal(null);
      setReviewRating(5);
      setReviewComment('');
      alert('Thank you for your review!');
      loadData();
    } catch (error) {
      console.error('Error submitting review:', error);
      alert('Failed to submit review. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (userId) {
      Promise.all([
        getB2BOrders(userId, orderRole)
      ]).then(([newOrders]) => {
        setOrders(newOrders);
      });
      
      const unsubscribe = subscribeToInquiries(userId, orderRole, async (newInquiries) => {
        setInquiries(newInquiries);
        
        // If buyer, fetch competition inquiries for grouped view
        if (orderRole === 'buyer') {
          const { getCompetitionInquiries } = await import('../lib/firestore');
          const competitionData: { [id: string]: Inquiry[] } = {};
          
          for (const inquiry of newInquiries) {
            if (inquiry.competitionId && !competitionData[inquiry.competitionId]) {
              try {
                const related = await getCompetitionInquiries(inquiry.competitionId);
                competitionData[inquiry.competitionId] = related;
              } catch (err) {
                console.error('Error fetching competition inquiries:', err);
              }
            }
          }
          setCompetitionInquiries(competitionData);
        }
      });
      
      return () => unsubscribe();
    }
  }, [orderRole, userId]);

  const renderInquiry = (inquiry: Inquiry) => (
    <div key={inquiry.id} className="p-4 hover:bg-gray-50 transition-colors border-b last:border-0">
      <div className="flex justify-between items-start mb-2">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className={cn(
              "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider inline-block",
              inquiry.status === 'new' ? "bg-blue-100 text-blue-700" :
              inquiry.status === 'viewed' ? "bg-indigo-100 text-indigo-700" :
              inquiry.status === 'responded' ? "bg-green-100 text-green-700" :
              inquiry.status === 'closed' ? "bg-gray-100 text-gray-700" :
              "bg-gray-100 text-gray-700"
            )}>
              {inquiry.status}
            </span>
            {inquiry.quoteStatus && (
              <span className={cn(
                "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider inline-block",
                inquiry.quoteStatus === 'pending' ? "bg-orange-100 text-orange-700" :
                inquiry.quoteStatus === 'accepted' ? "bg-green-100 text-green-700" :
                inquiry.quoteStatus === 'rejected' ? "bg-red-100 text-red-700" :
                inquiry.quoteStatus === 'negotiating' ? "bg-blue-100 text-blue-700" :
                "bg-gray-100 text-gray-700"
              )}>
                Quote: {inquiry.quoteStatus}
              </span>
            )}
          </div>
          <h3 className="font-medium text-gray-900">{inquiry.productName}</h3>
          <p className="text-sm text-gray-500">
            {orderRole === 'buyer' ? `To: ${inquiry.sellerBusinessName}` : `From: ${inquiry.buyerBusinessName}`}
          </p>
        </div>
        <div className="text-right">
          <p className="font-semibold text-indigo-600">Qty: {inquiry.quantity}</p>
          <p className="text-xs text-gray-400">{new Date(inquiry.createdAt).toLocaleString()}</p>
        </div>
      </div>
      
      <div 
        className="bg-gray-100 p-3 rounded-lg mt-2 cursor-pointer hover:bg-gray-200 transition-colors"
        onClick={() => {
          if (orderRole === 'seller' && inquiry.status === 'new') {
            markInquiryAsViewed(inquiry.id!);
          }
        }}
      >
        <div className="flex justify-between items-start mb-1">
          <p className="text-xs font-semibold text-gray-800">{inquiry.buyerBusinessName}:</p>
          {inquiry.buyerName && (
            <div className="flex items-center gap-3 text-[10px] text-gray-500">
              <span className="flex items-center gap-1"><UserIcon className="w-3 h-3" /> {inquiry.buyerName}</span>
              <span className="flex items-center gap-1"><Phone className="w-3 h-3" /> {inquiry.buyerPhone}</span>
            </div>
          )}
        </div>
        <p className="text-sm text-gray-700 italic">"{inquiry.message}"</p>
      </div>

      {inquiry.priceQuote && (
        <div className="bg-green-50 p-4 rounded-lg mt-3 border border-green-100">
          <div className="flex items-center gap-2 mb-2">
            <Tag className="w-4 h-4 text-green-600" />
            <h4 className="text-sm font-bold text-green-800 uppercase tracking-wider">Price Quote Received</h4>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="text-[10px] text-green-600 uppercase font-bold">Price per Unit</p>
              <p className="text-lg font-bold text-green-900">₹{inquiry.priceQuote.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-[10px] text-green-600 uppercase font-bold">Quantity</p>
              <p className="text-lg font-bold text-green-900">{inquiry.quoteQuantity || inquiry.quantity}</p>
            </div>
            <div>
              <p className="text-[10px] text-green-600 uppercase font-bold">Delivery Time</p>
              <p className="text-sm font-bold text-green-900">{inquiry.deliveryTime || 'Not specified'}</p>
            </div>
          </div>
          <div className="mt-2 pt-2 border-t border-green-100">
            <p className="text-xs text-green-700 font-bold">Total Quote: ₹{((inquiry.priceQuote || 0) * (inquiry.quoteQuantity || inquiry.quantity)).toFixed(2)}</p>
          </div>

          {orderRole === 'buyer' && inquiry.quoteStatus === 'pending' && (
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => handleQuoteAction(inquiry, 'accepted')}
                className="flex-1 bg-green-600 text-white py-2 rounded-lg text-sm font-bold hover:bg-green-700 transition-colors flex items-center justify-center gap-2"
              >
                <CheckCircle2 className="w-4 h-4" />
                Accept Quote
              </button>
              <button
                onClick={() => setReplyingToInquiry(inquiry.id!)}
                className="flex-1 bg-white border border-blue-200 text-blue-600 py-2 rounded-lg text-sm font-bold hover:bg-blue-50 transition-colors flex items-center justify-center gap-2"
              >
                <MessageCircle className="w-4 h-4" />
                Negotiate
              </button>
              <button
                onClick={() => handleQuoteAction(inquiry, 'rejected')}
                className="px-4 bg-white border border-red-200 text-red-600 py-2 rounded-lg text-sm font-bold hover:bg-red-50 transition-colors"
              >
                Reject
              </button>
            </div>
          )}
        </div>
      )}
      
      {inquiry.messages && inquiry.messages.length > 0 && (
        <div className="mt-4 space-y-2 pl-4 border-l-2 border-gray-200">
          {inquiry.messages.map((msg) => (
            <div key={msg.id} className={cn(
              "p-3 rounded-lg",
              msg.senderId === userId ? "bg-indigo-50 border border-indigo-100 ml-8" : "bg-gray-50 border border-gray-100 mr-8"
            )}>
              <div className="flex justify-between items-center mb-1">
                <p className="text-xs font-semibold text-gray-800">{msg.senderName}</p>
                <p className="text-[10px] text-gray-500">{new Date(msg.timestamp).toLocaleString()}</p>
              </div>
              <p className="text-sm text-gray-700">{msg.text}</p>
            </div>
          ))}
        </div>
      )}

      {inquiry.status !== 'closed' && (
        <div className="mt-4">
          {replyingToInquiry === inquiry.id ? (
            <div className="space-y-4 bg-gray-50 p-4 rounded-xl border border-gray-200">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-bold text-gray-700 uppercase tracking-wider">
                  {orderRole === 'seller' ? 'Send Quote / Message' : 'Send Message'}
                </h4>
                <button 
                  onClick={() => {
                    setReplyingToInquiry(null);
                    setReplyMessageText('');
                    setReplyPriceQuote('');
                    setReplyQuoteQty('');
                    setReplyQuoteDeliveryTime('');
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <textarea
                className="w-full p-3 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                rows={3}
                placeholder={orderRole === 'seller' ? "Add a message with your quote..." : "Type your message..."}
                value={replyMessageText}
                onChange={(e) => setReplyMessageText(e.target.value)}
              />

              {orderRole === 'seller' && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Price per Unit (₹)</label>
                    <input 
                      type="number"
                      className="w-full p-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                      placeholder="e.g. 500"
                      value={replyPriceQuote}
                      onChange={(e) => setReplyPriceQuote(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Quantity</label>
                    <input 
                      type="number"
                      className="w-full p-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                      placeholder="e.g. 100"
                      value={replyQuoteQty}
                      onChange={(e) => setReplyQuoteQty(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Delivery Time</label>
                    <input 
                      type="text"
                      className="w-full p-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                      placeholder="e.g. 3-5 days"
                      value={replyQuoteDeliveryTime}
                      onChange={(e) => setReplyQuoteDeliveryTime(e.target.value)}
                    />
                  </div>
                </div>
              )}

              <div className="flex gap-2 justify-end pt-2">
                <button 
                  onClick={() => {
                    if (replyMessageText.trim()) {
                      const quote = replyPriceQuote ? parseFloat(replyPriceQuote) : undefined;
                      const qty = replyQuoteQty ? parseInt(replyQuoteQty) : undefined;
                      handleSendMessage(inquiry.id!, replyMessageText, quote, qty, replyQuoteDeliveryTime);
                      setReplyingToInquiry(null);
                      setReplyMessageText('');
                      setReplyPriceQuote('');
                      setReplyQuoteQty('');
                      setReplyQuoteDeliveryTime('');
                    }
                  }}
                  className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-bold text-sm flex items-center gap-2"
                >
                  <Send className="w-4 h-4" />
                  {orderRole === 'seller' && replyPriceQuote ? 'Submit Quote' : 'Send Message'}
                </button>
              </div>
            </div>
          ) : (
            <button 
              onClick={() => {
                setReplyingToInquiry(inquiry.id!);
                if (inquiry.priceQuote) {
                  setReplyPriceQuote(inquiry.priceQuote.toString());
                  setReplyQuoteQty((inquiry.quoteQuantity || inquiry.quantity).toString());
                  setReplyQuoteDeliveryTime(inquiry.deliveryTime || '');
                }
              }}
              className="text-sm text-indigo-600 font-bold hover:underline flex items-center gap-1"
            >
              <MessageSquare className="w-4 h-4" />
              {inquiry.priceQuote ? 'Negotiate / Reply' : 'Reply to Inquiry'}
            </button>
          )}
        </div>
      )}
    </div>
  );

  const handleDiscoverySearch = async () => {
    setLoading(true);
    setShowSuggestions(false);
    try {
      const minPrice = filterMinPrice ? parseFloat(filterMinPrice) : undefined;
      const maxPrice = filterMaxPrice ? parseFloat(filterMaxPrice) : undefined;

      const [bizResults, prodResults] = await Promise.all([
        discoverB2BProfiles(searchQuery, filterCategory, filterLocation, filterMinRating, filterVerifiedOnly),
        discoverProducts(searchQuery, filterCategory, minPrice, maxPrice, filterLocation, filterMinRating, filterVerifiedOnly)
      ]);
      setDiscoveryResults(bizResults.filter(p => p.userId !== userId));
      setProductDiscoveryResults(prodResults.filter(p => p.userId !== userId));
      
      if (searchQuery) {
        trackSearchQuery(searchQuery);
        getPopularSearches(6).then(setPopularSearches);
      }
    } catch (error) {
      console.error('Discovery search error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSearchInputChange = async (query: string) => {
    setSearchQuery(query);
    if (query.length < 2) {
      setSearchSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    setShowSuggestions(true);
  };

  const viewSellerProfile = async (sellerId: string) => {
    setSelectedSeller(sellerId);
    setLoading(true);
    try {
      const [profile, products] = await Promise.all([
        getBusinessProfile(sellerId),
        getSellerProducts(sellerId)
      ]);
      setSellerProfile(profile);
      setSellerProducts(products);
      setActiveTab('suppliers');
    } catch (error) {
      console.error('Error loading seller profile:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (userId) {
      // Handle deep linking to seller profile
      const params = new URLSearchParams(window.location.search);
      const sellerId = params.get('sellerId');
      if (sellerId) {
        viewSellerProfile(sellerId);
        // Clean up the URL
        window.history.replaceState({}, '', window.location.pathname);
      }
    }
  }, [userId]);

  const handleSendInquiry = async () => {
    if (!userId || !myProfile || !showInquiryModal || !showInquiryModal.product) return;
    if (!inquiryBuyerName.trim() || !inquiryBuyerPhone.trim()) {
      alert('Please enter your name and mobile number');
      return;
    }
    if (!inquiryMessage.trim()) {
      alert('Please enter a message');
      return;
    }

    // Basic mobile validation
    if (!/^\d{10}$/.test(inquiryBuyerPhone.replace(/\D/g, '').slice(-10))) {
      alert('Please enter a valid 10-digit mobile number');
      return;
    }

    setLoading(true);
    try {
      const sellersToInquire = [showInquiryModal.sellerId];
      
      if (sendToMultiple) {
        // Find similar suppliers (same category)
        const similarSuppliers = productDiscoveryResults
          .filter(p => p.category === showInquiryModal.product.category && p.userId !== userId && p.userId !== showInquiryModal.sellerId)
          .map(p => p.userId);
        
        // Limit to 3 additional suppliers
        const uniqueSimilar = [...new Set(similarSuppliers)].slice(0, 3);
        sellersToInquire.push(...uniqueSimilar);
      }

      const inquiryBase = {
        buyerId: userId,
        productId: showInquiryModal.product.id!,
        productName: showInquiryModal.product.name,
        buyerName: inquiryBuyerName,
        buyerPhone: inquiryBuyerPhone,
        quantity: inquiryQty,
        message: inquiryMessage,
        status: 'new' as const,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        buyerBusinessName: myBusinessProfile?.businessName || myProfile.businessName,
      };

      await Promise.all(sellersToInquire.map(async (sellerId) => {
        // Get seller business name
        const sellerProfile = await getBusinessProfile(sellerId);
        const inquiry: Omit<Inquiry, 'id'> = {
          ...inquiryBase,
          sellerId,
          sellerBusinessName: sellerProfile?.businessName || 'Unknown Seller',
          messages: [{
            id: Date.now().toString(),
            senderId: userId,
            senderName: inquiryBuyerName,
            text: inquiryMessage,
            timestamp: Date.now()
          }]
        };
        const inquiryId = await sendInquiry(inquiry);
        
        // Create notification for seller
        await createNotification(
          sellerId,
          'New Inquiry Received',
          `You have a new inquiry for ${showInquiryModal.product.name} from ${inquiryBuyerName}.`,
          'inquiry',
          inquiryId
        );
        
        return inquiryId;
      }));

      setShowInquiryModal(null);
      setInquiryMessage('');
      setInquiryBuyerName('');
      setInquiryBuyerPhone('');
      setInquiryQty(1);
      await loadData();
      alert(`Inquiry sent to ${sellersToInquire.length} supplier(s)`);
    } catch (error) {
      console.error('Inquiry error:', error);
      alert('Failed to send inquiry. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateInquiryStatus = async (inquiryId: string, status: 'responded' | 'closed', replyMessage?: string) => {
    try {
      await updateInquiryStatus(inquiryId, status, replyMessage);
    } catch (error) {
      console.error('Inquiry update error:', error);
    }
  };

  const handleSendMessage = async (inquiryId: string, text: string, priceQuote?: number, quoteQty?: number, deliveryTime?: string) => {
    if (!userId || !myProfile || !text.trim()) return;
    try {
      const message = {
        id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
        senderId: userId,
        senderName: myBusinessProfile?.businessName || myProfile.ownerName,
        text: text.trim(),
        timestamp: Date.now()
      };

      if (orderRole === 'seller' && priceQuote && quoteQty && deliveryTime) {
        await submitInquiryQuote(inquiryId, { price: priceQuote, quantity: quoteQty, deliveryTime }, message);
        
        // Notify buyer about the quote
        const inquiry = inquiries.find(i => i.id === inquiryId);
        if (inquiry) {
          await createNotification(
            inquiry.buyerId,
            'Quote Received',
            `${myBusinessProfile?.businessName || myProfile.ownerName} sent a quote for ${inquiry.productName}.`,
            'inquiry',
            inquiryId
          );
        }
      } else {
        const newStatus = orderRole === 'buyer' ? 'new' : 'responded';
        await addInquiryMessage(inquiryId, message, newStatus as any, priceQuote);
        
        // Notify the other party about the message
        const inquiry = inquiries.find(i => i.id === inquiryId);
        if (inquiry) {
          const targetUserId = orderRole === 'buyer' ? inquiry.sellerId : inquiry.buyerId;
          await createNotification(
            targetUserId,
            'New Message',
            `You have a new message regarding ${inquiry.productName}.`,
            'inquiry',
            inquiryId
          );
        }
      }
      await loadData();
    } catch (error) {
      console.error('Send message error:', error);
    }
  };

  const handleQuoteAction = async (inquiry: Inquiry, action: 'accepted' | 'rejected' | 'negotiating') => {
    try {
      await updateQuoteStatus(inquiry.id!, action);
      
      // Notify seller about quote action
      await createNotification(
        inquiry.sellerId,
        `Quote ${action === 'accepted' ? 'Accepted' : action === 'rejected' ? 'Rejected' : 'Update'}`,
        `Your quote for ${inquiry.productName} was ${action}.`,
        'inquiry',
        inquiry.id
      );

      if (action === 'accepted') {
        const orderId = await createOrderFromInquiry(inquiry);
        
        // Notify seller about new order
        if (orderId) {
          await createNotification(
            inquiry.sellerId,
            'New Order Received',
            `You received a new order from ${inquiry.buyerBusinessName} for ${inquiry.productName}.`,
            'order',
            orderId
          );
        }
        
        alert('Order created successfully!');
      }
      loadData();
    } catch (error) {
      console.error('Quote action error:', error);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setLoading(true);
    try {
      const results = await searchBusiness(searchQuery);
      setSearchResults(results.filter(u => u.id !== userId));
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleConnectFromProfile = async (targetUserId: string) => {
    if (!userId || !myProfile) return;
    try {
      const targetProfile = await getProfile(targetUserId);
      if (!targetProfile) return;
      await sendConnectionRequest(userId, targetUserId, myProfile, targetProfile);
      await loadData();
      alert('Connection request sent!');
    } catch (error) {
      console.error('Connection error:', error);
    }
  };

  const isConnected = (targetUserId: string) => {
    return connections.some(c => 
      (c.fromUserId === targetUserId || c.toUserId === targetUserId) && 
      c.status === 'connected'
    );
  };

  const isPending = (targetUserId: string) => {
    return connections.some(c => 
      (c.fromUserId === targetUserId || c.toUserId === targetUserId) && 
      c.status === 'pending'
    );
  };

  const handleConnect = async (targetUser: User) => {
    if (!userId || !myProfile) return;
    try {
      const targetProfile = await getProfile(targetUser.id!);
      if (!targetProfile) return;
      
      await sendConnectionRequest(userId, targetUser.id!, myProfile, targetProfile);
      await loadData();
      setSearchResults([]);
      setSearchQuery('');
    } catch (error) {
      console.error('Connection error:', error);
    }
  };

  const handleStatusUpdate = async (connectionId: string, status: 'connected' | 'rejected') => {
    try {
      await updateConnectionStatus(connectionId, status);
      await loadData();
    } catch (error) {
      console.error('Status update error:', error);
    }
  };

  const viewSellerCatalog = async (sellerId: string) => {
    setSelectedSeller(sellerId);
    setLoading(true);
    try {
      const [profile, products] = await Promise.all([
        getBusinessProfile(sellerId),
        getSellerProducts(sellerId)
      ]);
      setSellerProfile(profile);
      setSellerProducts(products);
      setActiveTab('suppliers');
    } catch (error) {
      console.error('Error loading catalog:', error);
    } finally {
      setLoading(false);
    }
  };

  const addToCart = (productId: string, qty: number) => {
    setCart(prev => ({
      ...prev,
      [productId]: (prev[productId] || 0) + qty
    }));
  };

  const placeOrder = async () => {
    if (!userId || !selectedSeller || !myProfile) return;
    
    const sellerConn = connections.find(c => 
      (c.fromUserId === selectedSeller && c.toUserId === userId) ||
      (c.toUserId === selectedSeller && c.fromUserId === userId)
    );
    
    const sellerName = sellerConn?.fromUserId === selectedSeller ? sellerConn.fromBusinessName : sellerConn?.toBusinessName;

    const orderItems = sellerProducts
      .filter(p => cart[p.id!])
      .map(p => ({
        productId: p.id!,
        name: p.name,
        quantity: cart[p.id!],
        price: p.price,
        total: p.price * cart[p.id!],
        costPrice: p.costPrice
      }));

    const totalAmount = orderItems.reduce((sum, item) => sum + item.total, 0);

    const order: Omit<B2BOrder, 'id'> = {
      buyerId: userId,
      sellerId: selectedSeller,
      buyerBusinessName: myBusinessProfile?.businessName || myProfile.businessName,
      sellerBusinessName: sellerName || 'Unknown Seller',
      items: orderItems,
      status: 'pending',
      totalAmount,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    try {
      const orderId = await placeB2BOrder(order);
      
      // Notify seller about new order
      if (orderId) {
        await createNotification(
          selectedSeller,
          'New Order Received',
          `You received a new order from ${myBusinessProfile?.businessName || myProfile.businessName}.`,
          'order',
          orderId
        );
      }

      setCart({});
      setSelectedSeller(null);
      setActiveTab('orders');
      await loadData();
    } catch (error) {
      console.error('Order error:', error);
    }
  };

  const handleOrderUpdate = async (orderId: string, status: B2BOrder['status'], order: B2BOrder) => {
    try {
      await updateB2BOrderStatus(orderId, status);
      
      // Notify the other party about the order update
      const targetUserId = orderRole === 'buyer' ? order.sellerId : order.buyerId;
      await createNotification(
        targetUserId,
        'Order Status Updated',
        `Order status changed to ${status}.`,
        'order',
        orderId
      );
      
      // Inventory Integration
      if (status === 'confirmed' && orderRole === 'seller') {
        // Seller confirms: decrease stock
        for (const item of order.items) {
          try {
            const productRef = doc(db, 'products', item.productId);
            const productSnap = await getDoc(productRef);
            if (productSnap.exists()) {
              const productData = productSnap.data() as Product;
              if (productData.trackInventory) {
                await updateDoc(productRef, {
                  stock: (productData.stock || 0) - item.quantity,
                  updatedAt: Date.now()
                });
              }
            }
          } catch (err) {
            console.error('Error updating seller inventory:', err);
          }
        }
      } else if (status === 'delivered' && orderRole === 'buyer') {
        // Buyer confirms delivery: increase stock
        for (const item of order.items) {
          try {
            // Check if buyer already has this product by name
            const q = query(collection(db, 'products'), where('userId', '==', userId), where('name', '==', item.name));
            const snapshot = await getDocs(q);
            
            if (!snapshot.empty) {
              const existingDoc = snapshot.docs[0];
              const existingData = existingDoc.data() as Product;
              if (existingData.trackInventory) {
                await updateDoc(existingDoc.ref, {
                  stock: (existingData.stock || 0) + item.quantity,
                  updatedAt: Date.now()
                });
              }
            } else {
              // Add as new product if not exists
              await saveInventoryProduct({
                userId: userId!,
                name: item.name,
                type: 'product',
                sku: `B2B-${Date.now()}-${item.productId.substring(0, 4)}`,
                costPrice: item.price, // Buying price is cost price for buyer
                price: item.price * 1.2, // Default 20% markup
                stock: item.quantity,
                primaryUnit: 'Unit',
                category: 'B2B Purchases',
                minStock: 5,
                trackInventory: true,
                createdAt: Date.now(),
                updatedAt: Date.now()
              });
            }
          } catch (err) {
            console.error('Error updating buyer inventory:', err);
          }
        }
      }
      
      await loadData();
    } catch (error) {
      console.error('Order update error:', error);
    }
  };

  const pendingRequests = connections.filter(c => c.toUserId === userId && c.status === 'pending');
  const mySuppliers = connections.filter(c => c.status === 'connected');

  return (
    <div className="max-w-6xl mx-auto p-4 space-y-6">
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Users className="w-8 h-8 text-indigo-600" />
            B2B Network
          </h1>
          <div className="flex bg-gray-100 p-1 rounded-lg">
            <button
              onClick={() => {
                setOrderRole('buyer');
                if (!['discover', 'connections', 'suppliers', 'orders'].includes(activeTab)) {
                  setActiveTab('discover');
                }
              }}
              className={cn(
                "px-6 py-2 rounded-md text-sm font-medium transition-all",
                orderRole === 'buyer' ? "bg-white shadow-sm text-indigo-600" : "text-gray-600 hover:text-gray-900"
              )}
            >
              Buyer
            </button>
            <button
              onClick={() => {
                setOrderRole('seller');
                setActiveTab('seller-dashboard');
              }}
              className={cn(
                "px-6 py-2 rounded-md text-sm font-medium transition-all",
                orderRole === 'seller' ? "bg-white shadow-sm text-indigo-600" : "text-gray-600 hover:text-gray-900"
              )}
            >
              Seller
            </button>
          </div>
        </div>

        {orderRole === 'buyer' && (
          <div className="flex bg-gray-100 p-1 rounded-lg overflow-x-auto">
            <button
              onClick={() => setActiveTab('discover')}
              className={cn(
                "px-4 py-2 rounded-md text-sm font-medium transition-all whitespace-nowrap",
                activeTab === 'discover' ? "bg-white shadow-sm text-indigo-600" : "text-gray-600 hover:text-gray-900"
              )}
            >
              Discover
            </button>
            <button
              onClick={() => setActiveTab('orders')}
              className={cn(
                "px-4 py-2 rounded-md text-sm font-medium transition-all whitespace-nowrap",
                activeTab === 'orders' ? "bg-white shadow-sm text-indigo-600" : "text-gray-600 hover:text-gray-900"
              )}
            >
              Orders & Inquiries
            </button>
          </div>
        )}
        {orderRole === 'seller' && (
          <div className="flex bg-gray-100 p-1 rounded-lg overflow-x-auto">
            <button
              onClick={() => setActiveTab('seller-dashboard')}
              className={cn(
                "px-4 py-2 rounded-md text-sm font-medium transition-all whitespace-nowrap",
                activeTab === 'seller-dashboard' ? "bg-white shadow-sm text-indigo-600" : "text-gray-600 hover:text-gray-900"
              )}
            >
              Dashboard
            </button>
            <button
              onClick={() => setActiveTab('seller-profile')}
              className={cn(
                "px-4 py-2 rounded-md text-sm font-medium transition-all whitespace-nowrap",
                activeTab === 'seller-profile' ? "bg-white shadow-sm text-indigo-600" : "text-gray-600 hover:text-gray-900"
              )}
            >
              Business Profile
            </button>
            <button
              onClick={() => setActiveTab('seller-products')}
              className={cn(
                "px-4 py-2 rounded-md text-sm font-medium transition-all whitespace-nowrap",
                activeTab === 'seller-products' ? "bg-white shadow-sm text-indigo-600" : "text-gray-600 hover:text-gray-900"
              )}
            >
              Products Catalogue
            </button>
            <button
              onClick={() => setActiveTab('orders')}
              className={cn(
                "px-4 py-2 rounded-md text-sm font-medium transition-all whitespace-nowrap",
                activeTab === 'orders' ? "bg-white shadow-sm text-indigo-600" : "text-gray-600 hover:text-gray-900"
              )}
            >
              Orders & Inquiries
            </button>
          </div>
        )}
      </div>

      {orderRole === 'seller' && activeTab === 'seller-dashboard' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-green-50 rounded-lg">
                  <TrendingUp className="w-6 h-6 text-green-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">Total Sales</p>
                  <p className="text-2xl font-bold text-gray-900">
                    ₹{orders.filter(o => o.status === 'delivered').reduce((sum, o) => sum + o.totalAmount, 0).toFixed(2)}
                  </p>
                </div>
              </div>
            </div>
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-orange-50 rounded-lg">
                  <Clock className="w-6 h-6 text-orange-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">Pending Orders</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {orders.filter(o => o.status === 'pending').length}
                  </p>
                </div>
              </div>
            </div>
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-indigo-50 rounded-lg">
                  <Trophy className="w-6 h-6 text-indigo-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">Win Rate</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {myBusinessProfile?.inquiriesWon && myBusinessProfile?.competitionCount ? 
                      ((myBusinessProfile.inquiriesWon / myBusinessProfile.competitionCount) * 100).toFixed(1) + '%' : 
                      '0%'}
                  </p>
                  <p className="text-[10px] text-gray-400 mt-1">
                    {myBusinessProfile?.inquiriesWon || 0} wins / {myBusinessProfile?.competitionCount || 0} competitions
                  </p>
                </div>
              </div>
            </div>
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-blue-50 rounded-lg">
                  <CheckCircle2 className="w-6 h-6 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">Conversion</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {myBusinessProfile?.orderConversionRate ? 
                      (myBusinessProfile.orderConversionRate * 100).toFixed(1) + '%' : 
                      '0%'}
                  </p>
                  <p className="text-[10px] text-gray-400 mt-1">
                    Inquiry to Order rate
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-gray-900 flex items-center gap-2">
                  <ShoppingBag className="w-5 h-5 text-indigo-600" />
                  Recent Orders
                </h3>
                <button 
                  onClick={() => setActiveTab('orders')}
                  className="text-sm text-indigo-600 font-medium hover:underline"
                >
                  View All
                </button>
              </div>
              <div className="space-y-4">
                {orders.slice(0, 5).map(order => (
                  <div key={order.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div>
                      <p className="font-medium text-gray-900">{order.buyerBusinessName}</p>
                      <p className="text-xs text-gray-500">{new Date(order.createdAt).toLocaleDateString()}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-gray-900">₹{order.totalAmount.toFixed(2)}</p>
                      <span className={cn(
                        "text-[10px] px-2 py-0.5 rounded-full font-medium uppercase",
                        order.status === 'pending' ? "bg-orange-100 text-orange-700" :
                        order.status === 'confirmed' ? "bg-blue-100 text-blue-700" :
                        order.status === 'delivered' ? "bg-green-100 text-green-700" :
                        order.status === 'cancelled' ? "bg-red-100 text-red-700" :
                        "bg-gray-100 text-gray-700"
                      )}>
                        {order.status}
                      </span>
                    </div>
                  </div>
                ))}
                {orders.length === 0 && (
                  <p className="text-center py-4 text-gray-500 text-sm">No orders yet</p>
                )}
              </div>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-gray-900 flex items-center gap-2">
                  <MessageSquare className="w-5 h-5 text-indigo-600" />
                  Recent Inquiries
                </h3>
                <button 
                  onClick={() => setActiveTab('orders')}
                  className="text-sm text-indigo-600 font-medium hover:underline"
                >
                  View All
                </button>
              </div>
              <div className="space-y-4">
                {inquiries.slice(0, 5).map(inquiry => (
                  <div key={inquiry.id} className="p-3 bg-gray-50 rounded-lg">
                    <div className="flex justify-between items-start mb-1">
                      <p className="font-medium text-gray-900">{inquiry.buyerBusinessName}</p>
                      <span className={cn(
                        "text-[10px] px-2 py-0.5 rounded-full font-medium uppercase",
                        inquiry.status === 'new' ? "bg-blue-100 text-blue-700" :
                        inquiry.status === 'viewed' ? "bg-indigo-100 text-indigo-700" :
                        inquiry.status === 'responded' ? "bg-green-100 text-green-700" :
                        "bg-gray-100 text-gray-700"
                      )}>
                        {inquiry.status}
                      </span>
                    </div>
                    <p className="text-xs text-gray-600 line-clamp-1">{inquiry.productName}</p>
                    <p className="text-[10px] text-gray-400 mt-1">{new Date(inquiry.createdAt).toLocaleDateString()}</p>
                  </div>
                ))}
                {inquiries.length === 0 && (
                  <p className="text-center py-4 text-gray-500 text-sm">No inquiries yet</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {orderRole === 'seller' && activeTab === 'seller-profile' && (
        <div className="space-y-6">
          {isEditingProfile || !myBusinessProfile ? (
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold text-gray-900">
                  {myBusinessProfile ? 'Edit Business Profile' : 'Create Business Profile'}
                </h2>
                {myBusinessProfile && (
                  <button
                    onClick={() => setIsEditingProfile(false)}
                    className="text-gray-500 hover:text-gray-700"
                  >
                    Cancel
                  </button>
                )}
              </div>
              <BusinessProfileForm 
                ownerId={ownerId}
                initialData={myBusinessProfile || (myProfile ? {
                  businessName: myProfile.businessName || '',
                  ownerName: myProfile.ownerName || '',
                  mobile: myProfile.phone || '',
                  email: myProfile.email || '',
                  address: myProfile.address || '',
                  state: myProfile.state || '',
                  gstNumber: myProfile.gstin || '',
                  logoUrl: myProfile.logo || ''
                } : undefined)}
                onSuccess={() => {
                  setIsEditingProfile(false);
                  loadData();
                }} 
              />
            </div>
          ) : (
            <BusinessProfileView 
              profile={myBusinessProfile} 
              isOwner={true} 
              onEdit={() => setIsEditingProfile(true)} 
            />
          )}
        </div>
      )}

      {orderRole === 'seller' && activeTab === 'seller-products' && (
        <SellerProducts 
          products={myProducts} 
          onProductsChange={loadData} 
        />
      )}

      {orderRole === 'buyer' && activeTab === 'discover' && (
        <div className="space-y-6">
          <div className="relative">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type="text"
                  placeholder="Search by name, product, category, or keywords..."
                  className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                  value={searchQuery}
                  onChange={(e) => handleSearchInputChange(e.target.value)}
                  onFocus={() => setShowSuggestions(true)}
                  onKeyDown={(e) => e.key === 'Enter' && handleDiscoverySearch()}
                />
                <Search className="absolute left-3 top-2.5 h-5 w-5 text-gray-400" />
                
                {showSuggestions && (searchSuggestions.length > 0 || popularSearches.length > 0) && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white border rounded-lg shadow-lg z-50 overflow-hidden">
                    {searchSuggestions.length > 0 && (
                      <div className="p-2 border-b bg-gray-50">
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Suggestions</span>
                      </div>
                    )}
                    {searchSuggestions.map((s, idx) => (
                      <button
                        key={`suggestion-${idx}`}
                        onClick={() => {
                          setSearchQuery(s);
                          handleDiscoverySearch();
                        }}
                        className="w-full px-4 py-2 text-left hover:bg-indigo-50 flex items-center gap-2 text-sm transition-colors"
                      >
                        <Search className="w-3 h-3 text-gray-400" />
                        <span>{s}</span>
                      </button>
                    ))}
                    
                    {popularSearches.length > 0 && (
                      <div className="p-2 border-b bg-gray-50 border-t">
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Popular Searches</span>
                      </div>
                    )}
                    <div className="p-2 flex flex-wrap gap-2">
                      {popularSearches.map((ps) => (
                        <button
                          key={ps.id}
                          onClick={() => {
                            setSearchQuery(ps.query);
                            handleDiscoverySearch();
                          }}
                          className="px-3 py-1 bg-gray-100 hover:bg-indigo-100 text-gray-600 hover:text-indigo-700 rounded-full text-xs transition-colors flex items-center gap-1"
                        >
                          <TrendingUp className="w-3 h-3" />
                          {ps.query}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={cn(
                  "px-4 py-2 border rounded-lg flex items-center gap-2 hover:bg-gray-50 transition-colors",
                  showFilters ? "bg-indigo-50 border-indigo-200 text-indigo-600" : "text-gray-600"
                )}
              >
                <Filter className="w-4 h-4" />
                Filters
                {showFilters ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
              <button
                onClick={handleDiscoverySearch}
                disabled={loading}
                className="bg-indigo-600 text-white px-6 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50"
              >
                {loading ? 'Searching...' : 'Search'}
              </button>
            </div>

            {showFilters && (
              <div className="mt-4 p-4 bg-gray-50 rounded-lg border border-gray-200 grid grid-cols-1 md:grid-cols-5 gap-4 animate-in fade-in slide-in-from-top-2">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Category</label>
                    <select
                      value={filterCategory}
                      onChange={(e) => setFilterCategory(e.target.value)}
                      className="w-full px-3 py-2 border rounded-lg bg-white text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="">All Categories</option>
                      {b2bCategories.map(catName => (
                        <option key={catName} value={catName}>{catName}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Price Range (₹)</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        placeholder="Min"
                        value={filterMinPrice}
                        onChange={(e) => setFilterMinPrice(e.target.value)}
                        className="w-full px-3 py-2 border rounded-lg bg-white text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                      <span className="text-gray-400">-</span>
                      <input
                        type="number"
                        placeholder="Max"
                        value={filterMaxPrice}
                        onChange={(e) => setFilterMaxPrice(e.target.value)}
                        className="w-full px-3 py-2 border rounded-lg bg-white text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Location</label>
                    <input
                      type="text"
                      placeholder="City or State"
                      value={filterLocation}
                      onChange={(e) => setFilterLocation(e.target.value)}
                      className="w-full px-3 py-2 border rounded-lg bg-white text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Min Rating</label>
                    <select
                      value={filterMinRating}
                      onChange={(e) => setFilterMinRating(Number(e.target.value))}
                      className="w-full px-3 py-2 border rounded-lg bg-white text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="0">Any Rating</option>
                      <option value="4">4+ Stars</option>
                      <option value="3">3+ Stars</option>
                    </select>
                  </div>
                  <div className="flex flex-col justify-end">
                    <label className="flex items-center gap-2 cursor-pointer mb-2">
                      <input
                        type="checkbox"
                        checked={filterVerifiedOnly}
                        onChange={(e) => setFilterVerifiedOnly(e.target.checked)}
                        className="rounded text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="text-sm font-medium text-gray-700">Verified Only</span>
                    </label>
                    <button
                      onClick={() => {
                        setFilterCategory('');
                        setFilterMinPrice('');
                        setFilterMaxPrice('');
                        setFilterLocation('');
                        setFilterMinRating(0);
                        setFilterVerifiedOnly(false);
                        setSearchQuery('');
                        loadData();
                      }}
                      className="text-sm text-indigo-600 hover:text-indigo-700 font-medium text-left"
                    >
                      Clear All
                    </button>
                  </div>
                </div>
              )}

              {showSuggestions && (searchSuggestions.length > 0 || popularSearches.length > 0) && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border rounded-xl shadow-xl z-50 overflow-hidden max-h-[400px] overflow-y-auto">
                  {searchSuggestions.length > 0 && (
                    <div className="p-2">
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider px-3 py-1">Suggestions</p>
                      {searchSuggestions.map((s, idx) => (
                        <button
                          key={`suggest-${idx}`}
                          onClick={() => {
                            setSearchQuery(s);
                            setShowSuggestions(false);
                            handleDiscoverySearch();
                          }}
                          className="w-full px-4 py-2 text-left hover:bg-indigo-50 flex items-center gap-3 text-sm rounded-lg transition-colors"
                        >
                          <Search className="w-4 h-4 text-gray-400" />
                          <span className="text-gray-700">{s}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {popularSearches.length > 0 && (
                    <div className="p-2 border-t border-gray-50">
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider px-3 py-1">Popular Searches</p>
                      {popularSearches.map((ps) => (
                        <button
                          key={ps.id}
                          onClick={() => {
                            setSearchQuery(ps.query);
                            setShowSuggestions(false);
                            handleDiscoverySearch();
                          }}
                          className="w-full px-4 py-2 text-left hover:bg-indigo-50 flex items-center gap-3 text-sm rounded-lg transition-colors"
                        >
                          <TrendingUp className="w-4 h-4 text-indigo-400" />
                          <span className="text-gray-700">{ps.query}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          

          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
              <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
              <p className="text-gray-500 font-medium">Searching the marketplace...</p>
            </div>
          ) : productDiscoveryResults.length === 0 && discoveryResults.length === 0 ? (
            <div className="py-12 flex flex-col items-center text-center">
              <div className="bg-gray-100 p-6 rounded-full mb-4">
                <Search className="w-12 h-12 text-gray-400" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">No results found</h3>
              <p className="text-gray-500 max-w-md mb-8">
                We couldn't find anything matching "{searchQuery}". Try adjusting your filters or search terms.
              </p>
              
              <div className="w-full max-w-4xl space-y-8">
                <div>
                  <h4 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-4">Suggested Categories</h4>
                  <div className="flex flex-wrap justify-center gap-3">
                    {b2bCategories.slice(0, 8).map(catName => (
                      <button
                        key={catName}
                        onClick={() => {
                          setFilterCategory(catName);
                          handleDiscoverySearch();
                        }}
                        className="px-4 py-2 bg-white border rounded-lg hover:border-indigo-500 hover:text-indigo-600 transition-all shadow-sm flex items-center gap-2"
                      >
                        {catName}
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    ))}
                  </div>
                </div>
                
                {/* Similar Products (Featured) */}
                <div className="space-y-4">
                  <h4 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-4">Featured Products</h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {myProducts.slice(0, 3).map(prod => (
                      <div 
                        key={prod.id} 
                        className="bg-white p-4 rounded-xl border hover:shadow-md transition-shadow flex flex-col cursor-pointer text-left"
                        onClick={() => {
                          setSelectedProduct(prod);
                          setActiveTab('product-detail');
                          getBusinessProfile(prod.userId).then(setSellerProfile);
                        }}
                      >
                        <div className="h-32 bg-gray-100 rounded-lg mb-3 overflow-hidden">
                          {prod.imageUrl ? (
                            <img src={prod.imageUrl} alt={prod.name} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <Package className="w-8 h-8 text-gray-300" />
                            </div>
                          )}
                        </div>
                        <h5 className="font-bold text-gray-900 truncate">{prod.name}</h5>
                        <p className="text-sm font-bold text-indigo-600 mt-1">₹{prod.price.toFixed(2)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <>
              {productDiscoveryResults.length > 0 && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Package className="w-5 h-5 text-orange-500" />
                Products Found
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {productDiscoveryResults.map((prod) => (
                  <div 
                    key={prod.id} 
                    className="bg-white p-4 rounded-xl border hover:shadow-md transition-shadow flex flex-col cursor-pointer"
                    onClick={() => {
                      setSelectedProduct(prod);
                      setActiveTab('product-detail');
                      getBusinessProfile(prod.userId).then(setSellerProfile);
                      getSellerProducts(prod.userId).then(setSellerProducts);
                    }}
                  >
                    <div className="h-40 w-full bg-gray-50 rounded-lg flex items-center justify-center overflow-hidden border mb-3">
                      {prod.imageUrl ? (
                        <img src={prod.imageUrl} alt={prod.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      ) : (
                        <Package className="h-12 w-12 text-gray-300" />
                      )}
                    </div>
                    <h4 className="font-bold text-gray-900 truncate">{prod.name}</h4>
                    <div className="flex items-center gap-2 mt-1">
                      <p className="text-sm font-bold text-indigo-600">₹{prod.price.toFixed(2)}</p>
                      {prod.rating && prod.rating > 0 && (
                        <div className="flex items-center gap-0.5 ml-auto">
                          <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />
                          <span className="text-[10px] font-bold text-gray-600">{prod.rating.toFixed(1)}</span>
                        </div>
                      )}
                    </div>
                    {(prod.city || prod.state) && (
                      <p className="text-xs text-gray-400 flex items-center gap-1 mt-1">
                        <MapPin className="w-3 h-3" />
                        {prod.city}{prod.city && prod.state ? ', ' : ''}{prod.state}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-4 mt-8">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Building2 className="w-5 h-5 text-indigo-600" />
              Businesses Found
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {discoveryResults.map((biz) => (
              <div key={biz.userId} className="bg-white p-4 rounded-xl border hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="h-12 w-12 bg-indigo-50 rounded-lg flex items-center justify-center overflow-hidden">
                      {biz.logoUrl ? (
                        <img src={biz.logoUrl} alt={biz.businessName} className="w-full h-full object-cover" />
                      ) : (
                        <Building2 className="h-6 w-6 text-indigo-600" />
                      )}
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900 flex items-center gap-1">
                        {biz.businessName}
                        {biz.verificationLevel === 'premium' && <ShieldCheck className="w-3.5 h-3.5 text-indigo-600" />}
                      </h3>
                      <p className="text-sm text-gray-500">{biz.categories[0] || 'General Business'}</p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <TrustBadge level={biz.verificationLevel || (biz.gstNumber ? 'gst_verified' : 'basic')} />
                    {biz.isTopRated && <TrustBadge type="top-rated" />}
                  </div>
                </div>

                <div className="space-y-2 mb-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <MapPin className="h-4 w-4" />
                      {biz.city}, {biz.state}
                    </div>
                    {biz.rating && biz.rating > 0 && (
                      <RatingStars rating={biz.rating} total={biz.totalRatings || 0} />
                    )}
                  </div>
                  <div className="flex items-center gap-4 text-xs text-gray-500">
                    <div className="flex items-center gap-1">
                      <TrendingUp className="h-3 w-3 text-green-500" />
                      {biz.responseRate || 0}% Response
                    </div>
                    <div>{biz.totalOrdersCompleted || 0} Orders</div>
                  </div>
                </div>

                <div className="flex gap-2 pt-2 border-t">
                  <button
                    onClick={() => {
                      setSelectedSupplier(biz);
                      setActiveTab('suppliers');
                    }}
                    className="flex-1 px-3 py-2 text-sm font-medium text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100"
                  >
                    View Catalog
                  </button>
                  {!isConnected(biz.userId) && !isPending(biz.userId) && biz.userId !== userId && (
                    <button
                      onClick={() => handleConnectFromProfile(biz.userId)}
                      className="px-3 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700"
                    >
                      Connect
                    </button>
                  )}
                </div>
              </div>
            ))}
            </div>
          </div>
        </>
      )}
    </div>
  )}

      

      {orderRole === 'buyer' && activeTab === 'suppliers' && (
        <div className="space-y-6">
          {(!selectedSeller && !selectedSupplier) ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {mySuppliers.map(conn => {
                const isFromMe = conn.fromUserId === userId;
                const sellerId = isFromMe ? conn.toUserId : conn.fromUserId;
                const sellerName = isFromMe ? conn.toBusinessName : conn.fromBusinessName;
                const sellerPhone = isFromMe ? conn.toPhone : conn.fromPhone;

                return (
                  <div key={conn.id} className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 hover:border-indigo-300 transition-colors group">
                    <div className="flex items-start justify-between mb-4">
                      <div className="bg-indigo-50 p-3 rounded-lg">
                        <Store className="w-6 h-6 text-indigo-600" />
                      </div>
                      <span className="text-xs font-medium px-2 py-1 bg-green-100 text-green-700 rounded-full">Connected</span>
                    </div>
                    <h3 className="font-bold text-lg mb-1">{sellerName}</h3>
                    <p className="text-gray-500 text-sm mb-4">{sellerPhone}</p>
                    <button
                      onClick={() => viewSellerCatalog(sellerId)}
                      className="w-full flex items-center justify-center gap-2 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-all"
                    >
                      Browse Catalog
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}
              {mySuppliers.length === 0 && (
                <div className="col-span-full py-12 text-center bg-gray-50 rounded-xl border-2 border-dashed border-gray-200">
                  <Store className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500 font-medium">No connected suppliers yet</p>
                  <button 
                    onClick={() => setActiveTab('connections')}
                    className="mt-2 text-indigo-600 hover:underline text-sm"
                  >
                    Find businesses to connect
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex items-center justify-between bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                <button
                  onClick={() => {
                    setSelectedSeller(null);
                    setSelectedSupplier(null);
                  }}
                  className="text-gray-500 hover:text-gray-900 flex items-center gap-1"
                >
                  <ArrowRight className="w-4 h-4 rotate-180" />
                  Back to Suppliers
                </button>
                <div className="text-center">
                  <h3 className="font-bold text-lg">{selectedSeller ? mySuppliers.find(c => (c.fromUserId === selectedSeller || c.toUserId === selectedSeller))?.fromBusinessName || 'Supplier' : selectedSupplier?.businessName}</h3>
                  <p className="text-xs text-gray-500">Catalog & Ordering</p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-gray-500">Cart Items</p>
                  <p className="font-bold text-indigo-600">{Object.values(cart).reduce((a: number, b: number) => a + b, 0)} items</p>
                </div>
              </div>

              <div className="grid lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-6">
                  {(selectedSupplier || sellerProfile) && (
                    <BusinessProfileView profile={selectedSupplier || sellerProfile!} />
                  )}
                  
                  <div className="grid sm:grid-cols-2 gap-4">
                    {sellerProducts.map(product => (
                      <div key={product.id} className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-col">
                        <div className="flex justify-between items-start mb-2">
                          <h4 className="font-bold">{product.name}</h4>
                          <span className="text-xs bg-gray-100 px-2 py-1 rounded text-gray-600">{product.category}</span>
                        </div>
                        <p className="text-2xl font-bold text-indigo-600 mb-1">₹{product.price.toFixed(2)}</p>
                        <p className="text-xs text-gray-500 mb-4">
                          Stock: {product.trackInventory === false ? 'Not Tracked' : (product.stock || 0)}
                        </p>
                        
                        <div className="mt-auto space-y-2">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 flex items-center border rounded-lg overflow-hidden">
                              <button
                                onClick={() => addToCart(product.id!, -1)}
                                disabled={!cart[product.id!]}
                                className="px-3 py-1 bg-gray-50 hover:bg-gray-100 disabled:opacity-50"
                              >
                                -
                              </button>
                              <span className="flex-1 text-center font-medium">{cart[product.id!] || 0}</span>
                              <button
                                onClick={() => addToCart(product.id!, 1)}
                                className="px-3 py-1 bg-gray-50 hover:bg-gray-100"
                              >
                                +
                              </button>
                            </div>
                          </div>
                          <button
                            onClick={() => {
                              setInquiryQty(product.moq || 1);
                              setShowInquiryModal({ product, sellerId: selectedSeller || selectedSupplier?.userId || '' });
                            }}
                            className="w-full flex items-center justify-center gap-2 py-2 text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100 text-sm font-medium"
                          >
                            <MessageSquare className="w-4 h-4" />
                            Send Inquiry
                          </button>
                        </div>
                      </div>
                    ))}
                    {sellerProducts.length === 0 && (
                      <div className="col-span-full py-12 text-center bg-gray-50 rounded-xl border-2 border-dashed border-gray-200">
                        <ShoppingBag className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                        <p className="text-gray-500 font-medium">No products listed by this supplier</p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 sticky top-4">
                    <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
                      <ShoppingBag className="w-5 h-5 text-indigo-600" />
                      Order Summary
                    </h3>
                    <div className="space-y-3 mb-6 max-h-64 overflow-y-auto">
                      {sellerProducts.filter(p => cart[p.id!]).map(p => (
                        <div key={p.id} className="flex justify-between text-sm">
                          <span>{p.name} x {cart[p.id!]}</span>
                          <span className="font-medium">₹{(p.price * cart[p.id!]).toFixed(2)}</span>
                        </div>
                      ))}
                      {Object.keys(cart).length === 0 && (
                        <p className="text-gray-500 text-center py-4 italic">Cart is empty</p>
                      )}
                    </div>
                    <div className="border-t pt-4 space-y-2">
                      <div className="flex justify-between text-lg font-bold">
                        <span>Total</span>
                        <span>₹{sellerProducts.reduce((sum, p) => sum + (p.price * (cart[p.id!] || 0)), 0).toFixed(2)}</span>
                      </div>
                      <button
                        onClick={placeOrder}
                        disabled={Object.keys(cart).length === 0}
                        className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold hover:bg-indigo-700 disabled:opacity-50 transition-all mt-4"
                      >
                        Place Order
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'orders' && (
        <div className="space-y-6">
          {/* Metrics Section */}
          {inquiries.length > 0 && (
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                <p className="text-sm text-gray-500">Reply Percentage</p>
                <p className="text-2xl font-bold text-indigo-600">
                  {(() => {
                    const replied = inquiries.filter(i => i.status === 'responded' || (i.messages && i.messages.length > 0) || i.replyMessage);
                    if (inquiries.length === 0) return '0%';
                    return ((replied.length / inquiries.length) * 100).toFixed(1) + '%';
                  })()}
                </p>
              </div>
              <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                <p className="text-sm text-gray-500">Avg. Reply Time</p>
                <p className="text-2xl font-bold text-indigo-600">
                  {(() => {
                    const repliedWithMessages = inquiries.filter(i => i.messages && i.messages.length > 0);
                    if (repliedWithMessages.length === 0) return 'N/A';
                    const totalTime = repliedWithMessages.reduce((sum, i) => {
                      const firstReplyTime = Math.min(...i.messages!.map(m => new Date(m.timestamp).getTime()));
                      const createTime = new Date(i.createdAt).getTime();
                      return sum + (firstReplyTime - createTime);
                    }, 0);
                    const avgTimeMs = totalTime / repliedWithMessages.length;
                    const hours = Math.floor(avgTimeMs / (1000 * 60 * 60));
                    const minutes = Math.floor((avgTimeMs % (1000 * 60 * 60)) / (1000 * 60));
                    return `${hours}h ${minutes}m`;
                  })()}
                </p>
              </div>
            </div>
          )}

          {/* Inquiries Section */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden mb-6">
            <div className="p-4 border-b bg-gray-50 flex justify-between items-center">
              <h2 className="font-semibold flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-indigo-600" />
                Product Inquiries
              </h2>
            </div>
            <div className="divide-y max-h-[600px] overflow-y-auto">
              {inquiries.length === 0 ? (
                <div className="p-8 text-center text-gray-500 italic">No inquiries found.</div>
              ) : (
                (() => {
                  // If buyer, group by competitionId
                  if (orderRole === 'buyer') {
                    const processedCompetitions = new Set<string>();
                    const standaloneInquiries = inquiries.filter(i => !i.competitionId);
                    const competitionInquiriesList = inquiries.filter(i => i.competitionId);

                    return (
                      <>
                        {/* Grouped Competitions */}
                        {competitionInquiriesList.map(inquiry => {
                          if (processedCompetitions.has(inquiry.competitionId!)) return null;
                          processedCompetitions.add(inquiry.competitionId!);
                          
                          const related = competitionInquiries[inquiry.competitionId!] || [inquiry];
                          const winner = related.find(r => r.isWinner);
                          
                          // Best Offer Logic: Lowest priceQuote
                          const bestOffer = related
                            .filter(r => r.priceQuote)
                            .sort((a, b) => (a.priceQuote || 0) - (b.priceQuote || 0))[0];

                          return (
                            <div key={inquiry.competitionId} className="p-4 bg-indigo-50/30 border-b-2 border-indigo-100">
                              <div className="flex justify-between items-center mb-4">
                                <div>
                                  <h3 className="font-bold text-indigo-900 flex items-center gap-2">
                                    <Trophy className="w-4 h-4 text-amber-500" />
                                    Competition: {inquiry.productName}
                                  </h3>
                                  <p className="text-xs text-indigo-600">{related.length} suppliers competing</p>
                                </div>
                                {winner && (
                                  <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-bold flex items-center gap-1">
                                    <CheckCircle2 className="w-3 h-3" /> Winner Selected
                                  </span>
                                )}
                              </div>

                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {related.map(rel => (
                                  <div key={rel.id} className={cn(
                                    "p-4 rounded-xl border bg-white shadow-sm transition-all",
                                    rel.isWinner ? "border-green-500 ring-2 ring-green-100" : 
                                    (bestOffer?.id === rel.id && !winner) ? "border-amber-400 ring-2 ring-amber-100" : "border-gray-200"
                                  )}>
                                    <div className="flex justify-between items-start mb-2">
                                      <div>
                                        <p className="font-bold text-gray-900">{rel.sellerBusinessName}</p>
                                        <p className="text-[10px] text-gray-500">{new Date(rel.createdAt).toLocaleDateString()}</p>
                                      </div>
                                      {bestOffer?.id === rel.id && !winner && (
                                        <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                                          BEST OFFER
                                        </span>
                                      )}
                                    </div>
                                    
                                    <div className="space-y-2">
                                      <div className="flex justify-between items-center">
                                        <span className="text-xs text-gray-500">Quote:</span>
                                        <span className="text-sm font-bold text-indigo-600">
                                          {rel.priceQuote ? `₹${rel.priceQuote.toFixed(2)}` : 'Awaiting Quote'}
                                        </span>
                                      </div>
                                      <div className="flex justify-between items-center">
                                        <span className="text-xs text-gray-500">Status:</span>
                                        <span className={cn(
                                          "text-[10px] px-2 py-0.5 rounded-full font-bold uppercase",
                                          rel.status === 'responded' ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-700"
                                        )}>
                                          {rel.status}
                                        </span>
                                      </div>
                                    </div>

                                    {rel.replyMessage && (
                                      <p className="mt-3 text-xs text-gray-600 italic bg-gray-50 p-2 rounded border border-dashed">
                                        "{rel.replyMessage}"
                                      </p>
                                    )}

                                    <div className="mt-4 flex gap-2">
                                      <button 
                                        onClick={() => setReplyingToInquiry(rel.id!)}
                                        className="flex-1 py-1.5 text-xs font-medium text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100"
                                      >
                                        Chat
                                      </button>
                                      {!winner && rel.status === 'responded' && (
                                        <button 
                                          onClick={async () => {
                                            if (confirm(`Are you sure you want to select ${rel.sellerBusinessName} as the winner? This will close other inquiries for this product.`)) {
                                              const { markInquiryAsWinner } = await import('../lib/firestore');
                                              await markInquiryAsWinner(rel.id!);
                                              loadData();
                                            }
                                          }}
                                          className="flex-1 py-1.5 text-xs font-medium text-white bg-green-600 rounded-lg hover:bg-green-700"
                                        >
                                          Select Winner
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })}

                        {/* Standalone Inquiries */}
                        {standaloneInquiries.map(inquiry => renderInquiry(inquiry))}
                      </>
                    );
                  }

                  // If seller, show individual inquiries
                  return inquiries.map(inquiry => renderInquiry(inquiry));
                })()
              )}
            </div>
          </div>

          <div className="space-y-4">
            <h2 className="font-semibold flex items-center gap-2 px-1">
              <ShoppingCart className="w-5 h-5 text-indigo-600" />
              B2B Orders
            </h2>
            {orders.map(order => (
              <div key={order.id} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="p-4 bg-gray-50 border-bottom flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="bg-white p-2 rounded-lg border">
                      <Package className="w-5 h-5 text-gray-600" />
                    </div>
                    <div>
                      <p className="font-bold">{orderRole === 'buyer' ? order.sellerBusinessName : order.buyerBusinessName}</p>
                      <p className="text-xs text-gray-500">{new Date(order.createdAt).toLocaleString()}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={cn(
                      "px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider",
                      order.status === 'pending' && "bg-orange-100 text-orange-700",
                      order.status === 'confirmed' && "bg-blue-100 text-blue-700",
                      order.status === 'delivered' && "bg-green-100 text-green-700",
                      order.status === 'cancelled' && "bg-red-100 text-red-700"
                    )}>
                      {order.status}
                    </span>
                    <p className="font-bold text-lg">₹{order.totalAmount.toFixed(2)}</p>
                  </div>
                </div>
                <div className="p-4">
                  <div className="space-y-2">
                    {order.items.map((item, idx) => (
                      <div key={idx} className="flex justify-between text-sm text-gray-600">
                        <span>{item.name} x {item.quantity}</span>
                        <span>₹{item.total.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 flex gap-2 justify-end">
                    {orderRole === 'seller' && order.status === 'pending' && (
                      <>
                        <button
                          onClick={() => handleOrderUpdate(order.id!, 'confirmed', order)}
                          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-700"
                        >
                          Confirm Order
                        </button>
                        <button
                          onClick={() => handleOrderUpdate(order.id!, 'cancelled', order)}
                          className="px-4 py-2 bg-white border border-red-200 text-red-600 rounded-lg text-sm font-bold hover:bg-red-50"
                        >
                          Cancel
                        </button>
                      </>
                    )}
                    {orderRole === 'seller' && order.status === 'confirmed' && (
                      <button
                        onClick={() => handleOrderUpdate(order.id!, 'delivered', order)}
                        className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-bold hover:bg-green-700"
                      >
                        Mark as Delivered
                      </button>
                    )}
                    {orderRole === 'buyer' && order.status === 'delivered' && (
                      <button
                        onClick={() => setShowReviewModal({ sellerId: order.sellerId, sellerName: order.sellerBusinessName })}
                        className="px-6 py-2 bg-amber-50 text-amber-700 font-bold rounded-lg border border-amber-200 hover:bg-amber-100 flex items-center gap-2"
                      >
                        <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
                        Rate Supplier
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {orders.length === 0 && (
              <div className="py-12 text-center bg-gray-50 rounded-xl border-2 border-dashed border-gray-200">
                <History className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 font-medium">No orders found</p>
              </div>
            )}
          </div>
        </div>
      )}
      {/* Review Modal */}
      {showReviewModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[60]">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold">Rate {showReviewModal.sellerName}</h2>
              <button onClick={() => setShowReviewModal(null)} className="text-gray-400 hover:text-gray-600">
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="space-y-6">
              <div className="flex flex-col items-center gap-2">
                <p className="text-sm font-medium text-gray-500">How was your experience?</p>
                <div className="flex items-center gap-2">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <button
                      key={s}
                      onClick={() => setReviewRating(s)}
                      className="p-1 hover:scale-110 transition-transform"
                    >
                      <Star
                        className={cn(
                          "w-10 h-10",
                          s <= reviewRating ? "text-yellow-400 fill-yellow-400" : "text-gray-200"
                        )}
                      />
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Your Feedback</label>
                <textarea
                  className="w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none h-32 resize-none"
                  placeholder="Share your experience with this supplier..."
                  value={reviewComment}
                  onChange={(e) => setReviewComment(e.target.value)}
                />
              </div>

              <button
                onClick={handleReviewSubmit}
                disabled={loading}
                className="w-full bg-indigo-600 text-white py-4 rounded-xl font-bold hover:bg-indigo-700 disabled:opacity-50 shadow-lg shadow-indigo-100"
              >
                {loading ? 'Submitting...' : 'Submit Review'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Inquiry Modal */}
      {showInquiryModal && showInquiryModal.product && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold">Send Inquiry</h2>
              <button onClick={() => setShowInquiryModal(null)} className="text-gray-400 hover:text-gray-600">
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="p-3 bg-indigo-50 rounded-lg">
                <p className="text-sm font-medium text-indigo-900">{showInquiryModal.product.name}</p>
                <p className="text-xs text-indigo-700">Price: ₹{showInquiryModal.product.price} | MOQ: {showInquiryModal.product.moq || 1}</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Your Name</label>
                  <input
                    type="text"
                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                    placeholder="Full Name"
                    value={inquiryBuyerName}
                    onChange={(e) => setInquiryBuyerName(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Mobile Number</label>
                  <input
                    type="tel"
                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                    placeholder="10-digit mobile"
                    value={inquiryBuyerPhone}
                    onChange={(e) => setInquiryBuyerPhone(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Quantity Required</label>
                <input
                  type="number"
                  min={showInquiryModal.product.moq || 1}
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                  value={inquiryQty}
                  onChange={(e) => setInquiryQty(parseInt(e.target.value))}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Message to Seller</label>
                <textarea
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none h-24 resize-none"
                  placeholder="Ask about bulk discounts, delivery time, etc."
                  value={inquiryMessage}
                  onChange={(e) => setInquiryMessage(e.target.value)}
                />
              </div>

              <div className="flex items-center gap-2 py-2">
                <input 
                  type="checkbox" 
                  id="multi-seller" 
                  checked={sendToMultiple}
                  onChange={(e) => setSendToMultiple(e.target.checked)}
                  className="w-4 h-4 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500"
                />
                <label htmlFor="multi-seller" className="text-sm text-gray-600">
                  Send this inquiry to similar suppliers for better quotes
                </label>
              </div>

              <button
                onClick={handleSendInquiry}
                disabled={loading}
                className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold hover:bg-indigo-700 disabled:opacity-50"
              >
                {loading ? 'Sending...' : 'Send Inquiry'}
              </button>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'product-detail' && selectedProduct && (
        <div className="space-y-6">
          <button 
            onClick={() => setActiveTab('discover')}
            className="text-indigo-600 flex items-center gap-1 hover:underline"
          >
            <ChevronLeft className="w-4 h-4" /> Back to Discover
          </button>
          
          {/* Product Details */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 grid md:grid-cols-2 gap-8">
            <div className="h-80 bg-gray-50 rounded-xl flex items-center justify-center overflow-hidden border">
              {selectedProduct.imageUrl ? (
                <img src={selectedProduct.imageUrl} alt={selectedProduct.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              ) : (
                <Package className="h-24 w-24 text-gray-300" />
              )}
            </div>
            <div className="space-y-4">
              <h2 className="text-3xl font-bold text-gray-900">{selectedProduct.name}</h2>
              <p className="text-4xl font-bold text-indigo-600">₹{selectedProduct.price.toFixed(2)}</p>
              <p className="text-gray-600">{selectedProduct.description || 'No description available.'}</p>
              <p className="text-sm text-gray-500">Stock: {selectedProduct.trackInventory === false ? 'Not Tracked' : (selectedProduct.stock || 0)}</p>
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setInquiryQty(selectedProduct.moq || 1);
                    setShowInquiryModal({ product: selectedProduct, sellerId: selectedProduct.userId });
                  }}
                  className="flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 flex-1"
                >
                  <Package className="w-4 h-4" />
                  Get Best Price
                </button>
                <button
                  onClick={() => {
                    const message = encodeURIComponent(`Hello ${sellerProfile?.businessName || 'Seller'}, I saw your product ${selectedProduct?.name} on the B2B Marketplace and I'm interested.`);
                    window.open(`https://wa.me/${sellerProfile?.whatsapp}?text=${message}`, '_blank');
                  }}
                  className="flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 flex-1"
                >
                  <MessageCircle className="w-4 h-4" />
                  WhatsApp
                </button>
              </div>
            </div>
          </div>

          {/* Seller Profile */}
          {sellerProfile && (() => {
            return (
              <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                <h3 className="text-lg font-semibold mb-4">Seller Profile</h3>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-indigo-50 rounded-full flex items-center justify-center text-indigo-600">
                      <Building2 className="w-6 h-6" />
                    </div>
                    <div>
                      <h4 className="font-bold text-gray-900">{sellerProfile.businessName}</h4>
                      <p className="text-sm text-gray-500 flex items-center gap-1">
                        <MapPin className="w-4 h-4" />
                        {sellerProfile.city}, {sellerProfile.state}
                      </p>
                    </div>
                  </div>
                  <button 
                    onClick={() => {
                      const message = encodeURIComponent(`Hello ${sellerProfile.businessName}, I saw your product ${selectedProduct?.name} on the B2B Marketplace and I'm interested.`);
                      window.open(`https://wa.me/${sellerProfile.whatsapp}?text=${message}`, '_blank');
                    }}
                    className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg font-bold hover:bg-emerald-700 transition-all"
                  >
                    <MessageCircle className="w-4 h-4" />
                    Contact
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-4 mt-6 pt-6 border-t border-gray-100">
                  <div className="bg-gray-50 p-3 rounded-lg text-center">
                    <p className="text-[10px] text-gray-500 uppercase font-bold tracking-wider mb-1">Response Rate</p>
                    <p className="text-lg font-bold text-indigo-600">{sellerProfile.responseRate || 0}%</p>
                  </div>
                  <div className="bg-gray-50 p-3 rounded-lg text-center">
                    <p className="text-[10px] text-gray-500 uppercase font-bold tracking-wider mb-1">Avg. Response Time</p>
                    <p className="text-lg font-bold text-indigo-600">
                      {sellerProfile.avgResponseTime ? (() => {
                        const hours = Math.floor(sellerProfile.avgResponseTime / (1000 * 60 * 60));
                        const minutes = Math.floor((sellerProfile.avgResponseTime % (1000 * 60 * 60)) / (1000 * 60));
                        return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
                      })() : 'N/A'}
                    </p>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Related Products */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
             <h3 className="text-lg font-semibold mb-4">Related Products</h3>
             <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {productDiscoveryResults
                  .filter(p => p.category === selectedProduct.category && p.id !== selectedProduct.id)
                  .slice(0, 3)
                  .map(prod => (
                    <div key={prod.id} className="bg-gray-50 p-4 rounded-xl border">
                      <h4 className="font-bold">{prod.name}</h4>
                      <p className="text-indigo-600 font-bold">₹{prod.price.toFixed(2)}</p>
                    </div>
                  ))
                }
             </div>
          </div>
        </div>
      )}
    </div>
  );
}
