/**
 * Google Analytics 4 event tracking.
 * Replace G-XXXXXXXXXX in index.html with your real GA4 measurement ID.
 */

type GA4Event =
  | 'page_view'
  | 'signup_start'
  | 'signup_success'
  | 'care_request_start'
  | 'care_request_submit'
  | 'offer_submit'
  | 'offer_accepted'
  | 'login';

interface GA4Params {
  [key: string]: string | number | boolean | undefined;
}

function push(event: GA4Event, params?: GA4Params): void {
  if (typeof window === 'undefined') return;
  const w = window as any;
  if (!w.gtag) return;
  w.gtag('event', event, params);
}

export const track = {
  pageView(path: string): void {
    push('page_view', { page_path: path });
  },

  signupStart(role: 'nurse' | 'family'): void {
    push('signup_start', { role });
  },

  signupSuccess(role: 'nurse' | 'family'): void {
    push('signup_success', { role });
  },

  login(role: 'nurse' | 'family' | 'admin'): void {
    push('login', { role });
  },

  careRequestStart(): void {
    push('care_request_start');
  },

  careRequestSubmit(specialization: string, urgency?: string): void {
    push('care_request_submit', { specialization, urgency });
  },

  offerSubmit(rate: number): void {
    push('offer_submit', { value: rate });
  },

  offerAccepted(): void {
    push('offer_accepted');
  },
};
