import Dexie, { type Table } from 'dexie';

export interface Product {
  id?: string;
  userId: string;
  name: string;
  type: 'product' | 'service';
  sku: string;
  hsnCode?: string;
  gstRate?: number; // e.g., 5, 12, 18, 28
  costPrice: number;
  price: number;
  stock: number;
  primaryUnit: string;
  secondaryUnit?: string;
  conversionRate?: number;
  category: string;
  minStock: number;
  trackInventory: boolean;
  createdAt: number;
  updatedAt: number;
  moq?: number; // Minimum Order Quantity
  isPublic?: boolean; // Visible in discovery
  imageUrl?: string;
  imageUrls?: string[];
  description?: string;
  attributes?: Record<string, any>; // Category-specific attributes
  rating?: number;
  totalRatings?: number;
  keywords?: string[];
  tags?: string[];
  bulkPricing?: BulkPrice[];
  qualityScore?: number;
  isHighQuality?: boolean;
}

export interface BulkPrice {
  minQuantity: number;
  pricePerUnit: number;
}

export interface PopularSearch {
  id?: string;
  query: string;
  count: number;
  lastSearched: number;
}

export interface InvoiceItem {
  productId: string;
  name: string;
  hsnCode?: string;
  gstRate?: number;
  cgst?: number;
  sgst?: number;
  igst?: number;
  quantity: number;
  unit?: string;
  basePrice?: number;
  conversionRate?: number;
  costPrice: number;
  price: number;
  total: number;
}

export interface SplitPayment {
  method: 'cash' | 'card' | 'upi' | 'other';
  amount: number;
}

export interface Invoice {
  id?: string;
  userId: string;
  customerName: string;
  customerMobile?: string;
  customerAddress?: string;
  customerGstin?: string;
  isGstInvoice?: boolean;
  stateOfSupply?: string;
  items: InvoiceItem[];
  subtotal: number;
  totalGst: number;
  cgstTotal?: number;
  sgstTotal?: number;
  igstTotal?: number;
  tax: number; // Legacy field, keeping for compatibility
  taxPercentage: number; // Legacy field, keeping for compatibility
  total: number;
  receivedAmount: number;
  creditAmount: number;
  date: number;
  validityDate?: number;
  invoiceNumber: string;
  type?: 'invoice' | 'quotation';
  discount?: number;
  paymentMethod?: 'cash' | 'card' | 'upi' | 'other' | 'split';
  splitPayments?: SplitPayment[];
  createdBy?: string;
  staffName?: string;
}

export interface Payment {
  id?: string;
  userId: string;
  customerName: string;
  customerMobile?: string;
  amount: number;
  date: number;
  method: 'cash' | 'card' | 'upi' | 'other';
  note?: string;
  createdBy?: string;
  staffName?: string;
}

export type UserRole = 'admin' | 'sales_manager' | 'inventory_manager' | 'ca';

export interface User {
  id?: string;
  name?: string;
  displayName?: string;
  email?: string;
  mobile?: string;
  username?: string;
  role: UserRole;
  ownerId?: string; // For staff members
  createdAt?: number;
  updatedAt?: number;
}

export interface Profile {
  id?: string;
  userId: string;
  businessName: string;
  ownerName: string;
  email: string;
  phone: string;
  address: string;
  gstin?: string;
  state?: string;
  logo?: string;
  signatureUrl?: string;
  taxPercentage: number;
  trackInventory: boolean;
  category?: string;
  location?: string;
  totalOrders?: number;
  successRate?: number;
  yearsOnPlatform?: number;
  lastActive?: number;
  invoiceTheme?: 'modern' | 'classic' | 'minimal' | 'bold' | 'elegant';
}

export interface BusinessProfile {
  id?: string;
  userId: string;
  businessName: string;
  ownerName?: string;
  mobile: string;
  whatsapp: string;
  email?: string;
  address?: string;
  city?: string;
  state?: string;
  gstNumber?: string;
  categories: string[]; // max 3
  description: string; // max 150 chars
  logoUrl?: string;
  pricingType: 'show' | 'hide';
  moq: number;
  deliveryType: 'pickup' | 'local' | 'courier';
  createdAt: number;
  updatedAt: number;
  totalInquiriesCompleted: number;
  totalOrdersCompleted?: number;
  totalOrders?: number;
  orderConversionRate?: number;
  inquiriesWon?: number;
  inquiriesLost?: number;
  competitionCount?: number;
  responseRate?: number;
  avgResponseTime?: number; // in milliseconds
  totalInquiries?: number;
  respondedInquiries?: number;
  verificationLevel: 'basic' | 'gst_verified' | 'premium';
  rating?: number;
  totalRatings?: number;
  isTopRated?: boolean;
  isFastResponder?: boolean;
}

export interface Review {
  id?: string;
  sellerId: string;
  buyerId: string;
  buyerName: string;
  buyerBusinessName: string;
  rating: number; // 1-5
  comment: string;
  createdAt: number;
}

export interface Connection {
  id?: string;
  fromUserId: string;
  toUserId: string;
  status: 'pending' | 'connected' | 'rejected';
  createdAt: number;
  updatedAt: number;
  // Metadata for easier display
  fromBusinessName?: string;
  toBusinessName?: string;
  fromPhone?: string;
  toPhone?: string;
}

export interface B2BOrder {
  id?: string;
  buyerId: string;
  sellerId: string;
  inquiryId?: string;
  buyerBusinessName: string;
  sellerBusinessName: string;
  items: InvoiceItem[];
  status: 'pending' | 'confirmed' | 'delivered' | 'cancelled';
  totalAmount: number;
  deliveryTime?: string;
  createdAt: number;
  updatedAt: number;
  invoiceId?: string; // Link to generated invoice
  note?: string;
}

export interface InquiryMessage {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  timestamp: number;
}

export interface Inquiry {
  id?: string;
  buyerId: string;
  sellerId: string;
  productId: string;
  productName: string;
  buyerName: string;
  buyerPhone: string;
  quantity: number;
  message: string;
  replyMessage?: string;
  messages?: InquiryMessage[];
  status: 'new' | 'viewed' | 'responded' | 'closed';
  createdAt: number;
  updatedAt: number;
  buyerBusinessName: string;
  sellerBusinessName: string;
  competitionId?: string;
  isWinner?: boolean;
  priceQuote?: number;
  quoteQuantity?: number;
  deliveryTime?: string;
  quoteStatus?: 'pending' | 'accepted' | 'rejected' | 'negotiating';
}

export interface Notification {
  id?: string;
  userId: string;
  title: string;
  message: string;
  type: 'inquiry' | 'reply' | 'order' | 'system';
  relatedId?: string; // ID of the inquiry, order, etc.
  isRead: boolean;
  createdAt: number;
}

export interface Expense {
  id?: string;
  userId: string;
  category: 'purchase' | 'rent' | 'salary' | 'utilities' | 'marketing' | 'other';
  amount: number;
  date: number;
  description: string;
  paymentMethod?: 'cash' | 'card' | 'upi' | 'other';
  createdBy?: string;
  staffName?: string;
}

export interface Activity {
  id?: string;
  userId: string;
  staffId: string;
  staffName: string;
  action: string;
  details?: string;
  type: 'stock' | 'invoice' | 'payment' | 'expense' | 'security' | 'other';
  timestamp: number;
}

export interface Staff {
  id?: string;
  userId: string; // Business owner ID
  uid?: string; // The staff member's own Firebase UID (linked when they first login)
  name: string;
  email?: string;
  phone?: string;
  role: UserRole;
  status: 'active' | 'inactive';
  createdAt: number;
  updatedAt: number;
}

export class QuinDatabase extends Dexie {
  products!: Table<Product>;
  invoices!: Table<Invoice>;
  payments!: Table<Payment>;
  users!: Table<User>;
  profile!: Table<Profile>;
  expenses!: Table<Expense>;
  backups!: Table<BackupRecord>;

  constructor() {
    super('QuinDB');
    this.version(3).stores({
      products: '++id, name, sku, category',
      invoices: '++id, invoiceNumber, customerName, date',
      payments: '++id, customerName, date',
      users: '++id, username',
      profile: '++id'
    });
    this.version(4).stores({
      users: '++id, username, mobile'
    });
    this.version(5).stores({
      products: '++id, userId, name, sku, category',
      invoices: '++id, userId, invoiceNumber, customerName, date',
      payments: '++id, userId, customerName, date',
      profile: '++id, userId'
    });
    this.version(6).stores({
      expenses: '++id, userId, category, date'
    });
    this.version(7).stores({
      backups: '++id, userId, date'
    });
  }
}

export interface BackupRecord {
  id?: number;
  userId: string;
  date: number;
  data: Uint8Array; // Compressed data
  filename: string;
  size: number;
  recordCount: number;
  type: 'auto' | 'manual';
}

export const db = new QuinDatabase();
