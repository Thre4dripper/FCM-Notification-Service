import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { throwIfMissing, sendPushNotification } from './utils.js';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key',
};

throwIfMissing(process.env, ['FCM_PROJECT_ID', 'FCM_PRIVATE_KEY', 'FCM_CLIENT_EMAIL', 'API_SECRET']);
console.log('[init] Module loaded, env vars validated');

function isAuthorized(event: APIGatewayProxyEvent): boolean {
  const headers = event.headers ?? {};
  console.log('[auth] Received header keys:', JSON.stringify(Object.keys(headers)));
  const authHeader = headers['authorization'] ?? headers['Authorization'] ?? '';
  console.log('[auth] Authorization header present:', authHeader.length > 0);
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const match = token === process.env.API_SECRET;
  console.log('[auth] Token match:', match);
  return match;
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  console.log('[handler] Method:', event.httpMethod, '| Path:', event.path);

  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    console.log('[handler] CORS preflight — returning 204');
    return { statusCode: 204, headers: CORS_HEADERS, body: '' };
  }

  if (!isAuthorized(event)) {
    console.warn('[handler] Unauthorized request');
    return {
      statusCode: 401,
      headers: CORS_HEADERS,
      body: JSON.stringify({ ok: false, error: 'Unauthorized' }),
    };
  }

  console.log('[handler] Authorized');

  let body: { deviceToken?: string; data?: Record<string, string> };

  try {
    body = JSON.parse(event.body ?? '{}');
    console.log('[handler] Body parsed, deviceToken present:', !!body.deviceToken);
  } catch {
    console.error('[handler] Failed to parse JSON body');
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ ok: false, error: 'Invalid JSON body' }),
    };
  }

  try {
    throwIfMissing(body, ['deviceToken', 'data']);
  } catch (err: any) {
    console.error('[handler] Missing required fields:', err.message);
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ ok: false, error: err.message }),
    };
  }

  console.log('[handler] Sending FCM to device:', body.deviceToken);

  try {
    const response = await sendPushNotification({
      data: body.data ?? {},
      token: body.deviceToken!,
    });

    console.log('[handler] FCM success, messageId:', response);
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({ ok: true, messageId: response }),
    };
  } catch (e: any) {
    console.error('[handler] FCM send failed:', e.message ?? e);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ ok: false, error: 'Failed to send the message' }),
    };
  }
};