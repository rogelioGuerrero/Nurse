/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { createContext, useContext, useState, useEffect, useRef, type FC, type ReactNode } from 'react';
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

  // --- Compose specialized hooks ---
  const {
    bookings, setBookings, careLogs, setCareLogs,
    saveCareLog, createBooking, updateBookingStatus,
    checkInBooking, checkOutBooking, confirmPayment,
  } = useBookings({ currentUser, nurses, profiles, showToast });

  const {
    careRequests, setCareRequests, careOffers, setCareOffers, careRequestsRef,
    createCareRequest, closeCareRequest, republisheCareRequest,
    createCareOffer, withdrawCareOffer, acceptCareOffer,
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
      } else if (event === 'SIGNED_OUT') {
        if (currentUser) await unsubscribeFromPush(currentUser.id);
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

    let nursesData: any[] | null = null;
    let bookingsData: any[] | null = null;

    const loadData = async () => {
      const isAdmin = currentUser.role === 'admin';
      const isNurse = currentUser.role === 'nurse';

      // Get demo user IDs to exclude demo data from all views (all roles)
      let demoUserIds: string[] = [];
      const { data: demoProfiles } = await supabase.from('profiles').select('id').eq('is_demo', true);
      demoUserIds = (demoProfiles || []).map((p: any) => p.id);

      // Nurses list is public to authenticated users (for marketplace)
      const { data: nursesResult } = await supabase.from('nurses').select('*');
      nursesData = demoUserIds.length > 0
        ? (nursesResult || []).filter((n: any) => !demoUserIds.includes(n.user_id) || n.user_id === currentUser.id)
        : nursesResult;
      if (nursesData) setNurses(nursesData);

      // Profiles: admin needs all; nurses need profiles of families they have bookings with (loaded after bookings below)
      if (isAdmin) {
        const { data: profilesData } = await supabase.from('profiles').select('*').neq('is_demo', true);
        if (profilesData) setProfiles(profilesData);
      }

      // Bookings: filter by user_id (family) or via nurse link
      let bookingsQuery = supabase.from('bookings').select('*');
      if (!isAdmin) {
        if (isNurse) {
          const nurseRow = nursesData?.find(n => n.user_id === currentUser.id);
          if (nurseRow) {
            bookingsQuery = bookingsQuery.eq('nurse_id', nurseRow.id);
          } else {
            bookingsQuery = bookingsQuery.eq('user_id', currentUser.id);
          }
        } else {
          bookingsQuery = bookingsQuery.eq('user_id', currentUser.id);
        }
      }
      const { data: bookingsResult } = await bookingsQuery;
      bookingsData = demoUserIds.length > 0
        ? (bookingsResult || []).filter((b: any) => !demoUserIds.includes(b.user_id))
        : bookingsResult;
      if (bookingsData) {
        setBookings(bookingsData.map((b: any) => ({ ...b, wants_invoice: b.wants_invoice ?? false })));
      }

      // Nurse: load profiles of families they have bookings with
      if (isNurse) {
        const nurseRow = nursesData?.find(n => n.user_id === currentUser.id);
        const myBookings = bookingsResult?.filter((b: any) => b.nurse_id === nurseRow?.id) || [];
        const familyIds = [...new Set(myBookings.map((b: any) => b.user_id))];
        if (familyIds.length > 0) {
          const { data: familyProfiles } = await supabase.from('profiles').select('*').in('id', familyIds);
          if (familyProfiles) setProfiles(familyProfiles);
        }
      }

      // Care requests: family sees own + open; nurse sees open + those with their offers; admin sees all
      let requestsQuery = supabase.from('care_requests').select('*');
      if (!isAdmin) {
        if (isNurse) {
          requestsQuery = requestsQuery.or(`user_id.eq.${currentUser.id},status.eq.open`);
        } else {
          requestsQuery = requestsQuery.or(`user_id.eq.${currentUser.id},status.eq.open`);
        }
      }
      const { data: requestsData } = await requestsQuery;
      const filteredRequests = demoUserIds.length > 0
        ? (requestsData || []).filter((r: any) => !demoUserIds.includes(r.user_id))
        : requestsData;
      if (filteredRequests) setCareRequests(filteredRequests.map((r: any) => ({
        ...r,
        wants_invoice: r.wants_invoice ?? false,
        slots: typeof r.slots === 'string' ? JSON.parse(r.slots) : r.slots || [],
        patient_data: r.patient_data ? (typeof r.patient_data === 'string' ? JSON.parse(r.patient_data) : r.patient_data) : undefined,
      })));

      // Care offers: filter by request ownership or nurse ownership
      let offersQuery = supabase.from('care_offers').select('*');
      if (!isAdmin) {
        if (isNurse) {
          const nurseRow = nursesData?.find(n => n.user_id === currentUser.id);
          if (nurseRow) {
            offersQuery = offersQuery.eq('nurse_id', nurseRow.id);
          }
        } else {
          // Family: get offers for their requests
          const myRequestIds = (requestsData || []).filter(r => r.user_id === currentUser.id).map(r => r.id);
          if (myRequestIds.length > 0) {
            offersQuery = offersQuery.in('request_id', myRequestIds);
          } else {
            offersQuery = offersQuery.eq('request_id', '00000000-0000-0000-0000-000000000000');
          }
        }
      }
      const { data: offersData } = await offersQuery;
      const validRequestIds = new Set((filteredRequests || requestsData || []).map((r: any) => r.id));
      const validNurseIds = new Set((nursesData || []).map((n: any) => n.id));
      const filteredOffers = demoUserIds.length > 0
        ? (offersData || []).filter((o: any) => validRequestIds.has(o.request_id) && validNurseIds.has(o.nurse_id))
        : offersData;
      if (filteredOffers) setCareOffers(filteredOffers.map((o: any) => ({
        ...o,
        message: o.notes || o.message || ''
      })));

      // Care logs: only for bookings the user can see
      const visibleBookingIds = (bookingsData || []).map(b => b.id);
      if (visibleBookingIds.length > 0) {
        const { data: logsData } = await supabase.from('care_logs').select('*').in('booking_id', visibleBookingIds);
        if (logsData) {
          const logsMap: Record<string, CareLog> = {};
          logsData.forEach((l: any) => {
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
      }

      // Reviews: public to authenticated
      const { data: reviewsData } = await supabase.from('nurse_reviews').select('*');
      if (reviewsData) setNurseReviews(reviewsData);
      const { data: familyReviewsData } = await supabase.from('family_reviews').select('*');
      if (familyReviewsData) setFamilyReviews(familyReviewsData);
    };

    loadData();

    // Realtime subscriptions — filtered by user relevance
    const channel = supabase
      .channel('user-changes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'care_requests' }, (payload) => {
        const r = payload.new as any;
        // Only add if user owns it or it's open (visible to them)
        if (r.user_id === currentUser.id || r.status === 'open' || currentUser.role === 'admin') {
          setCareRequests(prev => prev.find(x => x.id === r.id) ? prev : [{ ...r, slots: typeof r.slots === 'string' ? JSON.parse(r.slots) : r.slots || [] }, ...prev]);
          // Notify nurse if request matches their specialization and they didn't create it
          if (currentUser.role === 'nurse' && r.user_id !== currentUser.id && r.status === 'open') {
            const myNurse = nursesData?.find(n => n.user_id === currentUser.id);
            if (myNurse && myNurse.specialization?.includes(r.specialization_needed)) {
              notifyNewCareRequest(r.specialization_needed, currentUser.id);
            }
          }
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'care_requests' }, (payload) => {
        const r = payload.new as any;
        setCareRequests(prev => prev.map(x => x.id === r.id ? { ...r, slots: typeof r.slots === 'string' ? JSON.parse(r.slots) : r.slots || [] } : x));
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'care_offers' }, (payload) => {
        const o = payload.new as any;
        // Use ref to avoid stale closure on careRequests
        const currentRequests = careRequestsRef.current;
        const isRelevant = currentUser.role === 'admin' ||
          o.nurse_id === nursesData?.find(n => n.user_id === currentUser.id)?.id ||
          currentRequests.some(req => req.id === o.request_id && req.user_id === currentUser.id);
        if (isRelevant) {
          setCareOffers(prev => prev.find(x => x.id === o.id) ? prev : [{ ...o, message: o.notes || '' }, ...prev]);
          // Notify family if they own the request and the offer came from another user
          const request = currentRequests.find(req => req.id === o.request_id);
          if (request && request.user_id === currentUser.id && o.nurse_id !== nursesData?.find(n => n.user_id === currentUser.id)?.id) {
            const nurse = nursesData?.find(n => n.id === o.nurse_id);
            const nurseProfile = nurse ? profiles.find(p => p.id === nurse.user_id) : null;
            notifyNewOffer(nurseProfile?.full_name || 'Una enfermera', request.patient_name, currentUser.id);
          }
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'care_offers' }, (payload) => {
        const o = payload.new as any;
        setCareOffers(prev => prev.map(x => x.id === o.id ? { ...o, message: o.notes || '' } : x));
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, (payload) => {
        const b = payload.new as any;
        // Only process if booking belongs to current user or assigned nurse
        const isRelevant = currentUser.role === 'admin' ||
          b.user_id === currentUser.id ||
          nursesData?.some(n => n.id === b.nurse_id && n.user_id === currentUser.id);
        if (!isRelevant) return;
        if (payload.eventType === 'INSERT') {
          setBookings(prev => prev.find(x => x.id === b.id) ? prev : [b, ...prev]);
          // Notify nurse: a new booking was created (family accepted their offer)
          const isNurse = nursesData?.some(n => n.id === b.nurse_id && n.user_id === currentUser.id);
          if (isNurse && b.user_id !== currentUser.id) {
            notifyOfferAccepted(b.patient_name, currentUser.id);
          }
        } else if (payload.eventType === 'UPDATE') {
          const prevBooking = bookingsRef.current.find(x => x.id === b.id);
          setBookings(prev => prev.map(x => x.id === b.id ? b : x));
          // Detect check-in: check_in_at went from null to a value
          if (b.check_in_at && !prevBooking?.check_in_at && b.user_id === currentUser.id) {
            const nurse = nursesData?.find(n => n.id === b.nurse_id);
            const nurseProfile = nurse ? profiles.find(p => p.id === nurse.user_id) : null;
            notifyCheckIn(nurseProfile?.full_name || 'La enfermera', currentUser.id);
          }
          // Detect check-out: check_out_at went from null to a value
          if (b.check_out_at && !prevBooking?.check_out_at && b.user_id === currentUser.id) {
            const nurse = nursesData?.find(n => n.id === b.nurse_id);
            const nurseProfile = nurse ? profiles.find(p => p.id === nurse.user_id) : null;
            notifyCheckOut(nurseProfile?.full_name || 'La enfermera', currentUser.id);
          }
          // Detect payment confirmation: payment_status went to 'paid'
          if (b.payment_status === 'paid' && prevBooking?.payment_status !== 'paid') {
            const isNurse = nursesData?.some(n => n.id === b.nurse_id && n.user_id === currentUser.id);
            if (isNurse && b.user_id !== currentUser.id) {
              notifyPaymentConfirmed(b.patient_name, currentUser.id);
            }
          }
        }
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'care_logs' }, (payload) => {
        const l = payload.new as any;
        // Only process if the booking belongs to the user
        const bookingIds = (bookingsData || []).map(b => b.id);
        if (bookingIds.includes(l.booking_id)) {
          setCareLogs(prev => ({ ...prev, [l.booking_id]: { bookingId: l.booking_id, serviceType: l.service_type || 'clinical', arrivalTime: l.arrival_time || '', departureTime: l.departure_time || '', patientConditionOnArrival: l.patient_condition_on_arrival || 'Bien', patientConditionOnDeparture: l.patient_condition_on_departure || 'Igual', activities: typeof l.activities === 'string' ? JSON.parse(l.activities) : l.activities || [], observations: l.observations || '', narrativeReport: l.narrative_report || '', familyReport: l.family_report || '', updatedAt: l.updated_at || new Date().toISOString() } }));
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'care_logs' }, (payload) => {
        const l = payload.new as any;
        const bookingIds = (bookingsData || []).map(b => b.id);
        if (bookingIds.includes(l.booking_id)) {
          setCareLogs(prev => ({ ...prev, [l.booking_id]: { bookingId: l.booking_id, serviceType: l.service_type || 'clinical', arrivalTime: l.arrival_time || '', departureTime: l.departure_time || '', patientConditionOnArrival: l.patient_condition_on_arrival || 'Bien', patientConditionOnDeparture: l.patient_condition_on_departure || 'Igual', activities: typeof l.activities === 'string' ? JSON.parse(l.activities) : l.activities || [], observations: l.observations || '', narrativeReport: l.narrative_report || '', familyReport: l.family_report || '', updatedAt: l.updated_at || new Date().toISOString() } }));
        }
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'nurse_reviews' }, (payload) => {
        const rv = payload.new as any;
        // Only add if review is for a booking the user can see
        const bookingIds = (bookingsData || []).map(b => b.id);
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
  const updateProfile = async (profileData: Partial<Profile>) => {
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
          updated_at: updated.updated_at
        })
        .eq('id', updated.id);
      if (error) { console.warn('Failed to sync profile to Supabase:', error.message); showToast('No se pudo guardar el perfil. Tus cambios locales se mantienen.', 'error'); }
    } catch (err) {
      console.warn('Profile sync error:', err);
      showToast('Error al sincronizar el perfil.', 'error');
    }
    if (updated.role === 'nurse') {
      setNurses(prev => prev.map(n => n.user_id === updated.id ? { ...n } : n));
    }
  };

  const updateNurseProfile = async (nurseData: Partial<Nurse>) => {
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
  };

  return (
    <AppContext.Provider value={{
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
    }}>
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used inside an AppContextProvider');
  return context;
};
