import { throwIfMissing, sendPushNotification } from './utils.js';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

type Context = {
  req: {
    method: string;
    bodyJson: {
      deviceToken: string;
      data: Record<string, any>;
    };
  };
  res: {
    json: (body: any, status?: number, headers?: Record<string, string>) => void;
    send: (body: string, status?: number, headers?: Record<string, string>) => void;
  };
  log: (msg: any) => void;
  error: (msg: any) => void;
};

throwIfMissing(process.env, ['FCM_PROJECT_ID', 'FCM_PRIVATE_KEY', 'FCM_CLIENT_EMAIL']);

export default async ({ req, res, log, error }: Context) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return res.send('', 204, CORS_HEADERS);
  }

  try {
    throwIfMissing(req.bodyJson, ['deviceToken', 'data']);
  } catch (err: any) {
    return res.json({ ok: false, error: err.message }, 400, CORS_HEADERS);
  }

  log(`Sending message to device: ${req.bodyJson.deviceToken}`);

  try {
    const response = await sendPushNotification({
      data: req.bodyJson.data ?? {},
      token: req.bodyJson.deviceToken,
    });

    log(`Successfully sent message: ${response}`);
    return res.json({ ok: true, messageId: response }, 200, CORS_HEADERS);
  } catch (e: any) {
    error(e);
    return res.json({ ok: false, error: 'Failed to send the message' }, 500, CORS_HEADERS);
  }
};