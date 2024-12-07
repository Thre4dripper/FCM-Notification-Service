import { throwIfMissing, sendPushNotification } from './utils.js';

type Context = {
  req: {
    bodyJson: {
      deviceToken: string;
      data: Record<string, any>;
    };
  };
  res: {
    json: (body: any, status?: number) => void;
  };
  log: (msg: any) => void;
  error: (msg: any) => void;
};

throwIfMissing(process.env, [
  'FCM_PROJECT_ID',
  'FCM_PRIVATE_KEY',
  'FCM_CLIENT_EMAIL',
]);

export default async ({ req, res, log, error }: Context) => {
  try {
    throwIfMissing(req.bodyJson, ['deviceToken', 'data']);
  } catch (err: any) {
    return res.json({ ok: false, error: err.message }, 400);
  }

  log(`Sending message to device: ${req.bodyJson.deviceToken}`);

  try {
    const response = await sendPushNotification({
      data: req.bodyJson.data ?? {},
      token: req.bodyJson.deviceToken,
    });

    log(`Successfully sent message: ${response}`);

    return res.json({ ok: true, messageId: response });
  } catch (e: any) {
    error(e);
    return res.json({ ok: false, error: 'Failed to send the message' }, 500);
  }
};
