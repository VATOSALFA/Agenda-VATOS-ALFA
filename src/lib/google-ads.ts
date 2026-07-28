export interface TrackGoogleAdsReservationOptions {
  reservationId: string;
  value?: number;
  currency?: string;
}

/**
 * Isolated, non-blocking Google Ads conversion tracker.
 * Fires a conversion event ONLY when a valid backend reservation ID is provided.
 * Deduplicates firing per reservationId using sessionStorage.
 */
export function trackGoogleAdsReservation({
  reservationId,
  value,
  currency = 'MXN',
}: TrackGoogleAdsReservationOptions): void {
  try {
    if (typeof window === 'undefined') {
      return;
    }

    if (typeof (window as any).gtag !== 'function') {
      return;
    }

    if (!reservationId || typeof reservationId !== 'string' || !reservationId.trim()) {
      return;
    }

    const cleanId = reservationId.trim();
    const storageKey = `google_ads_reservation_${cleanId}`;

    // Deduplication check: prevent multiple conversion fires for the same reservation
    if (sessionStorage.getItem(storageKey)) {
      return;
    }

    const eventData: Record<string, any> = {
      send_to: 'AW-17117243647/newiCPHHw9ccEP_RkeI_',
      transaction_id: cleanId,
      currency: currency || 'MXN',
    };

    if (typeof value === 'number' && !isNaN(value) && value > 0) {
      eventData.value = value;
    }

    (window as any).gtag('event', 'conversion', eventData);

    // Store in sessionStorage to prevent duplicate fires on re-renders, refreshes, or navigation
    sessionStorage.setItem(storageKey, 'sent');
  } catch (error) {
    console.warn('No se pudo registrar la conversión de Google Ads:', error);
  }
}
