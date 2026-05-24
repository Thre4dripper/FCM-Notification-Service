import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { throwIfMissing, sendPushNotification } from './utils.js';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

throwIfMissing(process.env, ['FCM_PROJECT_ID', 'FCM_PRIVATE_KEY', 'FCM_CLIENT_EMAIL']);

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS_HEADERS, body: '' };
  }

  let body: { deviceToken?: string; data?: Record<string, string> };

  try {
    body = JSON.parse(event.body ?? '{}');
  } catch {
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ ok: false, error: 'Invalid JSON body' }),
    };
  }

  try {
    throwIfMissing(body, ['deviceToken', 'data']);
  } catch (err: any) {
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ ok: false, error: err.message }),
    };
  }

  console.log(`Sending message to device: ${body.deviceToken}`);

  try {
    const response = await sendPushNotification({
      data: body.data ?? {},
      token: body.deviceToken!,
    });

    console.log(`Successfully sent message: ${response}`);
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({ ok: true, messageId: response }),
    };
  } catch (e: any) {
    console.error(e);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ ok: false, error: 'Failed to send the message' }),
    };
  }
};