import { db } from '../lib/firebase';
import { collection, addDoc, query, where, orderBy, getDocs, updateDoc, doc, onSnapshot } from 'firebase/firestore';
import { Notification } from '../db';
import { OperationType, handleFirestoreError } from '../lib/firestore';

const COLLECTION_NAME = 'notifications';

export const createNotification = async (
  userId: string,
  title: string,
  message: string,
  type: Notification['type'],
  relatedId?: string
) => {
  const path = COLLECTION_NAME;
  try {
    const newNotification: Omit<Notification, 'id'> = {
      userId,
      title,
      message,
      type,
      relatedId,
      isRead: false,
      createdAt: Date.now(),
    };
    
    // Clean undefined values
    const cleanData = Object.fromEntries(
      Object.entries(newNotification).filter(([_, v]) => v !== undefined)
    );

    await addDoc(collection(db, path), cleanData);
  } catch (error) {
    // We don't have handleFirestoreError exported from firestore.ts, so we'll just log it for now
    // or we can export it from firestore.ts
    console.error('Error creating notification:', error);
  }
};

export const getNotifications = async (userId: string): Promise<Notification[]> => {
  const path = COLLECTION_NAME;
  try {
    const q = query(
      collection(db, path),
      where('userId', '==', userId),
      orderBy('createdAt', 'desc')
    );
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Notification));
  } catch (error) {
    console.error('Error getting notifications:', error);
    return [];
  }
};

export const subscribeToNotifications = (userId: string, callback: (notifications: Notification[]) => void) => {
  const path = COLLECTION_NAME;
  const q = query(
    collection(db, path),
    where('userId', '==', userId),
    orderBy('createdAt', 'desc')
  );
  
  return onSnapshot(q, (snapshot) => {
    const notifications = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Notification));
    callback(notifications);
  }, (error) => {
    console.error('Error subscribing to notifications:', error);
  });
};

export const markAsRead = async (notificationId: string) => {
  const path = `${COLLECTION_NAME}/${notificationId}`;
  try {
    const docRef = doc(db, COLLECTION_NAME, notificationId);
    await updateDoc(docRef, { isRead: true });
  } catch (error) {
    console.error('Error marking notification as read:', error);
  }
};

export const markAllAsRead = async (userId: string) => {
  const path = COLLECTION_NAME;
  try {
    const q = query(
      collection(db, path),
      where('userId', '==', userId),
      where('isRead', '==', false)
    );
    const querySnapshot = await getDocs(q);
    
    const promises = querySnapshot.docs.map(document => 
      updateDoc(doc(db, COLLECTION_NAME, document.id), { isRead: true })
    );
    
    await Promise.all(promises);
  } catch (error) {
    console.error('Error marking all notifications as read:', error);
  }
};
