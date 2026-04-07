/**
 * Auth Module for Platform SDK
 * Handles dynamic login and maintains the unified Access Token.
 */
import { loadGis } from './core';

// Scopes required for all the unified services
const OMNI_SCOPES = [
  'https://www.googleapis.com/auth/tasks',
  'https://www.googleapis.com/auth/youtube.readonly',
  'https://www.googleapis.com/auth/drive', // Full access to all files
  'https://www.googleapis.com/auth/gmail.modify', // Read, send, and trash
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/documents', // Specifically for Google Docs
];

interface TokenResponse {
  access_token: string;
  expires_in: number;
  scope: string;
}

class GoogleAuthManager {
  private static instance: GoogleAuthManager;
  private tokenClient: any = null;
  private currentToken: string | null = localStorage.getItem('omni_access_token');
  private clientId: string = (import.meta as any).env.VITE_GOOGLE_CLIENT_ID || '437211221154-mmtmoo9m4l4o3m5kilejpiaj05nobkhk.apps.googleusercontent.com';

  private constructor() {}

  public static getInstance(): GoogleAuthManager {
    if (!GoogleAuthManager.instance) {
      GoogleAuthManager.instance = new GoogleAuthManager();
    }
    return GoogleAuthManager.instance;
  }

  public async initClient(): Promise<void> {
    if (this.tokenClient) return;
    await loadGis();
    if (!this.clientId) {
      console.warn('Google Client ID is missing. The Omni provider will fail to authenticate.');
      return;
    }

    if (!(window as any).google || !(window as any).google.accounts || !(window as any).google.accounts.oauth2) {
      throw new Error('Google Identity Services failed to initialize the oauth2 client.');
    }

    this.tokenClient = (window as any).google.accounts.oauth2.initTokenClient({
      client_id: this.clientId,
      scope: OMNI_SCOPES.join(' '),
      callback: '', // Override per call
    });
  }

  public login(): Promise<string> {
    if (!this.tokenClient) {
      return Promise.reject(new Error('Google Auth Client not initialized. Call initClient() first.'));
    }

    return new Promise((resolve, reject) => {
      try {
        this.tokenClient.callback = (resp: TokenResponse) => {
          if (resp.access_token) {
            this.currentToken = resp.access_token;
            localStorage.setItem('omni_access_token', resp.access_token);
            resolve(resp.access_token);
          } else {
            console.error(resp);
            reject(new Error('Got empty token response'));
          }
        };
        // Trigger popup
        this.tokenClient.requestAccessToken({ prompt: 'consent' });
      } catch (err) {
        reject(err);
      }
    });
  }

  public getToken(): string | null {
    return this.currentToken;
  }

  public logout(): void {
    if (this.currentToken && (window as any).google) {
      (window as any).google.accounts.oauth2.revoke(this.currentToken, () => {
        console.log('Token revoked from Google');
      });
    }
    this.currentToken = null;
    localStorage.removeItem('omni_access_token');
  }

  /**
   * Helper method for wrapping fetch calls to automatically attach the Bearer token
   */
  public async fetchWithAuth(url: string, options: RequestInit = {}): Promise<Response> {
    if (!this.currentToken) {
      throw new Error('No access token available. Call auth.login() first.');
    }

    const headers = new Headers(options.headers);
    if (!headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${this.currentToken}`);
    }
    if (!headers.has('Content-Type') && options.method && options.method !== 'GET' && !(options.body instanceof FormData)) {
      headers.set('Content-Type', 'application/json');
    }

    const response = await fetch(url, { ...options, headers });
    
    // Auto-detect expired tokens later if needed (e.g., 401 response)
    if (response.status === 401) {
      this.logout();
      throw new Error('Unauthorized: Token has expired or is invalid. Please login again.');
    }

    return response;
  }
}

export const googleAuth = GoogleAuthManager.getInstance();
