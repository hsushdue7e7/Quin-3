import { db } from './firebase';
import { collection, query, where, getDocs, addDoc, deleteDoc, doc, Timestamp } from 'firebase/firestore';

const MAX_DEVICES = 10;

export async function checkAndRegisterDevice(userId: string, deviceId: string) {
  const sessionsRef = collection(db, 'userSessions');
  const q = query(sessionsRef, where('userId', '==', userId));
  const querySnapshot = await getDocs(q);
  
  if (querySnapshot.size >= MAX_DEVICES) {
    // Check if current device is already registered
    const isRegistered = querySnapshot.docs.some(doc => doc.data().deviceId === deviceId);
    if (!isRegistered) {
      throw new Error(`Device limit reached. You are logged in on ${MAX_DEVICES} devices.`);
    }
  }

  // Register device
  await addDoc(sessionsRef, {
    userId,
    deviceId,
    lastActive: Timestamp.now()
  });
}

export async function unregisterDevice(userId: string, deviceId: string) {
  const sessionsRef = collection(db, 'userSessions');
  const q = query(sessionsRef, where('userId', '==', userId), where('deviceId', '==', deviceId));
  const querySnapshot = await getDocs(q);
  
  querySnapshot.forEach(async (d) => {
    await deleteDoc(doc(db, 'userSessions', d.id));
  });
}
