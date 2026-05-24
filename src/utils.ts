// dotenv is only used for local development; Lambda env vars are set in the console
import { config } from 'dotenv';
config();
import admin from 'firebase-admin';

export function throwIfMissing(obj: Record<string, any>, keys: string[]): void {
  const missing: string[] = [];
  for (const key of keys) {
    if (!(key in obj) || !obj[key]) {
      missing.push(key);
    }
  }
  if (missing.length > 0) {
    throw new Error(`Missing required fields: ${missing.join(', ')}`);
  }
}

// Firebase Admin is initialized once per Lambda container (warm starts reuse this)
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FCM_PROJECT_ID,
      clientEmail: process.env.FCM_CLIENT_EMAIL,
      // Lambda env vars store \n as a literal backslash-n — replace it back
      privateKey: process.env.FCM_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}

export async function sendPushNotification(
  payload: admin.messaging.Message
): Promise<string> {
  try {
    return await admin.messaging().send(payload);
  } catch (e) {
    console.error(e);
    throw new Error('error on messaging');
  }
}
