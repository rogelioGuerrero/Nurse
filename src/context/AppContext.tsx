/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { createContext, useContext, useState, useEffect, useRef, useCallback, useMemo, type FC, type ReactNode } from 'react';
import { Profile, Nurse, Booking, BookingStatus, Availability, CareRequest, CareRequestSlot, ExpectedDuration, CareOffer, NurseReview, FamilyReview } from '../types';
import { INITIAL_NURSES } from '../data/nurses';
import { supabase } from '../lib/supabase';
import { requestNotificationPermission, notifyNewOffer, notifyOfferAccepted, notifyCheckIn, notifyCheckOut, notifyPaymentConfirmed, notifyNewCareRequest } from '../lib/notifications';
import { subscribeToPush, unsubscribeFromPush } from '../lib/push';
import { track } from '../lib/analytics';
import { useToast } from '../components/Toast';
import { useBookings, type CareLog, type ServiceLogType } from '../hooks/useBookings';
import { useMarketplace } from '../hooks/useMarketplace';
import { useReviews } from '../hooks/useReviews';
import { useAvailability } from '../hooks/useAvailability';

// Safe localStorage parser - prevents crash on corrupted data
function safeParse<T>(key: string, fallback: T): T {
  try {
    const saved = localStorage.getItem(key);
    if (!saved) return fallback;
    return JSON.parse(saved) as T;
  } catch {
    console.warn(`Corrupted localStorage key "${key}", resetting to default.`);
    localStorage.removeItem(key);
    return fallback;
  }
}

export type { ServiceLogType, CareLog };

interface AppContextType {
  profiles: Profile[];
  nurses: Nurse[];
  bookings: Booking[];
  currentUser: Profile | null;
  currentNurse: Nurse | null;
  updateProfile: (profileData: Partial<Profile>) => void;
  updateNurseProfile: (nurseData: Partial<Nurse>) => Promise<void>;
  createBooking: (bookingData: Omit<Booking, 'id' | 'user_id' | 'created_at' | 'status'>) => Promise<Booking>;
  updateBookingStatus: (bookingId: string, status: BookingStatus) => Promise<void>;
  checkInBooking: (bookingId: string, lat: number, lng: number, address: string, mismatch: boolean) => Promise<void>;
  checkOutBooking: (bookingId: string, lat: number, lng: number) => Promise<void>;
  getAvailability: (nurseId: string, startDate: string, endDate: string) => Promise<Availability[]>;
  addAvailability: (availabilityData: Omit<Availability, 'id' | 'created_at' | 'updated_at'>) => Promise<Availability>;
  careLogs: Record<string, CareLog>;
  saveCareLog: (bookingId: string, log: Omit<CareLog, 'bookingId' | 'updatedAt'>) => void;
  careRequests: CareRequest[];
  createCareRequest: (data: Omit<CareRequest, 'id' | 'user_id' | 'created_at' | 'status' | 'response_deadline'>) => CareRequest;
  closeCareRequest: (requestId: string) => void;
  republisheCareRequest: (requestId: string, newSlots?: CareRequestSlot[], newDuration?: ExpectedDuration) => void;
  careOffers: CareOffer[];
  createCareOffer: (data: Omit<CareOffer, 'id' | 'created_at' | 'status'> & { status?: CareOffer['status'] }) => CareOffer;
  withdrawCareOffer: (offerId: string) => void;
  rejectCareOffer: (offerId: string) => void;
  acceptCareOffer: (offerId: string) => void;
  nurseReviews: NurseReview[];
  submitReview: (bookingId: string, nurseId: string, rating: number, comment?: string) => Promise<void>;
  familyReviews: FamilyReview[];
  submitFamilyReview: (bookingId: string, nurseId: string, userId: string, rating: number, comment?: string) => Promise<void>;
  confirmPayment: (bookingId: string) => Promise<void>;
  updatePatientName: (requestId: string, patientName: string, patientAge?: string, emergencyContact?: string) => Promise<void>;
  updateRequestLocation: (requestId: string, lat: number, lng: number, locationName: string) => Promise<void>;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  selectedNurseId: string | null;
  setSelectedNurseId: (id: string | null) => void;
  passwordRecoveryMode: boolean;
  setPasswordRecoveryMode: (val: boolean) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppContextProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const { showToast } = useToast();

  // --- Auth & UI state ---
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [currentUser, setCurrentUser] = useState<Profile | null>(null);
  const [activeTab, setActiveTab] = useState<string>('landing');
  const [selectedNurseId, setSelectedNurseId] = useState<string | null>(null);
  const [passwordRecoveryMode, setPasswordRecoveryMode] = useState(false);

  // --- Nurses state ---
  const [nurses, setNurses] = useState<Nurse[]>(() => safeParse('biencuidar_nurses', INITIAL_NURSES));
  const [currentNurse, setCurrentNurse] = useState<Nurse | null>(null);

  // --- Refs to avoid stale closures in realtime handlers ---
  const bookingsRef = useRef<Booking[]>([]);
  const nursesRef = useRef<Nurse[]>([]);
  const profilesRef = useRef<Profile[]>([]);
  const currentUserRef = useRef<Profile | null>(null);

  // --- Compose specialized hooks ---
  const {
    bookings, setBookings, careLogs, setCareLogs,
    saveCareLog, createBooking, updateBookingStatus,
    checkInBooking, checkOutBooking, confirmPayment,
  } = useBookings({ currentUser, nurses, profiles, showToast });

  const {
    careRequests, setCareRequests, careOffers, setCareOffers, careRequestsRef,
    createCareRequest, closeCareRequest, republisheCareRequest,
    createCareOffer, withdrawCareOffer, rejectCareOffer, acceptCareOffer,
    updatePatientName, updateRequestLocation,
  } = useMarketplace({ currentUser, nurses, profiles, showToast, setBookings, bookingsRef });

  const {
    nurseReviews, setNurseReviews,
    familyReviews, setFamilyReviews,
    submitReview, submitFamilyReview,
  } = useReviews(currentUser, showToast);

  const {
    getAvailability, addAvailability,
  } = useAvailability(currentUser, showToast);

  useEffect(() => { bookingsRef.current = bookings; }, [bookings]);
  useEffect(() => { nursesRef.current = nurses; }, [nurses]);
  useEffect(() => { profilesRef.current = profiles; }, [profiles]);
  useEffect(() => { currentUserRef.current = currentUser; }, [currentUser]);

  // Load user from Supabase Auth on mount
  useEffect(() => {
    const loadUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', session.user.id)
          .single();
        
        if (profile) {
          // Clear demo data from localStorage — real data comes from Supabase
          localStorage.removeItem('biencuidar_nurses');
          localStorage.removeItem('biencuidar_availability');
          setCurrentUser(profile);
          setActiveTab(profile.role === 'nurse' ? 'nurse-inbox' : profile.role === 'admin' ? 'admin-panel' : 'care-request');
          track.login(profile.role);
          const permission = await requestNotificationPermission();
          if (permission === 'granted') {
            await subscribeToPush(profile.id);
          }
        }
      }
    };
    
    loadUser();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'PASSWORD_RECOVERY' && session?.user) {
        setPasswordRecoveryMode(true);
        setCurrentUser(null);
        setActiveTab('landing');
      } else if (event === 'SIGNED_IN' && session?.user) {
        setPasswordRecoveryMode(false);
        // Clear demo data on sign-in
        localStorage.removeItem('biencuidar_nurses');
        localStorage.removeItem('biencuidar_availability');
        const { data: profile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', session.user.id)
          .single();
        
        if (profile) {
          setCurrentUser(profile);
          setActiveTab(profile.role === 'nurse' ? 'nurse-inbox' : profile.role === 'admin' ? 'admin-panel' : 'care-request');
        }
      } else if (event === 'USER_UPDATED' && session?.user) {
        // Fires after password recovery (supabase.auth.updateUser) — rehydrate profile
        // so the app resumes without a window.location.reload()
        const { data: profile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', session.user.id)
          .single();
        if (profile) {
          setPasswordRecoveryMode(false);
          setCurrentUser(profile);
          setActiveTab(profile.role === 'nurse' ? 'nurse-inbox' : profile.role === 'admin' ? 'admin-panel' : 'care-request');
        }
      } else if (event === 'SIGNED_OUT') {
        // currentUserRef: the effect deps are [] so `currentUser` here is always null
        const signedOutUser = currentUserRef.current;
        if (signedOutUser) await unsubscribeFromPush(signedOutUser.id);
        setPasswordRecoveryMode(false);
        setCurrentUser(null);
        setActiveTab('landing');
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Load profiles, nurses, bookings, care requests and offers from Supabase
  useEffect(() => {
    if (!currentUser) return;

    const loadData = async () => {
      const isAdmin = currentUser.role === 'admin';
      const isNurse = currentUser.role === 'nurse';

      // ── Wave 1: all independent queries in parallel ──
      // Care requests: family sees own + open; nurse sees open + own; admin sees all
      // Use care_requests_public view to mask PHI (patient_name, patient_data, notes) for non-owners
      let requestsQuery = supabase.from('care_requests_public').select('*');
      if (!isAdmin) {
        requestsQuery = requestsQuery.or(`user_id.eq.${currentUser.id},status.eq.open`);
      }

      const [demoRes, nursesRes, requestsRes, nurseRevRes, familyRevRes] = await Promise.all([
        // Demo user IDs to exclude demo data from all views (all roles)
        supabase.from('profiles').select('id').eq('is_demo', true),
        // Nurses list is public to authenticated users (marketplace) — view masks PHI
        supabase.from('nurses_public').select('*'),
        requestsQuery,
        // Reviews: public to authenticated — bounded to latest 200
        supabase.from('nurse_reviews').select('*').order('created_at', { ascending: false }).limit(200),
        supabase.from('family_reviews').select('*').order('created_at', { ascending: false }).limit(200),
      ]);

      const demoUserIds = (demoRes.data || []).map((p: any) => p.id);
      const nursesData = demoUserIds.length > 0
        ? (nursesRes.data || []).filter((n: any) => !demoUserIds.includes(n.user_id) || n.user_id === currentUser.id)
        : nursesRes.data;
      if (nursesData) setNurses(nursesData);
      if (nurseRevRes.data) setNurseReviews(nurseRevRes.data);
      if (familyRevRes.data) setFamilyReviews(familyRevRes.data);

      const requestsData = requestsRes.data;
      const filteredRequests = demoUserIds.length > 0
        ? (requestsData || []).filter((r: any) => !demoUserIds.includes(r.user_id))
        : requestsData;
      if (filteredRequests) setCareRequests(filteredRequests.map((r: any) => ({
        ...r,
        wants_invoice: r.wants_invoice ?? false,
        slots: typeof r.slots === 'string' ? JSON.parse(r.slots) : r.slots || [],
        patient_data: r.patient_data ? (typeof r.patient_data === 'string' ? JSON.parse(r.patient_data) : r.patient_data) : undefined,
      })));

      const nurseRow = nursesData?.find(n => n.user_id === currentUser.id);

      // ── Wave 2: queries that depend on wave-1 results ──
      // Bookings: filter by user_id (family) or via nurse link
      let bookingsQuery = supabase.from('bookings').select('*');
      if (!isAdmin) {
        if (isNurse && nurseRow) {
          bookingsQuery = bookingsQuery.eq('nurse_id', nurseRow.id);
        } else {
          bookingsQuery = bookingsQuery.eq('user_id', currentUser.id);
        }
      }

      // Care offers: filter by request ownership or nurse ownership
      const NO_MATCH_UUID = '00000000-0000-0000-0000-000000000000';
      let offersQuery = supabase.from('care_offers').select('*');
      if (!isAdmin) {
        if (isNurse) {
          offersQuery = nurseRow
            ? offersQuery.eq('nurse_id', nurseRow.id)
            : offersQuery.eq('nurse_id', NO_MATCH_UUID);
        } else {
          // Family: get offers for their requests
          const myRequestIds = (requestsData || []).filter(r => r.user_id === currentUser.id).map(r => r.id);
          offersQuery = myRequestIds.length > 0
            ? offersQuery.in('request_id', myRequestIds)
            : offersQuery.eq('request_id', NO_MATCH_UUID);
        }
      }

      const [bookingsRes, offersRes] = await Promise.all([bookingsQuery, offersQuery]);

      const bookingsData = demoUserIds.length > 0
        ? (bookingsRes.data || []).filter((b: any) => !demoUserIds.includes(b.user_id))
        : bookingsRes.data;
      if (bookingsData) {
        setBookings(bookingsData.map((b: any) => ({ ...b, wants_invoice: b.wants_invoice ?? false })));
      }

      const validRequestIds = new Set((filteredRequests || []).map((r: any) => r.id));
      const validNurseIds = new Set((nursesData || []).map((n: any) => n.id));
      const filteredOffers = demoUserIds.length > 0
        ? (offersRes.data || []).filter((o: any) => validRequestIds.has(o.request_id) && validNurseIds.has(o.nurse_id))
        : offersRes.data;
      if (filteredOffers) setCareOffers(filteredOffers.map((o: any) => ({
        ...o,
        message: o.notes || o.message || ''
      })));

      // ── Wave 3: care logs + counterpart profiles (depend on wave 2) ──
      const visibleBookingIds = (bookingsData || []).map(b => b.id);

      // Profiles needed by every role:
      //  - family: profiles of all visible nurses (catalog, offers, booking cards)
      //  - nurse: profiles of families behind bookings and open care requests
      //  - admin: full profiles table (separate query)
      const counterpartIds = new Set<string>([currentUser.id]);
      (nursesData || []).forEach((n: any) => counterpartIds.add(n.user_id));
      (filteredRequests || []).forEach((r: any) => counterpartIds.add(r.user_id));
      (bookingsData || []).forEach((b: any) => counterpartIds.add(b.user_id));

      const profilesQuery = isAdmin
        ? supabase.from('profiles').select('*').neq('is_demo', true)
        : supabase
            .from('profiles_public')
            .select('id, full_name, avatar_url, location_name, role, country, phone, created_at, updated_at')
            .in('id', [...counterpartIds]);

      const [logsRes, profilesRes] = await Promise.all([
        visibleBookingIds.length > 0
          ? supabase.from('care_logs').select('*').in('booking_id', visibleBookingIds)
          : Promise.resolve({ data: null }),
        profilesQuery,
      ]);

      if (logsRes.data) {
        const logsMap: Record<string, CareLog> = {};
        logsRes.data.forEach((l: any) => {
          logsMap[l.booking_id] = {
            bookingId: l.booking_id,
            serviceType: l.service_type || 'clinical',
            arrivalTime: l.arrival_time || '',
            departureTime: l.departure_time || '',
            patientConditionOnArrival: l.patient_condition_on_arrival || 'Bien',
            patientConditionOnDeparture: l.patient_condition_on_departure || 'Igual',
            activities: typeof l.activities === 'string' ? JSON.parse(l.activities) : l.activities || [],
            observations: l.observations || '',
            narrativeReport: l.narrative_report || '',
            familyReport: l.family_report || '',
            updatedAt: l.updated_at || new Date().toISOString()
          };
        });
        setCareLogs(logsMap);
      }

      if (profilesRes.data) {
        if (isAdmin) {
          // Admin branch queries the full profiles table (includes email)
          setProfiles(profilesRes.data as Profile[]);
        } else {
          // profiles_public does not expose email — fill own email from auth profile
          setProfiles(profilesRes.data.map((p: any) => ({
            ...p,
            email: p.id === currentUser.id ? currentUser.email : '',
          })));
        }
      }
    };

    loadData();

    // Realtime subscriptions — filtered by user relevance
    // Sanitize PHI fields from payload if user is not owner/admin (mirrors care_requests_public view)
    const sanitizeRequestPHI = (r: any, userId: string, role: string) => {
      if (r.user_id === userId || role === 'admin') return r;
      const { patient_name, patient_data, notes, ...rest } = r;
      return { ...rest, patient_name: null, patient_data: null, notes: null };
    };

    const channel = supabase
      .channel('user-changes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'care_requests' }, (payload) => {
        const raw = payload.new as any;
        const r = sanitizeRequestPHI(raw, currentUser.id, currentUser.role);
        // Only add if user owns it or it's open (visible to them)
        if (raw.user_id === currentUser.id || raw.status === 'open' || currentUser.role === 'admin') {
          setCareRequests(prev => prev.find(x => x.id === r.id) ? prev : [{ ...r, slots: typeof r.slots === 'string' ? JSON.parse(r.slots) : r.slots || [] }, ...prev]);
          // Notify nurse if request matches their specialization and they didn't create it
          if (currentUser.role === 'nurse' && raw.user_id !== currentUser.id && raw.status === 'open') {
            const myNurse = nursesRef.current.find(n => n.user_id === currentUser.id);
            if (myNurse && myNurse.specialization?.includes(r.specialization_needed)) {
              // Local-only: event already arrived via Realtime (no remote push needed)
              notifyNewCareRequest(r.specialization_needed);
            }
          }
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'care_requests' }, (payload) => {
        const raw = payload.new as any;
        const r = sanitizeRequestPHI(raw, currentUser.id, currentUser.role);
        setCareRequests(prev => prev.map(x => x.id === r.id ? { ...r, slots: typeof r.slots === 'string' ? JSON.parse(r.slots) : r.slots || [] } : x));
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'care_offers' }, (payload) => {
        const o = payload.new as any;
        // Use refs to avoid stale closures on careRequests/nurses/profiles
        const currentRequests = careRequestsRef.current;
        const myNurseId = nursesRef.current.find(n => n.user_id === currentUser.id)?.id;
        const isRelevant = currentUser.role === 'admin' ||
          o.nurse_id === myNurseId ||
          currentRequests.some(req => req.id === o.request_id && req.user_id === currentUser.id);
        if (isRelevant) {
          setCareOffers(prev => prev.find(x => x.id === o.id) ? prev : [{ ...o, message: o.notes || '' }, ...prev]);
          // Notify family if they own the request and the offer came from another user
          const request = currentRequests.find(req => req.id === o.request_id);
          if (request && request.user_id === currentUser.id && o.nurse_id !== myNurseId) {
            const nurse = nursesRef.current.find(n => n.id === o.nurse_id);
            const nurseProfile = nurse ? profilesRef.current.find(p => p.id === nurse.user_id) : null;
            // Local-only notification (push already sent server-side by notify-marketplace)
            notifyNewOffer(nurseProfile?.full_name || 'Una enfermera', request.patient_name);
          }
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'care_offers' }, (payload) => {
        const o = payload.new as any;
        setCareOffers(prev => prev.map(x => x.id === o.id ? { ...o, message: o.notes || '' } : x));
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, (payload) => {
        const b = payload.new as any;
        const isMyNurse = nursesRef.current.some(n => n.id === b.nurse_id && n.user_id === currentUser.id);
        // Only process if booking belongs to current user or assigned nurse
        const isRelevant = currentUser.role === 'admin' ||
          b.user_id === currentUser.id ||
          isMyNurse;
        if (!isRelevant) return;
        if (payload.eventType === 'INSERT') {
          setBookings(prev => prev.find(x => x.id === b.id) ? prev : [b, ...prev]);
          // Notify nurse: a new booking was created (family accepted their offer)
          if (isMyNurse && b.user_id !== currentUser.id) {
            // Local-only (push already sent server-side by notify-marketplace)
            notifyOfferAccepted(b.patient_name);
          }
        } else if (payload.eventType === 'UPDATE') {
          const prevBooking = bookingsRef.current.find(x => x.id === b.id);
          setBookings(prev => prev.map(x => x.id === b.id ? b : x));
          // Detect check-in: check_in_at went from null to a value
          if (b.check_in_at && !prevBooking?.check_in_at && b.user_id === currentUser.id) {
            const nurse = nursesRef.current.find(n => n.id === b.nurse_id);
            const nurseProfile = nurse ? profilesRef.current.find(p => p.id === nurse.user_id) : null;
            notifyCheckIn(nurseProfile?.full_name || 'La enfermera');
          }
          // Detect check-out: check_out_at went from null to a value
          if (b.check_out_at && !prevBooking?.check_out_at && b.user_id === currentUser.id) {
            const nurse = nursesRef.current.find(n => n.id === b.nurse_id);
            const nurseProfile = nurse ? profilesRef.current.find(p => p.id === nurse.user_id) : null;
            notifyCheckOut(nurseProfile?.full_name || 'La enfermera');
          }
          // Detect payment confirmation: payment_status went to 'paid'
          if (b.payment_status === 'paid' && prevBooking?.payment_status !== 'paid') {
            if (isMyNurse && b.user_id !== currentUser.id) {
              notifyPaymentConfirmed(b.patient_name);
            }
          }
        }
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'care_logs' }, (payload) => {
        const l = payload.new as any;
        // Only process if the booking belongs to the user (ref → live data, not initial snapshot)
        const bookingIds = bookingsRef.current.map(b => b.id);
        if (bookingIds.includes(l.booking_id)) {
          setCareLogs(prev => ({ ...prev, [l.booking_id]: { bookingId: l.booking_id, serviceType: l.service_type || 'clinical', arrivalTime: l.arrival_time || '', departureTime: l.departure_time || '', patientConditionOnArrival: l.patient_condition_on_arrival || 'Bien', patientConditionOnDeparture: l.patient_condition_on_departure || 'Igual', activities: typeof l.activities === 'string' ? JSON.parse(l.activities) : l.activities || [], observations: l.observations || '', narrativeReport: l.narrative_report || '', familyReport: l.family_report || '', updatedAt: l.updated_at || new Date().toISOString() } }));
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'care_logs' }, (payload) => {
        const l = payload.new as any;
        const bookingIds = bookingsRef.current.map(b => b.id);
        if (bookingIds.includes(l.booking_id)) {
          setCareLogs(prev => ({ ...prev, [l.booking_id]: { bookingId: l.booking_id, serviceType: l.service_type || 'clinical', arrivalTime: l.arrival_time || '', departureTime: l.departure_time || '', patientConditionOnArrival: l.patient_condition_on_arrival || 'Bien', patientConditionOnDeparture: l.patient_condition_on_departure || 'Igual', activities: typeof l.activities === 'string' ? JSON.parse(l.activities) : l.activities || [], observations: l.observations || '', narrativeReport: l.narrative_report || '', familyReport: l.family_report || '', updatedAt: l.updated_at || new Date().toISOString() } }));
        }
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'nurse_reviews' }, (payload) => {
        const rv = payload.new as any;
        // Only add if review is for a booking the user can see (ref → live data)
        const bookingIds = bookingsRef.current.map(b => b.id);
        const isRelevant = currentUser.role === 'admin' || bookingIds.includes(rv.booking_id);
        if (isRelevant) {
          setNurseReviews(prev => prev.find(x => x.id === rv.id) ? prev : [...prev, rv]);
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [currentUser]);

  // --- Sync currentNurse when user or nurses change ---
  useEffect(() => {
    if (currentUser && currentUser.role === 'nurse') {
      const foundNurse = nurses.find(n => n.user_id === currentUser.id);
      setCurrentNurse(foundNurse || null);
    } else {
      setCurrentNurse(null);
    }
  }, [currentUser, nurses]);

  // --- Auto-expire pending bookings older than 24 hours (client-side mirror) ---
  useEffect(() => {
    const now = Date.now();
    setBookings(prev => prev.map(b =>
      b.status === 'pending' && now - new Date(b.created_at).getTime() > 86400000
        ? { ...b, status: 'cancelled' as BookingStatus }
        : b
    ));
  }, []);

  // --- Profile actions ---
  const updateProfile = useCallback(async (profileData: Partial<Profile>) => {
    if (!currentUser) return;
    const updated = { ...currentUser, ...profileData, updated_at: new Date().toISOString() };
    setCurrentUser(updated);
    setProfiles(prev => prev.map(p => p.id === updated.id ? updated : p));
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: updated.full_name,
          phone: updated.phone,
          location_name: updated.location_name,
          avatar_url: updated.avatar_url,
          country: updated.country,
          updated_at: updated.updated_at
        })
        .eq('id', updated.id);
      if (error) { console.warn('Failed to sync profile to Supabase:', error.message); showToast('No se pudo guardar el perfil. Tus cambios locales se mantienen.', 'error'); }
    } catch (err) {
      console.warn('Profile sync error:', err);
      showToast('Error al sincronizar el perfil.', 'error');
    }
  }, [currentUser, showToast]);

  const updateNurseProfile = useCallback(async (nurseData: Partial<Nurse>) => {
    if (!currentNurse) return;
    const updated = { ...currentNurse, ...nurseData };
    setCurrentNurse(updated);
    setNurses(prev => prev.map(n => n.id === updated.id ? updated : n));
    try {
      const { error } = await supabase
        .from('nurses')
        .update({
          bio: updated.bio,
          shift_rate: updated.shift_rate,
          specialization: updated.specialization,
          available_shifts: updated.available_shifts,
          available_days: updated.available_days,
          coverage_radius: updated.coverage_radius,
          lat: updated.lat,
          lng: updated.lng,
          certifications: updated.certifications,
          experience_years: updated.experience_years,
          cssp_registration: updated.cssp_registration,
          cssp_level: updated.cssp_level,
          assignment_availability: updated.assignment_availability,
          payment_preference: updated.payment_preference,
          verifications: updated.verifications || {},
        })
        .eq('id', updated.id);
      if (error) { console.warn('Failed to sync nurse profile to Supabase:', error.message); showToast('No se pudo guardar el perfil de enfermera.', 'error'); }
    } catch (err) {
      console.warn('Nurse profile sync error:', err);
      showToast('Error al sincronizar el perfil de enfermera.', 'error');
    }
  }, [currentNurse, showToast]);

  // Memoized context value — prevents global re-renders when unrelated state changes
  const contextValue = useMemo<AppContextType>(() => ({
    profiles,
    nurses,
    bookings,
    currentUser,
    currentNurse,
    updateProfile,
    updateNurseProfile,
    createBooking,
    updateBookingStatus,
    checkInBooking,
    checkOutBooking,
    getAvailability,
    addAvailability,
    careLogs,
    saveCareLog,
    careRequests,
    createCareRequest,
    closeCareRequest,
    republisheCareRequest,
    careOffers,
    createCareOffer,
    withdrawCareOffer,
    rejectCareOffer,
    acceptCareOffer,
    nurseReviews,
    submitReview,
    familyReviews,
    submitFamilyReview,
    confirmPayment,
    updatePatientName,
    updateRequestLocation,
    activeTab,
    setActiveTab,
    selectedNurseId,
    setSelectedNurseId,
    passwordRecoveryMode,
    setPasswordRecoveryMode
  }), [
    profiles, nurses, bookings, currentUser, currentNurse,
    updateProfile, updateNurseProfile,
    createBooking, updateBookingStatus, checkInBooking, checkOutBooking,
    getAvailability, addAvailability,
    careLogs, saveCareLog,
    careRequests, createCareRequest, closeCareRequest, republisheCareRequest,
    careOffers, createCareOffer, withdrawCareOffer, rejectCareOffer, acceptCareOffer,
    nurseReviews, submitReview, familyReviews, submitFamilyReview,
    confirmPayment, updatePatientName, updateRequestLocation,
    activeTab, selectedNurseId, passwordRecoveryMode,
  ]);

  return (
    <AppContext.Provider value={contextValue}>
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used inside an AppContextProvider');
  return context;
};
