'use client';

import React, { useEffect, useState } from 'react';

const GOOGLE_WEB_CLIENT_ID =
  process.env.NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID ||
  '34221543030-qq5fgktvjcs9367ad3k477aq59if299d.apps.googleusercontent.com';

const MOBILE_OAUTH_STATE_KEY = 'va_mobile_oauth_state';
const DEFAULT_APP_REDIRECT = 'vatosalfa://oauthredirect';

function generateCryptoToken(byteLength = 16): string {
  const bytes = new Uint8Array(byteLength);
  window.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function resolveSafeMobileRedirect(raw?: string | null): string {
  if (!raw || typeof raw !== 'string') return DEFAULT_APP_REDIRECT;
  const trimmed = raw.trim();
  if (trimmed.startsWith('vatosalfa://') || trimmed.startsWith('com.vatosalfa.app://')) {
    return trimmed;
  }
  if (process.env.NODE_ENV !== 'production') {
    if (trimmed.startsWith('exp://')) return trimmed;
    try {
      const parsed = new URL(trimmed);
      if (parsed.protocol === 'http:' && parsed.hostname === 'localhost') {
        return trimmed;
      }
    } catch {
      // Fall through to default
    }
  }
  return DEFAULT_APP_REDIRECT;
}

export default function MobileGoogleAuthBridgePage() {
  const [statusMessage, setStatusMessage] = useState('Conectando con Google...');
  const [returnToAppUrl, setReturnToAppUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const hash = window.location.hash ? window.location.hash.substring(1) : '';
    const hashParams = new URLSearchParams(hash);
    const searchParams = new URLSearchParams(window.location.search);

    const idToken = hashParams.get('id_token') || searchParams.get('id_token');
    const accessToken = hashParams.get('access_token') || searchParams.get('access_token');
    const oauthError = hashParams.get('error') || searchParams.get('error');
    const rawStateParam = hashParams.get('state') || searchParams.get('state');
    const rawRedirectQuery = searchParams.get('redirect_uri');

    let incomingCsrf: string | null = null;
    let incomingRedirect: string | null = rawRedirectQuery;
    if (rawStateParam) {
      const sepIdx = rawStateParam.indexOf('|');
      if (sepIdx !== -1) {
        incomingCsrf = rawStateParam.slice(0, sepIdx);
        incomingRedirect = rawStateParam.slice(sepIdx + 1);
      } else {
        incomingRedirect = rawStateParam;
      }
    }

    const safeAppRedirect = resolveSafeMobileRedirect(incomingRedirect);

    // 1. Si Google ya nos devolvió el id_token en el hash, verificar estado CSRF y formato JWT
    if (idToken) {
      if (idToken.split('.').length !== 3) {
        setErrorMessage('Token de Google inválido.');
        return;
      }
      try {
        const storedRaw = window.sessionStorage.getItem(MOBILE_OAUTH_STATE_KEY);
        window.sessionStorage.removeItem(MOBILE_OAUTH_STATE_KEY);
        if (storedRaw) {
          const parsedState = JSON.parse(storedRaw);
          if (!incomingCsrf || parsedState?.csrf !== incomingCsrf) {
            setErrorMessage('Sesión OAuth expirada o inválida. Vuelve a intentar desde la app.');
            return;
          }
        }
      } catch {
        // Fallback if sessionStorage restricted
      }

      setStatusMessage('¡Sesión verificada! Regresando a la aplicación VATOS ALFA...');
      const separator = safeAppRedirect.includes('?') ? '&' : '?';
      const targetDeepLink = `${safeAppRedirect}${separator}id_token=${encodeURIComponent(idToken)}${
        accessToken ? `&access_token=${encodeURIComponent(accessToken)}` : ''
      }`;
      setReturnToAppUrl(targetDeepLink);
      window.location.replace(targetDeepLink);
      return;
    }

    // 2. Si el usuario canceló o hubo error en Google
    if (oauthError) {
      try {
        window.sessionStorage.removeItem(MOBILE_OAUTH_STATE_KEY);
      } catch {}
      setErrorMessage('Se canceló el inicio de sesión con Google.');
      const separator = safeAppRedirect.includes('?') ? '&' : '?';
      const cancelDeepLink = `${safeAppRedirect}${separator}error=${encodeURIComponent(oauthError)}`;
      setReturnToAppUrl(cancelDeepLink);
      window.location.replace(cancelDeepLink);
      return;
    }

    // 3. Iniciar flujo OAuth 2.0 hacia Google forzando prompt=select_account (lista de todas las cuentas del dispositivo)
    const currentOrigin = window.location.origin;
    const httpsCallbackUri = `${currentOrigin}/auth/mobile-google`;
    const nonce = generateCryptoToken(16);
    const csrfToken = generateCryptoToken(16);

    try {
      window.sessionStorage.setItem(
        MOBILE_OAUTH_STATE_KEY,
        JSON.stringify({ csrf: csrfToken, redirect: safeAppRedirect, ts: Date.now() })
      );
    } catch {}

    const googleAuthUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    googleAuthUrl.searchParams.set('client_id', GOOGLE_WEB_CLIENT_ID);
    googleAuthUrl.searchParams.set('redirect_uri', httpsCallbackUri);
    googleAuthUrl.searchParams.set('response_type', 'id_token');
    googleAuthUrl.searchParams.set('scope', 'openid profile email');
    googleAuthUrl.searchParams.set('prompt', 'select_account');
    googleAuthUrl.searchParams.set('nonce', nonce);
    googleAuthUrl.searchParams.set('state', `${csrfToken}|${safeAppRedirect}`);

    setStatusMessage('Abriendo selector de cuentas de Google...');
    window.location.replace(googleAuthUrl.toString());
  }, []);

  return (
    <div className="min-h-screen bg-[#10172b] text-white flex flex-col items-center justify-center p-6 text-center">
      <div className="w-full max-w-sm bg-[#1B243E] border border-white/10 rounded-2xl p-6 shadow-2xl flex flex-col items-center">
        <div className="w-14 h-14 rounded-full bg-white flex items-center justify-center mb-4 shadow-md">
          <span className="text-[#202A49] font-black text-2xl tracking-tighter">V</span>
        </div>
        <h1 className="text-lg font-extrabold tracking-wide mb-1">VATOS ALFA BARBER SHOP</h1>
        <p className="text-xs text-blue-300 font-semibold uppercase tracking-widest mb-5">
          Autenticación Segura
        </p>

        {!errorMessage ? (
          <div className="flex flex-col items-center gap-3 my-2">
            <div className="w-7 h-7 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-slate-200">{statusMessage}</p>
          </div>
        ) : (
          <p className="text-sm text-red-400 my-2">{errorMessage}</p>
        )}

        {returnToAppUrl && (
          <a
            href={returnToAppUrl}
            className="mt-5 w-full py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm transition text-center"
          >
            Volver a la App VATOS ALFA
          </a>
        )}
      </div>
    </div>
  );
}
