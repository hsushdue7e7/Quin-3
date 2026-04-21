import { db, auth, storage } from './firebase';
import { doc, getDoc, setDoc, updateDoc, collection, query, where, getDocs, addDoc, deleteDoc, onSnapshot, orderBy, limit, serverTimestamp, writeBatch, arrayUnion, increment } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, uploadBytesResumable } from 'firebase/storage';
import imageCompression from 'browser-image-compression';
import { type Invoice, type Payment, type User, type Connection, type B2BOrder, type Product, type Inquiry, type BusinessProfile, type Review, type PopularSearch, type Expense, type Staff } from '../db';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export const uploadImage = async (file: File, path: string): Promise<string> => {
  const options = {
    maxSizeMB: 0.5, // Compress to 500KB to fit in Firestore 1MB limit when base64 encoded
    maxWidthOrHeight: 1200,
    useWebWorker: true
  };
  
  let fileToUpload = file;
  if (file.size > 0.3 * 1024 * 1024) { 
    console.log(`Compressing image: ${file.name}...`);
    try {
      fileToUpload = await imageCompression(file, options);
    } catch (error) {
      console.error('Compression error:', error);
    }
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(fileToUpload);
  });
};

export const getBusinessProfile = async (userId: string): Promise<BusinessProfile | null> => {
  const path = `business_profiles/${userId}`;
  try {
    const docRef = doc(db, 'business_profiles', userId);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return { id: docSnap.id, ...docSnap.data() } as BusinessProfile;
    }
    return null;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
    return null;
  }
};

export const saveBusinessProfile = async (userId: string, profile: BusinessProfile) => {
  const path = `business_profiles/${userId}`;
  const cleanData = sanitizeData(profile);
  try {
    const docRef = doc(db, 'business_profiles', userId);
    await setDoc(docRef, { ...cleanData, updatedAt: Date.now() }, { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
};

export const getConnections = async (userId: string): Promise<Connection[]> => {
  const path = 'connections';
  try {
    const q1 = query(collection(db, path), where('fromUserId', '==', userId));
    const q2 = query(collection(db, path), where('toUserId', '==', userId));
    
    const [snap1, snap2] = await Promise.all([getDocs(q1), getDocs(q2)]);
    
    const connections: Connection[] = [];
    snap1.forEach(doc => connections.push({ id: doc.id, ...doc.data() } as Connection));
    snap2.forEach(doc => connections.push({ id: doc.id, ...doc.data() } as Connection));
    
    return connections;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
    return [];
  }
};

export const isGstUnique = async (gstNumber: string, currentUserId: string): Promise<boolean> => {
  const path = 'business_profiles';
  try {
    const q = query(collection(db, path), where('gstNumber', '==', gstNumber));
    const snapshot = await getDocs(q);
    // If any document exists with this GST number, check if it's the current user's document.
    // If it's a different user, it's not unique.
    return snapshot.docs.every(doc => doc.id === currentUserId);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
    return false;
  }
};

export const searchBusiness = async (queryStr: string): Promise<User[]> => {
  const path = 'users';
  try {
    // Search by mobile or username
    const q1 = query(collection(db, path), where('mobile', '==', queryStr));
    const q2 = query(collection(db, path), where('username', '==', queryStr));
    
    const [snap1, snap2] = await Promise.all([getDocs(q1), getDocs(q2)]);
    
    const users: User[] = [];
    snap1.forEach(doc => users.push({ id: doc.id, ...doc.data() } as User));
    snap2.forEach(doc => users.push({ id: doc.id, ...doc.data() } as User));
    
    return users;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
    return [];
  }
};

export const sendConnectionRequest = async (fromUserId: string, toUserId: string, fromProfile: any, toProfile: any) => {
  const path = 'connections';
  const connectionId = `${fromUserId}_${toUserId}`;
  const connection: Connection = {
    fromUserId,
    toUserId,
    status: 'pending',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    fromBusinessName: fromProfile.businessName,
    toBusinessName: toProfile.businessName,
    fromPhone: fromProfile.phone,
    toPhone: toProfile.phone
  };
  
  try {
    await setDoc(doc(db, path, connectionId), sanitizeData(connection));
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
};

export const updateConnectionStatus = async (connectionId: string, status: 'connected' | 'rejected') => {
  const path = `connections/${connectionId}`;
  try {
    await updateDoc(doc(db, 'connections', connectionId), {
      status,
      updatedAt: Date.now()
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
};

const FIRESTORE_TIMEOUT = 60000; // 60 seconds

export async function withTimeout<T>(promise: Promise<T>, operation: string): Promise<T> {
  let timeoutId: any;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutId = setTimeout(() => {
      console.error(`Operation timed out: ${operation}`);
      reject(new Error(`Firestore operation timed out: ${operation}`));
    }, FIRESTORE_TIMEOUT);
  });
  
  try {
    const result = await Promise.race([promise, timeoutPromise]);
    return result;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

export const getInventoryProducts = async (userId: string): Promise<Product[]> => {
  const path = 'products';
  try {
    const q = query(collection(db, path), where('userId', '==', userId));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Product));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
    return [];
  }
};

export const saveInventoryProduct = async (product: Product) => {
  const path = 'products';
  console.log(`Starting saveInventoryProduct for path: ${path}`, product);
  try {
    const cleanData = sanitizeData(product);
    if (product.id) {
      const docRef = doc(db, path, product.id);
      await withTimeout(
        setDoc(docRef, { ...cleanData, updatedAt: Date.now() }, { merge: true }),
        `WRITE ${path}/${product.id}`
      );
    } else {
      await withTimeout(
        addDoc(collection(db, path), { ...cleanData, updatedAt: Date.now() }),
        `CREATE ${path}`
      );
    }
    console.log(`Successfully saved inventory product to ${path}`);
  } catch (error) {
    console.error(`Error in saveInventoryProduct for ${path}:`, error);
    handleFirestoreError(error, OperationType.WRITE, path);
  }
};

export const deleteInventoryProduct = async (productId: string) => {
  const path = `products/${productId}`;
  console.log(`Starting deleteInventoryProduct for path: ${path}`);
  try {
    await withTimeout(
      deleteDoc(doc(db, 'products', productId)),
      `DELETE ${path}`
    );
    console.log(`Successfully deleted inventory product ${productId}`);
  } catch (error) {
    console.error(`Error in deleteInventoryProduct for ${path}:`, error);
    handleFirestoreError(error, OperationType.DELETE, path);
  }
};

export const getSellerProducts = async (sellerId: string): Promise<Product[]> => {
  const path = 'b2b_products';
  try {
    const q = query(collection(db, path), where('userId', '==', sellerId));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Product));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
    return [];
  }
};

export const saveProductFirestore = async (product: Product) => {
  const path = 'b2b_products';
  console.log(`Starting saveProductFirestore for path: ${path}`, product);
  try {
    const cleanData = sanitizeData(product);
    if (product.id) {
      const docRef = doc(db, path, product.id);
      await withTimeout(
        setDoc(docRef, { ...cleanData, updatedAt: Date.now() }, { merge: true }),
        `WRITE ${path}/${product.id}`
      );
    } else {
      await withTimeout(
        addDoc(collection(db, path), { ...cleanData, updatedAt: Date.now() }),
        `CREATE ${path}`
      );
    }
    console.log(`Successfully saved B2B product to ${path}`);
  } catch (error) {
    console.error(`Error in saveProductFirestore for ${path}:`, error);
    handleFirestoreError(error, OperationType.WRITE, path);
  }
};

export const deleteProductFirestore = async (productId: string) => {
  const path = `b2b_products/${productId}`;
  try {
    await deleteDoc(doc(db, 'b2b_products', productId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
};

export const discoverB2BProfiles = async (
  searchQuery?: string,
  category?: string,
  location?: string,
  minRating?: number,
  verifiedOnly?: boolean
): Promise<BusinessProfile[]> => {
  const path = 'business_profiles';
  try {
    let q = query(collection(db, path), limit(100));
    const querySnapshot = await getDocs(q);
    let profiles = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as BusinessProfile));
    
    // Enrich with calculated flags
    profiles = profiles.map(p => ({
      ...p,
      isFastResponder: p.avgResponseTime ? p.avgResponseTime < 2 * 60 * 60 * 1000 : false // < 2 hours
    }));

    if (searchQuery) {
      const lowerQuery = searchQuery.toLowerCase();
      profiles = profiles.filter(p => 
        p.businessName.toLowerCase().includes(lowerQuery) || 
        p.categories.some(c => c.toLowerCase().includes(lowerQuery)) ||
        p.gstNumber?.toLowerCase().includes(lowerQuery) ||
        p.city?.toLowerCase().includes(lowerQuery) ||
        p.state?.toLowerCase().includes(lowerQuery)
      );
      // Track search query
      trackSearchQuery(searchQuery);
    }

    if (category) {
      profiles = profiles.filter(p => p.categories.includes(category));
    }

    if (location) {
      const lowerLoc = location.toLowerCase();
      profiles = profiles.filter(p => 
        p.city?.toLowerCase().includes(lowerLoc) || 
        p.state?.toLowerCase().includes(lowerLoc)
      );
    }

    if (minRating !== undefined) {
      profiles = profiles.filter(p => (p.rating || 0) >= minRating);
    }

    if (verifiedOnly) {
      profiles = profiles.filter(p => p.verificationLevel === 'premium' || p.verificationLevel === 'gst_verified');
    }

    // Advanced Ranking Logic
    profiles.sort((a, b) => {
      const getScore = (p: BusinessProfile) => {
        let score = 0;
        // Verification Level
        if (p.verificationLevel === 'premium') score += 100;
        else if (p.verificationLevel === 'gst_verified') score += 50;
        else score += 10;

        // Response Rate
        score += (p.responseRate || 0) * 0.5;

        // Recent Activity (updated within 30 days)
        const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
        if (p.updatedAt > thirtyDaysAgo) score += 20;

        // Rating
        score += (p.rating || 0) * 20;

        // Top Rated / Fast Responder
        if (p.isTopRated) score += 30;
        if (p.isFastResponder) score += 20;

        return score;
      };

      return getScore(b) - getScore(a);
    });
    
    return profiles;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
    return [];
  }
};

export const placeB2BOrder = async (order: Omit<B2BOrder, 'id'>): Promise<string | undefined> => {
  const path = 'b2b_orders';
  try {
    const docRef = await addDoc(collection(db, path), sanitizeData(order));
    return docRef.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
    return undefined;
  }
};

export const getB2BOrders = async (userId: string, role: 'buyer' | 'seller'): Promise<B2BOrder[]> => {
  const path = 'b2b_orders';
  try {
    const field = role === 'buyer' ? 'buyerId' : 'sellerId';
    const q = query(collection(db, path), where(field, '==', userId), orderBy('createdAt', 'desc'));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as B2BOrder));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
    return [];
  }
};

export const updateB2BOrderStatus = async (orderId: string, status: B2BOrder['status']) => {
  const path = `b2b_orders/${orderId}`;
  try {
    const orderRef = doc(db, 'b2b_orders', orderId);
    const orderSnap = await getDoc(orderRef);
    
    if (orderSnap.exists()) {
      const order = orderSnap.data() as B2BOrder;
      const oldStatus = order.status;
      
      await updateDoc(orderRef, {
        status,
        updatedAt: Date.now()
      });

      // If order is delivered, increment seller's totalOrdersCompleted
      if (status === 'delivered' && oldStatus !== 'delivered') {
        const sellerProfileRef = doc(db, 'business_profiles', order.sellerId);
        const sellerProfileSnap = await getDoc(sellerProfileRef);
        if (sellerProfileSnap.exists()) {
          const profile = sellerProfileSnap.data() as BusinessProfile;
          await updateDoc(sellerProfileRef, {
            totalOrdersCompleted: (profile.totalOrdersCompleted || 0) + 1,
            updatedAt: Date.now()
          });
        }
      }
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
};

export const getInquiries = async (userId: string, role: 'buyer' | 'seller'): Promise<Inquiry[]> => {
  const path = 'inquiries';
  try {
    const field = role === 'buyer' ? 'buyerId' : 'sellerId';
    const q = query(collection(db, path), where(field, '==', userId), orderBy('createdAt', 'desc'));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Inquiry));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
    return [];
  }
};

export const subscribeToInquiries = (userId: string, role: 'buyer' | 'seller', callback: (inquiries: Inquiry[]) => void) => {
  const path = 'inquiries';
  const field = role === 'buyer' ? 'buyerId' : 'sellerId';
  const q = query(collection(db, path), where(field, '==', userId), orderBy('createdAt', 'desc'));
  
  return onSnapshot(q, (snapshot) => {
    const inquiries = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Inquiry));
    callback(inquiries);
  }, (error) => {
    handleFirestoreError(error, OperationType.LIST, path);
  });
};

export const sendInquiry = async (inquiry: Omit<Inquiry, 'id'>) => {
  const path = 'inquiries';
  try {
    const docRef = await addDoc(collection(db, path), sanitizeData(inquiry));
    
    // Update seller's total inquiries count and competition count if applicable
    const sellerProfileRef = doc(db, 'business_profiles', inquiry.sellerId);
    const sellerProfileSnap = await getDoc(sellerProfileRef);
    if (sellerProfileSnap.exists()) {
      const data = sellerProfileSnap.data();
      const updateData: any = {
        totalInquiries: (data.totalInquiries || 0) + 1,
        updatedAt: Date.now()
      };
      if (inquiry.competitionId) {
        updateData.competitionCount = (data.competitionCount || 0) + 1;
      }
      await updateDoc(sellerProfileRef, updateData);
    }
    return docRef.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
};

export const sendMultiSupplierInquiry = async (baseInquiry: Omit<Inquiry, 'id'>, otherSellers: { userId: string, businessName: string }[]) => {
  const competitionId = `comp_${Date.now()}_${baseInquiry.buyerId}`;
  const mainInquiry = { ...baseInquiry, competitionId };
  
  const promises = [sendInquiry(mainInquiry)];
  
  for (const seller of otherSellers) {
    if (seller.userId === baseInquiry.sellerId) continue;
    
    const competitorInquiry = {
      ...baseInquiry,
      sellerId: seller.userId,
      sellerBusinessName: seller.businessName,
      competitionId
    };
    promises.push(sendInquiry(competitorInquiry));
  }
  
  return Promise.all(promises);
};

export const getCompetitionInquiries = async (competitionId: string): Promise<Inquiry[]> => {
  const path = 'inquiries';
  try {
    const q = query(collection(db, path), where('competitionId', '==', competitionId));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Inquiry));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
    return [];
  }
};

export const markInquiryAsWinner = async (inquiryId: string) => {
  const path = `inquiries/${inquiryId}`;
  try {
    const inquiryRef = doc(db, 'inquiries', inquiryId);
    const inquirySnap = await getDoc(inquiryRef);
    
    if (inquirySnap.exists()) {
      const winningInquiry = inquirySnap.data() as Inquiry;
      const competitionId = winningInquiry.competitionId;
      
      const batch = writeBatch(db);
      
      // Mark this one as winner
      batch.update(inquiryRef, { isWinner: true, status: 'closed', updatedAt: Date.now() });
      
      // Update winner's stats
      const winnerProfileRef = doc(db, 'business_profiles', winningInquiry.sellerId);
      batch.update(winnerProfileRef, {
        inquiriesWon: increment(1),
        updatedAt: Date.now()
      });

      // If it's a competition, mark others as lost
      if (competitionId) {
        const q = query(collection(db, 'inquiries'), where('competitionId', '==', competitionId));
        const otherInquiries = await getDocs(q);
        
        for (const otherDoc of otherInquiries.docs) {
          if (otherDoc.id === inquiryId) continue;
          
          const otherInquiry = otherDoc.data() as Inquiry;
          batch.update(otherDoc.ref, { isWinner: false, status: 'closed', updatedAt: Date.now() });
          
          // Update loser's stats
          const loserProfileRef = doc(db, 'business_profiles', otherInquiry.sellerId);
          batch.update(loserProfileRef, {
            inquiriesLost: increment(1),
            updatedAt: Date.now()
          });
        }
      }
      
      await batch.commit();
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
};

export const markInquiryAsViewed = async (inquiryId: string) => {
  const path = `inquiries/${inquiryId}`;
  try {
    const inquiryRef = doc(db, 'inquiries', inquiryId);
    const inquirySnap = await getDoc(inquiryRef);
    if (inquirySnap.exists()) {
      const inquiry = inquirySnap.data() as Inquiry;
      if (inquiry.status === 'new') {
        await updateDoc(inquiryRef, {
          status: 'viewed',
          updatedAt: Date.now()
        });
      }
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
};

export const updateInquiryStatus = async (inquiryId: string, status: Inquiry['status'], replyMessage?: string) => {
  const path = `inquiries/${inquiryId}`;
  try {
    const updateData: any = {
      status,
      updatedAt: Date.now()
    };
    if (replyMessage !== undefined) {
      updateData.replyMessage = replyMessage;
    }
    await updateDoc(doc(db, 'inquiries', inquiryId), updateData);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
};

export const submitInquiryQuote = async (inquiryId: string, quote: { price: number, quantity: number, deliveryTime: string }, message?: any) => {
  const path = `inquiries/${inquiryId}`;
  try {
    const updateData: any = {
      priceQuote: quote.price,
      quoteQuantity: quote.quantity,
      deliveryTime: quote.deliveryTime,
      quoteStatus: 'pending',
      status: 'responded',
      updatedAt: Date.now()
    };

    if (message) {
      updateData.messages = arrayUnion(message);
    }

    await updateDoc(doc(db, 'inquiries', inquiryId), updateData);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
};

export const updateQuoteStatus = async (inquiryId: string, status: 'accepted' | 'rejected' | 'negotiating') => {
  const path = `inquiries/${inquiryId}`;
  try {
    const inquiryRef = doc(db, 'inquiries', inquiryId);
    const inquirySnap = await getDoc(inquiryRef);
    
    if (inquirySnap.exists()) {
      const inquiry = inquirySnap.data() as Inquiry;
      
      await updateDoc(inquiryRef, {
        quoteStatus: status,
        updatedAt: Date.now()
      });
      
      if (status === 'accepted') {
        await createOrderFromInquiry({ ...inquiry, id: inquiryId, quoteStatus: status });
      }
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
};

export const createOrderFromInquiry = async (inquiry: Inquiry) => {
  const path = 'b2b_orders';
  try {
    const order: Omit<B2BOrder, 'id'> = {
      buyerId: inquiry.buyerId,
      sellerId: inquiry.sellerId,
      inquiryId: inquiry.id,
      buyerBusinessName: inquiry.buyerBusinessName,
      sellerBusinessName: inquiry.sellerBusinessName,
      items: [{
        productId: inquiry.productId,
        name: inquiry.productName,
        quantity: inquiry.quoteQuantity || inquiry.quantity,
        price: inquiry.priceQuote || 0,
        costPrice: 0,
        total: (inquiry.priceQuote || 0) * (inquiry.quoteQuantity || inquiry.quantity)
      }],
      status: 'pending',
      totalAmount: (inquiry.priceQuote || 0) * (inquiry.quoteQuantity || inquiry.quantity),
      deliveryTime: inquiry.deliveryTime,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    
    const orderRef = await addDoc(collection(db, path), sanitizeData(order));
    
    // Update inquiry status to closed
    await updateDoc(doc(db, 'inquiries', inquiry.id!), {
      status: 'closed',
      updatedAt: Date.now()
    });

    // Update conversion stats
    await updateConversionStats(inquiry.sellerId);
    
    return orderRef.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
};

export const updateConversionStats = async (sellerId: string) => {
  const path = `business_profiles/${sellerId}`;
  try {
    const profileRef = doc(db, 'business_profiles', sellerId);
    const profileSnap = await getDoc(profileRef);
    
    if (profileSnap.exists()) {
      const profile = profileSnap.data() as BusinessProfile;
      
      // Get all inquiries for this seller
      const inquiriesQ = query(collection(db, 'inquiries'), where('sellerId', '==', sellerId));
      const inquiriesSnap = await getDocs(inquiriesQ);
      const totalInquiries = inquiriesSnap.size;
      
      // Get all orders for this seller that came from inquiries
      const ordersQ = query(collection(db, 'b2b_orders'), where('sellerId', '==', sellerId));
      const ordersSnap = await getDocs(ordersQ);
      const ordersFromInquiries = ordersSnap.docs.filter(doc => doc.data().inquiryId);
      const totalOrdersFromInquiries = ordersFromInquiries.length;
      
      const conversionRate = totalInquiries > 0 ? (totalOrdersFromInquiries / totalInquiries) * 100 : 0;
      
      await updateDoc(profileRef, {
        totalInquiries: totalInquiries,
        totalOrders: totalOrdersFromInquiries,
        orderConversionRate: conversionRate,
        updatedAt: Date.now()
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
};

export const addInquiryMessage = async (inquiryId: string, message: import('../db').InquiryMessage, newStatus: Inquiry['status'], priceQuote?: number) => {
  const path = `inquiries/${inquiryId}`;
  try {
    const inquiryRef = doc(db, 'inquiries', inquiryId);
    const inquirySnap = await getDoc(inquiryRef);
    
    if (inquirySnap.exists()) {
      const inquiry = inquirySnap.data() as Inquiry;
      const isFirstSellerResponse = message.senderId === inquiry.sellerId && 
                                   (!inquiry.messages || !inquiry.messages.some(m => m.senderId === inquiry.sellerId));

      const updateData: any = {
        messages: arrayUnion(message),
        updatedAt: Date.now(),
        status: newStatus
      };

      if (priceQuote !== undefined) {
        updateData.priceQuote = priceQuote;
      }

      await updateDoc(inquiryRef, updateData);

      if (isFirstSellerResponse) {
        // Update seller performance stats
        const sellerProfileRef = doc(db, 'business_profiles', inquiry.sellerId);
        const sellerProfileSnap = await getDoc(sellerProfileRef);
        if (sellerProfileSnap.exists()) {
          const profile = sellerProfileSnap.data();
          const responseTime = message.timestamp - inquiry.createdAt;
          
          const totalResponded = (profile.respondedInquiries || 0) + 1;
          const totalInquiries = profile.totalInquiries || 1;
          const currentAvgTime = profile.avgResponseTime || 0;
          
          const newAvgTime = currentAvgTime === 0 ? responseTime : (currentAvgTime * (totalResponded - 1) + responseTime) / totalResponded;
          const newResponseRate = (totalResponded / totalInquiries) * 100;
          
          // Fast Responder if avg response time < 2 hours
          const isFastResponder = newAvgTime < (2 * 60 * 60 * 1000);

          await updateDoc(sellerProfileRef, {
            respondedInquiries: totalResponded,
            avgResponseTime: newAvgTime,
            responseRate: newResponseRate,
            isFastResponder,
            updatedAt: Date.now()
          });
        }
      }
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
};

export const addSupplierReview = async (review: Omit<Review, 'id'>) => {
  const path = 'reviews';
  try {
    const batch = writeBatch(db);
    const reviewRef = doc(collection(db, path));
    batch.set(reviewRef, sanitizeData(review));

    // Update seller profile with new rating
    const sellerProfileRef = doc(db, 'business_profiles', review.sellerId);
    const sellerProfileSnap = await getDoc(sellerProfileRef);
    
    if (sellerProfileSnap.exists()) {
      const profile = sellerProfileSnap.data() as BusinessProfile;
      const totalRatings = (profile.totalRatings || 0) + 1;
      const currentRating = profile.rating || 0;
      const newRating = ((currentRating * (totalRatings - 1)) + review.rating) / totalRatings;
      
      // Determine if Top Rated (e.g., rating > 4.5 and totalRatings > 5)
      const isTopRated = newRating >= 4.5 && totalRatings >= 5;

      batch.update(sellerProfileRef, {
        rating: newRating,
        totalRatings: totalRatings,
        isTopRated,
        updatedAt: Date.now()
      });
    }

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
};

export const getSupplierReviews = async (sellerId: string): Promise<Review[]> => {
  const path = 'reviews';
  try {
    const q = query(collection(db, path), where('sellerId', '==', sellerId), orderBy('createdAt', 'desc'));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Review));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
    return [];
  }
};

export const discoverBusinesses = async (searchQuery?: string, category?: string): Promise<Profile[]> => {
  const path = 'profiles';
  try {
    let q = query(collection(db, path), limit(50));
    const querySnapshot = await getDocs(q);
    let profiles = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as unknown as Profile));
    
    if (category) {
      profiles = profiles.filter(p => p.category === category);
    }
    
    if (searchQuery) {
      const lowerQuery = searchQuery.toLowerCase();
      profiles = profiles.filter(p => 
        p.businessName.toLowerCase().includes(lowerQuery) || 
        p.category?.toLowerCase().includes(lowerQuery) ||
        p.gstin?.toLowerCase().includes(lowerQuery)
      );
    }
    
    return profiles;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
    return [];
  }
};

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export const saveInvoicesBatch = async (userId: string, invoices: Invoice[]) => {
  const path = 'invoices';
  try {
    const batch = writeBatch(db);
    invoices.forEach(invoice => {
      const docRef = doc(collection(db, path));
      batch.set(docRef, { ...sanitizeData(invoice), userId, updatedAt: Date.now() });
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
};

export const savePaymentsBatch = async (userId: string, payments: Payment[]) => {
  const path = 'payments';
  try {
    const batch = writeBatch(db);
    payments.forEach(payment => {
      const docRef = doc(collection(db, path));
      batch.set(docRef, { ...sanitizeData(payment), userId, updatedAt: Date.now() });
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
};

export const deleteBusinessData = async (userId: string) => {
  const collectionsToDelete = [
    'profiles',
    'business_profiles',
    'products',
    'b2b_products',
    'invoices',
    'payments',
    'expenses',
    'staff',
    'roles'
  ];

  try {
    const batch = writeBatch(db);

    // Delete simple userId based collections
    for (const colName of collectionsToDelete) {
      const q = query(collection(db, colName), where('userId', '==', userId));
      const snapshot = await getDocs(q);
      snapshot.forEach(doc => batch.delete(doc.ref));
    }

    // Delete connections
    const connQ1 = query(collection(db, 'connections'), where('fromUserId', '==', userId));
    const connQ2 = query(collection(db, 'connections'), where('toUserId', '==', userId));
    const [connSnap1, connSnap2] = await Promise.all([getDocs(connQ1), getDocs(connQ2)]);
    connSnap1.forEach(doc => batch.delete(doc.ref));
    connSnap2.forEach(doc => batch.delete(doc.ref));

    // Delete inquiries
    const inqQ1 = query(collection(db, 'inquiries'), where('buyerId', '==', userId));
    const inqQ2 = query(collection(db, 'inquiries'), where('sellerId', '==', userId));
    const [inqSnap1, inqSnap2] = await Promise.all([getDocs(inqQ1), getDocs(inqQ2)]);
    inqSnap1.forEach(doc => batch.delete(doc.ref));
    inqSnap2.forEach(doc => batch.delete(doc.ref));

    // Delete orders
    const ordQ1 = query(collection(db, 'b2b_orders'), where('buyerId', '==', userId));
    const ordQ2 = query(collection(db, 'b2b_orders'), where('sellerId', '==', userId));
    const [ordSnap1, ordSnap2] = await Promise.all([getDocs(ordQ1), getDocs(ordQ2)]);
    ordSnap1.forEach(doc => batch.delete(doc.ref));
    ordSnap2.forEach(doc => batch.delete(doc.ref));

    await batch.commit();
  } catch (error) {
    console.error('Error deleting business data:', error);
    throw error;
  }
};

function sanitizeData(data: any) {
  return Object.fromEntries(
    Object.entries(data).filter(([_, v]) => v !== undefined)
  );
}

export interface Profile {
  userId: string;
  businessName: string;
  ownerName: string;
  email: string;
  phone: string;
  address: string;
  gstin?: string;
  state?: string;
  logo?: string;
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

export const getProfile = async (userId: string): Promise<Profile | null> => {
  const docRef = doc(db, 'profiles', userId);
  try {
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return docSnap.data() as Profile;
    }
    return null;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `profiles/${userId}`);
    return null;
  }
};

export const saveProfile = async (userId: string, profile: Profile) => {
  const docRef = doc(db, 'profiles', userId);
  const cleanData = sanitizeData(profile);
  try {
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      await updateDoc(docRef, cleanData);
    } else {
      await setDoc(docRef, cleanData);
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `profiles/${userId}`);
  }
};

export const getInvoices = async (userId: string): Promise<Invoice[]> => {
  const path = 'invoices';
  try {
    const q = query(collection(db, path), where('userId', '==', userId));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Invoice));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
    return [];
  }
};

export const addPayment = async (payment: Omit<Payment, 'id'>) => {
  const path = 'payments';
  const cleanData = sanitizeData(payment);
  try {
    const colRef = collection(db, path);
    await addDoc(colRef, cleanData);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
};

export const getPayments = async (userId: string): Promise<Payment[]> => {
  const path = 'payments';
  try {
    const q = query(collection(db, path), where('userId', '==', userId));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Payment));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
    return [];
  }
};

export const getInvoice = async (invoiceId: string): Promise<Invoice | null> => {
  const path = `invoices/${invoiceId}`;
  try {
    const docRef = doc(db, 'invoices', invoiceId);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return { id: docSnap.id, ...docSnap.data() } as Invoice;
    }
    return null;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
    return null;
  }
};

export const updateInvoice = async (invoiceId: string, data: Partial<Invoice>) => {
  const path = `invoices/${invoiceId}`;
  const cleanData = sanitizeData(data);
  try {
    const docRef = doc(db, 'invoices', invoiceId);
    await updateDoc(docRef, cleanData);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
};

export const discoverProducts = async (
  searchQuery?: string, 
  category?: string, 
  minPrice?: number, 
  maxPrice?: number,
  location?: string,
  minRating?: number,
  verifiedOnly?: boolean
): Promise<(Product & { businessName?: string, city?: string, state?: string, sellerProfile?: BusinessProfile })[]> => {
  const path = 'b2b_products';
  try {
    let q = query(collection(db, path), where('isPublic', '==', true), limit(200));
    const querySnapshot = await getDocs(q);
    let products = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Product));
    
    // Fetch business profiles for all products to filter by location
    const userIds = [...new Set(products.map(p => p.userId))];
    const profiles = await Promise.all(userIds.map(id => getBusinessProfile(id)));
    const profileMap = Object.fromEntries(profiles.filter(p => p !== null).map(p => [p!.userId, p!]));

    // Apply filters client-side
    let filteredProducts = products.map(p => ({
      ...p,
      businessName: profileMap[p.userId]?.businessName || 'Unknown Business',
      city: profileMap[p.userId]?.city,
      state: profileMap[p.userId]?.state,
      sellerProfile: profileMap[p.userId]
    }));

    if (searchQuery) {
      const lowerQuery = searchQuery.toLowerCase();
      filteredProducts = filteredProducts.filter(p => 
        p.name.toLowerCase().includes(lowerQuery) || 
        p.category.toLowerCase().includes(lowerQuery) ||
        p.description?.toLowerCase().includes(lowerQuery) ||
        p.keywords?.some(k => k.toLowerCase().includes(lowerQuery))
      );
      // Track search query
      trackSearchQuery(searchQuery);
    }

    if (category) {
      filteredProducts = filteredProducts.filter(p => p.category === category);
    }

    if (minPrice !== undefined) {
      filteredProducts = filteredProducts.filter(p => p.price >= minPrice);
    }

    if (maxPrice !== undefined) {
      filteredProducts = filteredProducts.filter(p => p.price <= maxPrice);
    }

    if (location) {
      const lowerLoc = location.toLowerCase();
      filteredProducts = filteredProducts.filter(p => 
        p.city?.toLowerCase().includes(lowerLoc) || 
        p.state?.toLowerCase().includes(lowerLoc)
      );
    }

    if (minRating !== undefined) {
      filteredProducts = filteredProducts.filter(p => (p.sellerProfile?.rating || 0) >= minRating);
    }

    if (verifiedOnly) {
      filteredProducts = filteredProducts.filter(p => 
        p.sellerProfile?.verificationLevel === 'premium' || 
        p.sellerProfile?.verificationLevel === 'gst_verified'
      );
    }

    // Advanced Ranking Logic
    filteredProducts.sort((a, b) => {
      const getScore = (p: Product & { sellerProfile?: BusinessProfile }) => {
        let score = 0;
        const profile = p.sellerProfile;
        
        if (profile) {
          // Verification Level
          if (profile.verificationLevel === 'premium') score += 100;
          else if (profile.verificationLevel === 'gst_verified') score += 50;
          else score += 10;

          // Response Rate
          score += (profile.responseRate || 0) * 0.5;

          // Rating
          score += (profile.rating || 0) * 20;

          // Top Rated / Fast Responder
          if (profile.isTopRated) score += 30;
          if (profile.isFastResponder) score += 20;
        }

        // Product Quality Score
        score += (p.qualityScore || 0) * 0.5;
        if (p.isHighQuality) score += 50;

        // Product Completeness
        if (p.imageUrl) score += 15;
        if (p.description && p.description.length > 50) score += 15;
        if (p.price > 0) score += 10;
        if (p.moq && p.moq > 0) score += 10;
        if (p.tags && p.tags.length > 0) score += 5;
        if (p.bulkPricing && p.bulkPricing.length > 0) score += 10;

        // Recent Activity (updated within 30 days)
        const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
        if (p.updatedAt > thirtyDaysAgo) score += 20;

        return score;
      };

      return getScore(b) - getScore(a);
    });

    return filteredProducts;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
    return [];
  }
};

export const trackSearchQuery = async (queryText: string) => {
  if (!queryText || queryText.length < 3) return;
  const path = 'popular_searches';
  try {
    const lowerQuery = queryText.toLowerCase().trim();
    const q = query(collection(db, path), where('query', '==', lowerQuery), limit(1));
    const querySnapshot = await getDocs(q);
    
    if (!querySnapshot.empty) {
      const docRef = doc(db, path, querySnapshot.docs[0].id);
      await updateDoc(docRef, {
        count: increment(1),
        lastSearched: Date.now()
      });
    } else {
      await addDoc(collection(db, path), {
        query: lowerQuery,
        count: 1,
        lastSearched: Date.now()
      });
    }
  } catch (error) {
    console.error('Error tracking search query:', error);
  }
};

export const getPopularSearches = async (limitCount: number = 5): Promise<PopularSearch[]> => {
  const path = 'popular_searches';
  try {
    const q = query(collection(db, path), orderBy('count', 'desc'), limit(limitCount));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PopularSearch));
  } catch (error) {
    console.error('Error getting popular searches:', error);
    return [];
  }
};

export const getSearchSuggestions = async (partialQuery: string): Promise<string[]> => {
  if (!partialQuery || partialQuery.length < 2) return [];
  const path = 'b2b_products';
  try {
    const lowerQuery = partialQuery.toLowerCase();
    // In a real app, we'd use a search index. Here we do a limited fetch and filter.
    const q = query(collection(db, path), where('isPublic', '==', true), limit(50));
    const querySnapshot = await getDocs(q);
    const names = querySnapshot.docs
      .map(doc => (doc.data() as Product).name)
      .filter(name => name.toLowerCase().includes(lowerQuery));
    
    const categories = querySnapshot.docs
      .map(doc => (doc.data() as Product).category)
      .filter(cat => cat.toLowerCase().includes(lowerQuery));

    return [...new Set([...names, ...categories])].slice(0, 8);
  } catch (error) {
    console.error('Error getting search suggestions:', error);
    return [];
  }
};

export const getUser = async (userId: string): Promise<User | null> => {
  const path = `users/${userId}`;
  try {
    const docRef = doc(db, 'users', userId);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return { id: docSnap.id, ...docSnap.data() } as User;
    }
    return null;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
    return null;
  }
};

export const saveUser = async (userId: string, userData: Partial<User>) => {
  const path = `users/${userId}`;
  const cleanData = sanitizeData(userData);
  try {
    const docRef = doc(db, 'users', userId);
    await setDoc(docRef, cleanData, { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
};

export const findStaffByEmail = async (email: string): Promise<Staff | null> => {
  const path = 'staff';
  try {
    const q = query(collection(db, path), where('email', '==', email));
    const snapshot = await getDocs(q);
    if (!snapshot.empty) {
      return { id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as Staff;
    }
    return null;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
    return null;
  }
};

export const getExpenses = async (userId: string): Promise<Expense[]> => {
  const path = 'expenses';
  try {
    const q = query(collection(db, path), where('userId', '==', userId));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Expense));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
    return [];
  }
};

export const saveExpense = async (expense: Expense) => {
  const path = 'expenses';
  try {
    const cleanData = sanitizeData(expense);
    if (expense.id) {
      await updateDoc(doc(db, path, expense.id), cleanData);
    } else {
      await addDoc(collection(db, path), cleanData);
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
};

export const deleteExpense = async (expenseId: string) => {
  const path = `expenses/${expenseId}`;
  try {
    await deleteDoc(doc(db, 'expenses', expenseId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
};

export const getStaff = async (userId: string): Promise<Staff[]> => {
  const path = 'staff';
  try {
    const q = query(collection(db, path), where('userId', '==', userId));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Staff));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
    return [];
  }
};

export const saveStaff = async (staff: Staff) => {
  const path = 'staff';
  try {
    const cleanData = sanitizeData(staff);
    if (staff.id) {
      await updateDoc(doc(db, path, staff.id), { ...cleanData, updatedAt: Date.now() });
    } else {
      await addDoc(collection(db, path), { ...cleanData, createdAt: Date.now(), updatedAt: Date.now() });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
};

export const deactivateStaff = async (staffId: string) => {
  const path = `staff/${staffId}`;
  try {
    await updateDoc(doc(db, 'staff', staffId), { status: 'inactive' });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
};
