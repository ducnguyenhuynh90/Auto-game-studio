/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ANALYTICS_URL?: string;
  /** Google Analytics 4 Measurement ID (G-XXXXXXX); empty = no GA (docs/ANALYTICS.md). */
  readonly VITE_GA_MEASUREMENT_ID?: string;
  /** 'ask' (default): players are asked once; 'granted': no prompt (founder/legal decision). */
  readonly VITE_GA_CONSENT?: 'ask' | 'granted';
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly VITE_FIREBASE_API_KEY?: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN?: string;
  readonly VITE_FIREBASE_PROJECT_ID?: string;
  readonly VITE_FIREBASE_APP_ID?: string;
}
