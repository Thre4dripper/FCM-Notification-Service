import { config } from 'dotenv';
config();
import admin from 'firebase-admin';
throwIfMissing(process.env, [
  'FCM_PROJECT_ID',
  'FCM_PRIVATE_KEY',
  'FCM_CLIENT_EMAIL',
]);

// initialize firebase app
admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.FCM_PROJECT_ID,
    clientEmail: process.env.FCM_CLIENT_EMAIL,
    privateKey: process.env.FCM_PRIVATE_KEY,
  }),
});
/**
 * Throws an error if any of the keys are missing from the object
 * @param {*} obj
 * @param {string[]} keys
 * @throws {Error}
 */
export function throwIfMissing(obj, keys) {
  const missing = [];
  for (let key of keys) {
    if (!(key in obj) || !obj[key]) {
      missing.push(key);
    }
  }
  if (missing.length > 0) {
    throw new Error(`Missing required fields: ${missing.join(', ')}`);
  }
}

/**
 * @param {admin.messaging.Message} payload
 * @returns {Promise<string>}
 */
export async function sendPushNotification(payload) {
  try {
    return await admin.messaging().send(payload);
  } catch (e) {
    console.error(e);
    throw new Error("error on messaging ");
  }
}
