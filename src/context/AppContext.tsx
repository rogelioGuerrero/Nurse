/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { createContext, useContext, useState, useEffect, useCallback, type FC, type ReactNode } from 'react';
import { Profile, Nurse, Booking, BookingStatus, Availability, CareRequest, CareRequestStatus, CareOffer, CareOfferStatus, ShiftType, SHIFTS, NurseReview } from '../types';
import { INITIAL_NURSES } from '../data/nurses';
import { supabase } from '../lib/supabase';
import { getResponseDeadline } from '../data/platformSettings';
import { requestNotificationPermission, notifyNewOffer, notifyOfferAccepted, notifyCheckIn, notifyCheckOut, notifyPaymentConfirmed } from '../lib/notifications';
import { calculateFamilyPrice } from '../data/standardRates';

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

export type ServiceLogType = 'clinical' | 'physio' | 'companion';

export interface CareLog {
  bookingId: string;
  serviceType: ServiceLogType;
  // Reporte de visita universal
  arrivalTime: string;
  departureTime: string;
  patientConditionOnArrival: 'Bien' | 'Regular' | 'Deteriorado' | 'Crítico';
  patientConditionOnDeparture: 'Mejoró' | 'Igual' | 'Empeoró';
  activities: string[];
  observations: string;
  narrativeReport: string;
  updatedAt: string;
}

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
  republisheCareRequest: (requestId: string) => void;
  careOffers: CareOffer[];
  createCareOffer: (data: Omit<CareOffer, 'id' | 'created_at' | 'status'> & { status?: CareOffer['status'] }) => CareOffer;
  withdrawCareOffer: (offerId: string) => void;
  acceptCareOffer: (offerId: string) => void;
  nurseReviews: NurseReview[];
  submitReview: (bookingId: string, nurseId: string, rating: number, comment?: string) => Promise<void>;
  confirmPayment: (bookingId: string) => Promise<void>;
  updatePatientName: (requestId: string, patientName: string, patientAge?: string, emergencyContact?: string) => Promise<void>;
  updateRequestLocation: (requestId: string, lat: number, lng: number, locationName: string) => Promise<void>;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  selectedNurseId: string | null;
  setSelectedNurseId: (id: string | null) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppContextProvider: FC<{ children: ReactNode }> = ({ children }) => {
  // Load or seed data from local storage (with safe parsing)
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [nurses, setNurses] = useState<Nurse[]>(() => safeParse('biencuidar_nurses', INITIAL_NURSES));

  const [bookings, setBookings] = useState<Booking[]>([]);

  const [activeTab, setActiveTab] = useState<string>('landing');
  const [selectedNurseId, setSelectedNurseId] = useState<string | null>(null);

  const [currentUser, setCurrentUser] = useState<Profile | null>(null);

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
          setCurrentUser(profile);
          setActiveTab(profile.role === 'nurse' ? 'nurse-inbox' : profile.role === 'admin' ? 'admin-panel' : 'care-request');
          requestNotificationPermission();
        }
      }
    };
    
    loadUser();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
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

      // Nurses list is public to authenticated users (for marketplace)
      const { data: nursesResult } = await supabase.from('nurses').select('*');
      nursesData = nursesResult;
      if (nursesData) setNurses(nursesData);

      // Profiles: only admin needs all; users get their own via RLS
      if (isAdmin) {
        const { data: profilesData } = await supabase.from('profiles').select('*');
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
      bookingsData = bookingsResult;
      if (bookingsData) {
        setBookings(bookingsData.map((b: any) => ({ ...b, wants_invoice: b.wants_invoice ?? false })));
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
      if (requestsData) setCareRequests(requestsData.map((r: any) => ({
        ...r,
        wants_invoice: r.wants_invoice ?? false,
        slots: typeof r.slots === 'string' ? JSON.parse(r.slots) : r.slots || []
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
            offersQuery = offersQuery.eq('request_id', 'none');
          }
        }
      }
      const { data: offersData } = await offersQuery;
      if (offersData) setCareOffers(offersData.map((o: any) => ({
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
              updatedAt: l.updated_at || new Date().toISOString()
            };
          });
          setCareLogs(logsMap);
        }
      }

      // Reviews: public to authenticated
      const { data: reviewsData } = await supabase.from('nurse_reviews').select('*');
      if (reviewsData) setNurseReviews(reviewsData);
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
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'care_requests' }, (payload) => {
        const r = payload.new as any;
        setCareRequests(prev => prev.map(x => x.id === r.id ? { ...r, slots: typeof r.slots === 'string' ? JSON.parse(r.slots) : r.slots || [] } : x));
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'care_offers' }, (payload) => {
        const o = payload.new as any;
        // Only process if relevant to current user
        const isRelevant = currentUser.role === 'admin' ||
          o.nurse_id === nursesData?.find(n => n.user_id === currentUser.id)?.id ||
          careRequests.some(req => req.id === o.request_id && req.user_id === currentUser.id);
        if (isRelevant) {
          setCareOffers(prev => prev.find(x => x.id === o.id) ? prev : [{ ...o, message: o.notes || '' }, ...prev]);
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
        } else if (payload.eventType === 'UPDATE') {
          setBookings(prev => prev.map(x => x.id === b.id ? b : x));
        }
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'care_logs' }, (payload) => {
        const l = payload.new as any;
        // Only process if the booking belongs to the user
        const bookingIds = (bookingsData || []).map(b => b.id);
        if (bookingIds.includes(l.booking_id)) {
          setCareLogs(prev => ({ ...prev, [l.booking_id]: { bookingId: l.booking_id, serviceType: l.service_type || 'clinical', arrivalTime: l.arrival_time || '', departureTime: l.departure_time || '', patientConditionOnArrival: l.patient_condition_on_arrival || 'Bien', patientConditionOnDeparture: l.patient_condition_on_departure || 'Igual', activities: typeof l.activities === 'string' ? JSON.parse(l.activities) : l.activities || [], observations: l.observations || '', narrativeReport: l.narrative_report || '', updatedAt: l.updated_at || new Date().toISOString() } }));
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'care_logs' }, (payload) => {
        const l = payload.new as any;
        const bookingIds = (bookingsData || []).map(b => b.id);
        if (bookingIds.includes(l.booking_id)) {
          setCareLogs(prev => ({ ...prev, [l.booking_id]: { bookingId: l.booking_id, serviceType: l.service_type || 'clinical', arrivalTime: l.arrival_time || '', departureTime: l.departure_time || '', patientConditionOnArrival: l.patient_condition_on_arrival || 'Bien', patientConditionOnDeparture: l.patient_condition_on_departure || 'Igual', activities: typeof l.activities === 'string' ? JSON.parse(l.activities) : l.activities || [], observations: l.observations || '', narrativeReport: l.narrative_report || '', updatedAt: l.updated_at || new Date().toISOString() } }));
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

  const [currentNurse, setCurrentNurse] = useState<Nurse | null>(null);

  // Care logs state (moved from BookingsManager for centralized access)
  const [careLogs, setCareLogs] = useState<Record<string, CareLog>>({});

  const saveCareLog = useCallback((bookingId: string, log: Omit<CareLog, 'bookingId' | 'updatedAt'>) => {
    const updatedLog = {
      ...log,
      bookingId,
      updatedAt: new Date().toISOString()
    };
    setCareLogs(prev => ({
      ...prev,
      [bookingId]: updatedLog
    }));
    // Save to Supabase (upsert)
    supabase.from('care_logs').upsert({
      booking_id: bookingId,
      service_type: log.serviceType,
      arrival_time: log.arrivalTime,
      departure_time: log.departureTime,
      patient_condition_on_arrival: log.patientConditionOnArrival,
      patient_condition_on_departure: log.patientConditionOnDeparture,
      activities: JSON.stringify(log.activities),
      observations: log.observations,
      narrative_report: log.narrativeReport,
      updated_at: updatedLog.updatedAt
    }, { onConflict: 'booking_id' }).then(({ error }) => {
      if (error) console.warn('Failed to save care log to Supabase:', error.message);
    });
  }, []);

  // Care requests state (family posts what they need)
  const [careRequests, setCareRequests] = useState<CareRequest[]>([]);
  const [careOffers, setCareOffers] = useState<CareOffer[]>([]);

  const createCareRequest = useCallback((data: Omit<CareRequest, 'id' | 'user_id' | 'created_at' | 'status' | 'response_deadline'>): CareRequest => {
    if (!currentUser) throw new Error('Debes iniciar sesión para publicar una solicitud.');
    
    // Validar límite de solicitudes activas en fase de arranque (máximo 2 abiertas)
    const activeRequestsCount = careRequests.filter(r => r.user_id === currentUser.id && r.status === 'open').length;
    if (activeRequestsCount >= 2) {
      throw new Error('Por seguridad y control de calidad en fase de arranque, solo puedes tener un máximo de 2 solicitudes activas simultáneamente.');
    }

    const now = new Date().toISOString();
    const newRequest: CareRequest = {
      ...data,
      id: crypto.randomUUID(),
      user_id: currentUser.id,
      status: 'open',
      response_deadline: getResponseDeadline(now),
      created_at: now
    };
    setCareRequests(prev => [newRequest, ...prev]);
    // Save to Supabase
    supabase.from('care_requests').insert({
      id: newRequest.id,
      user_id: currentUser.id,
      patient_name: data.patient_name,
      patient_condition: data.patient_condition,
      specialization_needed: data.specialization_needed,
      slots: JSON.stringify(data.slots),
      location_name: data.location_name,
      lat: data.lat,
      lng: data.lng,
      notes: data.notes || null,
      wants_invoice: data.wants_invoice,
      status: 'open',
      response_deadline: newRequest.response_deadline,
      created_at: now
    }).then(({ error }) => {
      if (error) console.warn('Failed to save care request to Supabase:', error.message);
    });
    return newRequest;
  }, [currentUser, careRequests]);

  const closeCareRequest = useCallback((requestId: string) => {
    setCareRequests(prev => prev.map(r => r.id === requestId ? { ...r, status: 'closed' as CareRequestStatus } : r));
    setCareOffers(prev => prev.map(o => o.request_id === requestId && o.status === 'pending' ? { ...o, status: 'declined' as CareOfferStatus, reject_reason: 'auto' } : o));
    supabase.from('care_requests').update({ status: 'closed' }).eq('id', requestId).then(({ error }) => { if (error) console.warn('closeCareRequest sync error:', error.message); });
    supabase.from('care_offers').update({ status: 'rejected', reject_reason: 'auto' }).eq('request_id', requestId).eq('status', 'pending').then(({ error }) => { if (error) console.warn('closeCareRequest offers sync error:', error.message); });
  }, []);

  const republisheCareRequest = useCallback((requestId: string) => {
    const original = careRequests.find(r => r.id === requestId);
    if (!original) return;
    const now = new Date().toISOString();
    const newRequest: CareRequest = {
      ...original,
      id: crypto.randomUUID(),
      status: 'open',
      response_deadline: getResponseDeadline(now),
      created_at: now,
    };
    setCareRequests(prev => [newRequest, ...prev]);
    supabase.from('care_requests').insert({
      id: newRequest.id,
      user_id: newRequest.user_id,
      patient_name: newRequest.patient_name,
      patient_condition: newRequest.patient_condition,
      specialization_needed: newRequest.specialization_needed,
      slots: JSON.stringify(newRequest.slots),
      location_name: newRequest.location_name,
      lat: newRequest.lat,
      lng: newRequest.lng,
      notes: newRequest.notes,
      wants_invoice: newRequest.wants_invoice,
      status: 'open',
      response_deadline: newRequest.response_deadline,
      created_at: now
    }).then(({ error }) => {
      if (error) console.warn('Failed to republish care request:', error.message);
    });
  }, [careRequests]);

  const createCareOffer = useCallback((data: Omit<CareOffer, 'id' | 'created_at' | 'status'> & { status?: CareOffer['status'] }): CareOffer => {
    const newOffer: CareOffer = {
      ...data,
      id: crypto.randomUUID(),
      status: data.status || 'pending',
      created_at: new Date().toISOString()
    };
    setCareOffers(prev => [newOffer, ...prev]);
    // Save to Supabase
    supabase.from('care_offers').insert({
      id: newOffer.id,
      request_id: data.request_id,
      nurse_id: data.nurse_id,
      slot_index: data.slot_index,
      offered_rate: data.offered_rate,
      status: data.status || 'pending',
      notes: data.message || null,
      created_at: newOffer.created_at
    }).then(({ error }) => {
      if (error) console.warn('Failed to save care offer to Supabase:', error.message);
    });
    // Notify family (if they're not the current user)
    const request = careRequests.find(r => r.id === data.request_id);
    if (request && currentUser?.id !== request.user_id) {
      const nurse = nurses.find(n => n.id === data.nurse_id);
      const nurseProfile = nurse ? profiles.find(p => p.id === nurse.user_id) : null;
      notifyNewOffer(nurseProfile?.full_name || 'Una enfermera', request.patient_name);
    }
    return newOffer;
  }, [careRequests, currentUser, nurses, profiles]);

  const withdrawCareOffer = useCallback((offerId: string) => {
    setCareOffers(prev => prev.map(o => o.id === offerId ? { ...o, status: 'rejected' as CareOfferStatus } : o));
    supabase.from('care_offers').update({ status: 'rejected' }).eq('id', offerId).then(({ error }) => { if (error) console.warn('withdrawCareOffer sync error:', error.message); });
  }, []);

  // Synchronize dynamic nurse profile if active user role is 'nurse'
  useEffect(() => {
    if (currentUser && currentUser.role === 'nurse') {
      const foundNurse = nurses.find(n => n.user_id === currentUser.id);
      setCurrentNurse(foundNurse || null);
    } else {
      setCurrentNurse(null);
    }
  }, [currentUser, nurses]);

  // Auto-expire pending bookings older than 24 hours
  useEffect(() => {
    const now = Date.now();
    const expired = bookings.filter(b => 
      b.status === 'pending' && 
      now - new Date(b.created_at).getTime() > 86400000
    );
    if (expired.length > 0) {
      setBookings(prev => prev.map(b => 
        b.status === 'pending' && now - new Date(b.created_at).getTime() > 86400000
          ? { ...b, status: 'cancelled' as BookingStatus }
          : b
      ));
    }
  }, []); // Run once on mount

  // Auto-expire care requests past their response_deadline (12h)
  useEffect(() => {
    const checkExpired = () => {
      const now = Date.now();
      const expiredRequests = careRequests.filter(r => 
        r.status === 'open' && 
        new Date(r.response_deadline).getTime() <= now
      );
      if (expiredRequests.length > 0) {
        const expiredIds = expiredRequests.map(r => r.id);
        setCareRequests(prev => prev.map(r => 
          expiredIds.includes(r.id) ? { ...r, status: 'expired' as CareRequestStatus } : r
        ));
        setCareOffers(prev => prev.map(o => 
          expiredIds.includes(o.request_id) && o.status === 'pending'
            ? { ...o, status: 'declined' as CareOfferStatus, reject_reason: 'auto' }
            : o
        ));
        expiredIds.forEach(id => {
          supabase.from('care_requests').update({ status: 'expired' }).eq('id', id).then(({ error }) => { if (error) console.warn('expire request sync error:', error.message); });
          supabase.from('care_offers').update({ status: 'rejected', reject_reason: 'auto' }).eq('request_id', id).eq('status', 'pending').then(({ error }) => { if (error) console.warn('expire offers sync error:', error.message); });
        });
      }
    };

    checkExpired();
    const interval = setInterval(checkExpired, 60000);
    return () => clearInterval(interval);
  }, [careRequests]);

  // Auto-withdraw nurse's pending offers when one of their offers is accepted (they now have a booking)
  // Only runs on nurse's client — family clients should see offers as-is from Supabase
  useEffect(() => {
    if (!currentUser || currentUser.role !== 'nurse') return;

    // Find nurses that have at least one accepted offer (meaning they got a booking)
    const acceptedNurseIds = new Set(
      careOffers.filter(o => o.status === 'accepted').map(o => o.nurse_id)
    );
    if (acceptedNurseIds.size === 0) return;

    // Find pending offers from those nurses that should be auto-withdrawn
    // (same date as the accepted offer - they can't cover two shifts on the same day)
    const offersToWithdraw = careOffers.filter(o => 
      o.status === 'pending' && acceptedNurseIds.has(o.nurse_id)
    );

    if (offersToWithdraw.length === 0) return;

    // Check if the nurse's accepted offer is for the same date as the pending offer
    const acceptedOffersByNurse = new Map<string, CareOffer[]>();
    careOffers.forEach(o => {
      if (o.status === 'accepted') {
        const list = acceptedOffersByNurse.get(o.nurse_id) || [];
        list.push(o);
        acceptedOffersByNurse.set(o.nurse_id, list);
      }
    });

    const toWithdrawIds: string[] = [];
    offersToWithdraw.forEach(o => {
      const accepted = acceptedOffersByNurse.get(o.nurse_id) || [];
      const request = careRequests.find(r => r.id === o.request_id);
      if (!request) return;
      const offerSlot = request.slots[o.slot_index];
      if (!offerSlot) return;

      // Withdraw if any accepted offer is for the same date
      const shouldWithdraw = accepted.some(ao => {
        const acceptedReq = careRequests.find(r => r.id === ao.request_id);
        if (!acceptedReq) return false;
        const acceptedSlot = acceptedReq.slots[ao.slot_index];
        if (!acceptedSlot) return false;
        return acceptedSlot.date === offerSlot.date;
      });

      if (shouldWithdraw) toWithdrawIds.push(o.id);
    });

    if (toWithdrawIds.length > 0) {
      setCareOffers(prev => prev.map(o => 
        toWithdrawIds.includes(o.id)
          ? { ...o, status: 'declined' as CareOfferStatus, reject_reason: 'auto' }
          : o
      ));
      toWithdrawIds.forEach(id => {
        supabase.from('care_offers').update({ status: 'rejected', reject_reason: 'auto' }).eq('id', id).then(({ error }) => { if (error) console.warn('withdraw expired offers sync error:', error.message); });
      });
    }
  }, [careOffers, careRequests, currentUser]);

  // Bookings are sourced from Supabase + realtime

  // Action: Update profiles (also syncs currentNurse if user is a nurse)
  const updateProfile = async (profileData: Partial<Profile>) => {
    if (!currentUser) return;
    const updated = { ...currentUser, ...profileData, updated_at: new Date().toISOString() };
    setCurrentUser(updated);
    setProfiles(prev => prev.map(p => p.id === updated.id ? updated : p));
    // Sync to Supabase
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
      if (error) console.warn('Failed to sync profile to Supabase:', error.message);
    } catch (err) {
      console.warn('Profile sync error:', err);
    }
    // Sync currentNurse if the updated user is a nurse (nurses array may need refresh)
    if (updated.role === 'nurse') {
      setNurses(prev => prev.map(n => n.user_id === updated.id ? { ...n } : n));
    }
  };

  // Action: Update nurse rates, bios, specializations
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
        })
        .eq('id', updated.id);
      if (error) console.warn('Failed to sync nurse profile to Supabase:', error.message);
    } catch (err) {
      console.warn('Nurse profile sync error:', err);
    }
  };

  // Action: Create booking (Supabase only, no localStorage fallback)
  const createBooking = async (bookingData: Omit<Booking, 'id' | 'user_id' | 'created_at' | 'status'>) => {
    if (!currentUser) throw new Error('Debes iniciar sesión para agendar.');
    
    // Validate no double-booking: same nurse, same date, overlapping time
    const overlapping = bookings.find(b => 
      b.nurse_id === bookingData.nurse_id &&
      b.date === bookingData.date &&
      b.status !== 'cancelled' &&
      bookingData.start_time < b.end_time &&
      bookingData.end_time > b.start_time
    );
    if (overlapping) {
      throw new Error('Esta enfermera ya tiene una reserva en ese horario. Elige otra fecha u hora.');
    }
    
    const newBooking: Booking = {
      ...bookingData,
      id: crypto.randomUUID(),
      user_id: currentUser.id,
      status: 'confirmed',
      created_at: new Date().toISOString()
    };

    try {
      const { data, error } = await supabase
        .from('bookings')
        .insert({
          user_id: currentUser.id,
          nurse_id: bookingData.nurse_id,
          date: bookingData.date,
          start_time: bookingData.start_time,
          end_time: bookingData.end_time,
          hours: bookingData.hours,
          status: 'confirmed',
          total_price: bookingData.total_price,
          notes: bookingData.notes,
          patient_name: bookingData.patient_name,
          patient_condition: bookingData.patient_condition,
          wants_invoice: bookingData.wants_invoice ?? false,
          location_name: bookingData.location_name || null,
          lat: bookingData.lat || null,
          lng: bookingData.lng || null
        })
        .select()
        .single();

      if (error) throw error;

      // Use Supabase response if successful
      setBookings(prev => [{
        ...newBooking,
        id: data.id,
        created_at: data.created_at
      }, ...prev]);
      return { ...newBooking, id: data.id, created_at: data.created_at };
    } catch (err) {
      // No silent fallback — inform the user that the booking failed
      throw new Error('No se pudo crear la reserva. Verifica tu conexión e intenta nuevamente.');
    }
  };

  const acceptCareOffer = useCallback(async (offerId: string) => {
    const offer = careOffers.find(o => o.id === offerId);
    if (!offer) return;

    // Marcar offer como aceptado y otros como rechazados
    setCareOffers(prev => prev.map(o => o.id === offerId ? { ...o, status: 'accepted' } : { ...o, status: o.status === 'pending' ? 'declined' : o.status, reject_reason: o.status === 'pending' ? 'auto' : o.reject_reason }));
    
    // Sync offers to Supabase
    supabase.from('care_offers').update({ status: 'accepted' }).eq('id', offerId).then(({ error }) => { if (error) console.warn('accept offer sync error:', error.message); });
    supabase.from('care_offers').update({ status: 'rejected' }).eq('request_id', offer.request_id).neq('id', offerId).eq('status', 'pending').then(({ error }) => { if (error) console.warn('reject other offers sync error:', error.message); });

    // Marcar request como matched
    setCareRequests(reqs => reqs.map(r => r.id === offer.request_id ? { ...r, status: 'matched' } : r));
    supabase.from('care_requests').update({ status: 'matched' }).eq('id', offer.request_id).then(({ error }) => { if (error) console.warn('match request sync error:', error.message); });

    // Crear booking automaticamente usando offered_rate
    const request = careRequests.find(r => r.id === offer.request_id);
    if (request) {
      const slot = request.slots[offer.slot_index];
      const shift = SHIFTS[slot.shift];
      const nurseRate = Number(offer.offered_rate);
      const totalPrice = calculateFamilyPrice(nurseRate, request.wants_invoice);
      
      await createBooking({
        nurse_id: offer.nurse_id,
        date: slot.date,
        start_time: shift.start,
        end_time: shift.end,
        hours: shift.hours,
        total_price: totalPrice,
        patient_name: request.patient_name,
        patient_condition: request.patient_condition,
        notes: request.notes,
        lat: request.lat,
        lng: request.lng,
        location_name: request.location_name,
        wants_invoice: request.wants_invoice,
      });

      // Auto-withdraw nurse's other pending offers for the same date (server-side)
      // This prevents double-booking when the nurse isn't online
      const sameDateOffers = careOffers.filter(o =>
        o.nurse_id === offer.nurse_id &&
        o.status === 'pending' &&
        o.id !== offer.id
      );
      const toWithdraw = sameDateOffers.filter(o => {
        const req = careRequests.find(r => r.id === o.request_id);
        if (!req) return false;
        const otherSlot = req.slots[o.slot_index];
        if (!otherSlot) return false;
        return otherSlot.date === slot.date;
      });
      if (toWithdraw.length > 0) {
        const withdrawIds = toWithdraw.map(o => o.id);
        setCareOffers(prev => prev.map(o =>
          withdrawIds.includes(o.id)
            ? { ...o, status: 'declined' as CareOfferStatus, reject_reason: 'auto' }
            : o
        ));
        supabase.from('care_offers')
          .update({ status: 'rejected', reject_reason: 'auto' })
          .in('id', withdrawIds)
          .then(({ error }) => { if (error) console.warn('auto-withdraw same-date offers sync error:', error.message); });
      }

      // Notify nurse (if they're not the current user)
      const nurse = nurses.find(n => n.id === offer.nurse_id);
      if (nurse && currentUser?.id !== nurse.user_id) {
        notifyOfferAccepted(request.patient_name);
      }
    }
  }, [careOffers, careRequests, createBooking]);

  // Nurse reviews
  const [nurseReviews, setNurseReviews] = useState<NurseReview[]>([]);

  const submitReview = async (bookingId: string, nurseId: string, rating: number, comment?: string) => {
    if (!currentUser) return;
    const newReview: NurseReview = {
      id: crypto.randomUUID(),
      booking_id: bookingId,
      nurse_id: nurseId,
      user_id: currentUser.id,
      rating,
      comment,
      created_at: new Date().toISOString(),
    };
    setNurseReviews(prev => [...prev, newReview]);

    try {
      const { error } = await supabase
        .from('nurse_reviews')
        .insert({
          booking_id: bookingId,
          nurse_id: nurseId,
          user_id: currentUser.id,
          rating,
          comment: comment || null,
        });
      if (error) throw error;
    } catch {
      console.warn('Failed to save review to Supabase');
    }
  };

  const confirmPayment = async (bookingId: string) => {
    setBookings(prev => prev.map(b => b.id === bookingId ? { ...b, payment_status: 'paid' } : b));
    try {
      const { error } = await supabase
        .from('bookings')
        .update({ payment_status: 'paid' })
        .eq('id', bookingId);
      if (error) throw error;
      // Notify nurse that payment is confirmed
      const booking = bookings.find(b => b.id === bookingId);
      if (booking) {
        const nurse = nurses.find(n => n.id === booking.nurse_id);
        if (nurse && currentUser?.id !== nurse.user_id) {
          notifyPaymentConfirmed(booking.patient_name);
        }
      }
    } catch (err) {
      // Rollback on error
      setBookings(prev => prev.map(b => b.id === bookingId ? { ...b, payment_status: 'pending' } : b));
      console.warn('Payment confirmation failed, rolled back:', err);
    }
  };

  // Action: Update patient name on request and related bookings
  const updatePatientName = async (requestId: string, patientName: string, patientAge?: string, emergencyContact?: string) => {
    const prevRequests = careRequests;
    const prevBookings = bookings;

    setCareRequests(prev => prev.map(r => r.id === requestId ? {
      ...r,
      patient_name: patientName,
      patient_data: {
        ...(r.patient_data || { diagnosis: '', autonomy: '', allergies: '', medications: '', emergency_contact: '' }),
        emergency_contact: emergencyContact ?? r.patient_data?.emergency_contact ?? '',
      }
    } : r));
    setBookings(prev => prev.map(b => {
      const req = careRequests.find(r => r.id === requestId);
      if (req && (b.patient_name === 'Por confirmar' || b.patient_name === req.patient_name)) {
        return {
          ...b,
          patient_name: patientName,
          patient_age: patientAge || b.patient_age,
          emergency_contact: emergencyContact || b.emergency_contact,
        };
      }
      return b;
    }));

    try {
      const updateData: Record<string, unknown> = { patient_name: patientName };
      if (emergencyContact !== undefined) {
        const request = careRequests.find(r => r.id === requestId);
        const patientData = {
          ...(request?.patient_data || { diagnosis: '', autonomy: '', allergies: '', medications: '', emergency_contact: '' }),
          emergency_contact: emergencyContact
        };
        updateData.patient_data = JSON.stringify(patientData);
      }
      await supabase.from('care_requests').update(updateData).eq('id', requestId);
      const request = careRequests.find(r => r.id === requestId);
      const relatedBookings = bookings.filter(b =>
        request && (b.patient_name === 'Por confirmar' || b.patient_name === request.patient_name)
      );
      for (const b of relatedBookings) {
        await supabase.from('bookings').update({
          patient_name: patientName,
          patient_age: patientAge || null,
          emergency_contact: emergencyContact || null,
        }).eq('id', b.id);
      }
    } catch (err) {
      setCareRequests(prevRequests);
      setBookings(prevBookings);
      console.warn('Patient name update failed, rolled back:', err);
    }
  };

  // Action: Update request location with GPS coordinates
  const updateRequestLocation = async (requestId: string, lat: number, lng: number, locationName: string) => {
    const prevRequests = careRequests;
    const prevBookings = bookings;

    setCareRequests(prev => prev.map(r => r.id === requestId ? { ...r, lat, lng, location_name: locationName } : r));
    setBookings(prev => prev.map(b => {
      const req = careRequests.find(r => r.id === requestId);
      if (req && (b.patient_name === 'Por confirmar' || b.patient_name === req.patient_name)) {
        return { ...b, lat, lng, location_name: locationName };
      }
      return b;
    }));

    try {
      await supabase.from('care_requests').update({ lat, lng, location_name: locationName }).eq('id', requestId);
      const request = careRequests.find(r => r.id === requestId);
      const relatedBookings = bookings.filter(b =>
        request && (b.patient_name === 'Por confirmar' || b.patient_name === request.patient_name)
      );
      for (const b of relatedBookings) {
        await supabase.from('bookings').update({ lat, lng, location_name: locationName }).eq('id', b.id);
      }
    } catch (err) {
      setCareRequests(prevRequests);
      setBookings(prevBookings);
      console.warn('Location update failed, rolled back:', err);
    }
  };

  // Action: Update state of booking (optimistic update with rollback)
  const updateBookingStatus = async (bookingId: string, status: BookingStatus) => {
    const prevBookings = bookings;
    setBookings(prev => prev.map(b => b.id === bookingId ? { ...b, status } : b));

    try {
      const { error } = await supabase
        .from('bookings')
        .update({ status })
        .eq('id', bookingId);

      if (error) throw error;
    } catch {
      // Rollback on failure
      setBookings(prevBookings);
      console.warn('Booking status update failed, rolled back to previous state.');
    }
  };

  // Action: Check-in booking with GPS
  const checkInBooking = async (bookingId: string, lat: number, lng: number, address: string, mismatch: boolean) => {
    const prevBookings = bookings;
    const now = new Date().toISOString();
    setBookings(prev => prev.map(b => b.id === bookingId ? { ...b, check_in_at: now, check_in_lat: lat, check_in_lng: lng, check_in_address: address, address_mismatch: mismatch } : b));

    try {
      const { error } = await supabase
        .from('bookings')
        .update({ check_in_at: now, check_in_lat: lat, check_in_lng: lng, check_in_address: address, address_mismatch: mismatch })
        .eq('id', bookingId);

      if (error) throw error;
      // Notify family
      const booking = bookings.find(b => b.id === bookingId);
      if (booking) {
        const nurse = nurses.find(n => n.id === booking.nurse_id);
        const nurseProfile = nurse ? profiles.find(p => p.id === nurse.user_id) : null;
        if (currentUser?.id !== booking.user_id) {
          notifyCheckIn(nurseProfile?.full_name || 'La enfermera');
        }
      }
    } catch {
      setBookings(prevBookings);
      console.warn('Check-in failed, rolled back.');
    }
  };

  // Action: Check-out booking with GPS
  const checkOutBooking = async (bookingId: string, lat: number, lng: number) => {
    const prevBookings = bookings;
    const now = new Date().toISOString();
    const booking = bookings.find(b => b.id === bookingId);
    // Without invoice: payment is direct, mark as paid on check-out
    const paymentUpdate = booking && !booking.wants_invoice ? { payment_status: 'paid' as const } : {};
    setBookings(prev => prev.map(b => b.id === bookingId ? { ...b, check_out_at: now, check_out_lat: lat, check_out_lng: lng, status: 'completed', ...paymentUpdate } : b));

    try {
      const { error } = await supabase
        .from('bookings')
        .update({ check_out_at: now, check_out_lat: lat, check_out_lng: lng, status: 'completed', ...paymentUpdate })
        .eq('id', bookingId);

      if (error) throw error;
      // Notify family
      if (booking) {
        const nurse = nurses.find(n => n.id === booking.nurse_id);
        const nurseProfile = nurse ? profiles.find(p => p.id === nurse.user_id) : null;
        if (currentUser?.id !== booking.user_id) {
          notifyCheckOut(nurseProfile?.full_name || 'La enfermera');
        }
      }
    } catch {
      setBookings(prevBookings);
      console.warn('Check-out failed, rolled back.');
    }
  };

  // Availability functions (with localStorage fallback for demo mode)
  // Seed availability for demo nurses if none exists
  const [availabilityCache, setAvailabilityCache] = useState<Availability[]>(() => {
    const saved = safeParse<Availability[] | null>('biencuidar_availability', null);
    if (saved) return saved;
    // Generate seed availability for demo nurses: next 30 days, 06:00-18:00
    const seed: Availability[] = [];
    const today = new Date();
    for (const nurse of INITIAL_NURSES) {
      for (let d = 0; d < 30; d++) {
        const date = new Date(today);
        date.setDate(date.getDate() + d);
        const dateStr = date.toISOString().split('T')[0];
        // Skip Sundays for variety
        if (date.getDay() === 0) continue;
        seed.push({
          id: crypto.randomUUID(),
          nurse_id: nurse.id,
          date: dateStr,
          start_time: '06:00',
          end_time: '18:00',
          is_available: true,
          created_at: today.toISOString(),
          updated_at: today.toISOString()
        });
      }
    }
    return seed;
  });

  useEffect(() => {
    localStorage.setItem('biencuidar_availability', JSON.stringify(availabilityCache));
  }, [availabilityCache]);

  const getAvailability = async (nurseId: string, startDate: string, endDate: string): Promise<Availability[]> => {
    try {
      const { data, error } = await supabase
        .from('availability')
        .select('*')
        .eq('nurse_id', nurseId)
        .gte('date', startDate)
        .lte('date', endDate)
        .order('date', { ascending: true });

      if (error) throw error;
      return data || [];
    } catch {
      // Fallback to localStorage cache
      return availabilityCache.filter(
        a => a.nurse_id === nurseId &&
        a.date >= startDate &&
        a.date <= endDate &&
        a.is_available
      );
    }
  };

  const addAvailability = async (availabilityData: Omit<Availability, 'id' | 'created_at' | 'updated_at'>): Promise<Availability> => {
    const newAvailability: Availability = {
      ...availabilityData,
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    setAvailabilityCache(prev => [...prev, newAvailability]);

    try {
      const { data, error } = await supabase
        .from('availability')
        .insert(availabilityData)
        .select()
        .single();

      if (error) throw error;

      return {
        ...newAvailability,
        id: data.id,
        created_at: data.created_at,
        updated_at: data.updated_at
      };
    } catch (err) {
      console.warn('Failed to save availability to Supabase:', err);
      return newAvailability;
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
      confirmPayment,
      updatePatientName,
      updateRequestLocation,
      activeTab,
      setActiveTab,
      selectedNurseId,
      setSelectedNurseId
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
