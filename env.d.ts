declare global {
  namespace NodeJS {
    interface ProcessEnv {
      FCM_PROJECT_ID: string;
      FCM_PRIVATE_KEY: string;
      FCM_CLIENT_EMAIL: string;
      API_SECRET: string;
    }
  }
}

export {};
