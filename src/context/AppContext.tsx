/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { createContext, useContext, useState, useEffect, useCallback, type FC, type ReactNode } from 'react';
import { Profile, Nurse, Booking, BookingStatus, Availability, CareRequest, CareOffer, ShiftType, SHIFTS, NurseReview } from '../types';
import { INITIAL_PROFILES, INITIAL_NURSES } from '../data/nurses';
import { supabase } from '../lib/supabase';
import { getResponseDeadline } from '../data/platformSettings';
import { requestNotificationPermission, notifyNewOffer, notifyOfferAccepted, notifyCheckIn, notifyCheckOut, notifyPaymentConfirmed } from '../lib/notifications';

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
  switchUser: (profile: Profile) => void;
  currentNurse: Nurse | null;
  updateProfile: (profileData: Partial<Profile>) => void;
  updateNurseProfile: (nurseData: Partial<Nurse>) => void;
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
  careOffers: CareOffer[];
  createCareOffer: (data: Omit<CareOffer, 'id' | 'created_at' | 'status'> & { status?: CareOffer['status'] }) => CareOffer;
  acceptCareOffer: (offerId: string) => void;
  nurseReviews: NurseReview[];
  submitReview: (bookingId: string, nurseId: string, rating: number, comment?: string) => Promise<void>;
  confirmPayment: (bookingId: string) => Promise<void>;
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

  const [bookings, setBookings] = useState<Booking[]>(() => {
    const saved = safeParse<Booking[] | null>('biencuidar_bookings', null);
    if (saved) return saved;
    // Seed default bookings for demo
    return [
      {
        id: 'b-demo-1',
        user_id: '00000000-0000-0000-0000-000000000001',
        nurse_id: '00000000-0000-0000-0000-000000000011',
        date: new Date(Date.now() + 86400000 * 2).toISOString().split('T')[0],
        start_time: '09:00',
        end_time: '14:00',
        hours: 5,
        status: 'confirmed',
        total_price: 60,
        patient_name: 'Don Alberto Gómez (Padre)',
        patient_condition: 'Etapa inicial de Alzheimer, requiere cuidados e hidratación.',
        notes: 'Le agrada conversar de historia y caminar un poco en el jardín.',
        created_at: new Date().toISOString(),
        payment_status: 'pending'
      },
      {
        id: 'b-demo-2',
        user_id: '00000000-0000-0000-0000-000000000001',
        nurse_id: '00000000-0000-0000-0000-000000000013',
        date: new Date(Date.now() - 86400000 * 3).toISOString().split('T')[0],
        start_time: '08:00',
        end_time: '16:00',
        hours: 8,
        status: 'completed',
        total_price: 112,
        patient_name: 'Doña Teresa Ramos (Abuela)',
        patient_condition: 'Postoperatorio de fractura de cadera.',
        notes: 'Muy importante recordar la movilización cada 2 horas.',
        created_at: new Date(Date.now() - 86400000 * 5).toISOString(),
        payment_status: 'paid',
        check_in_at: new Date(Date.now() - 86400000 * 3).toISOString(),
        check_out_at: new Date(Date.now() - 86400000 * 3 + 28800000).toISOString()
      }
    ];
  });

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
    const loadData = async () => {
      const { data: profilesData } = await supabase.from('profiles').select('*');
      const { data: nursesData } = await supabase.from('nurses').select('*');
      const { data: bookingsData } = await supabase.from('bookings').select('*');
      const { data: requestsData } = await supabase.from('care_requests').select('*');
      const { data: offersData } = await supabase.from('care_offers').select('*');
      const { data: logsData } = await supabase.from('care_logs').select('*');
      const { data: reviewsData } = await supabase.from('nurse_reviews').select('*');
      
      if (profilesData) setProfiles(profilesData);
      if (nursesData) setNurses(nursesData);
      if (bookingsData && bookingsData.length > 0) setBookings(bookingsData);
      if (requestsData) setCareRequests(requestsData.map((r: any) => ({
        ...r,
        slots: typeof r.slots === 'string' ? JSON.parse(r.slots) : r.slots || []
      })));
      if (offersData) setCareOffers(offersData.map((o: any) => ({
        ...o,
        message: o.notes || o.message || ''
      })));
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
      if (reviewsData) setNurseReviews(reviewsData);
    };
    
    loadData();

    // Realtime subscriptions
    const channel = supabase
      .channel('public-changes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'care_requests' }, (payload) => {
        const r = payload.new as any;
        setCareRequests(prev => prev.find(x => x.id === r.id) ? prev : [{ ...r, slots: typeof r.slots === 'string' ? JSON.parse(r.slots) : r.slots || [] }, ...prev]);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'care_requests' }, (payload) => {
        const r = payload.new as any;
        setCareRequests(prev => prev.map(x => x.id === r.id ? { ...r, slots: typeof r.slots === 'string' ? JSON.parse(r.slots) : r.slots || [] } : x));
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'care_offers' }, (payload) => {
        const o = payload.new as any;
        setCareOffers(prev => prev.find(x => x.id === o.id) ? prev : [{ ...o, message: o.notes || '' }, ...prev]);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'care_offers' }, (payload) => {
        const o = payload.new as any;
        setCareOffers(prev => prev.map(x => x.id === o.id ? { ...o, message: o.notes || '' } : x));
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, (payload) => {
        const b = payload.new as any;
        if (payload.eventType === 'INSERT') {
          setBookings(prev => prev.find(x => x.id === b.id) ? prev : [b, ...prev]);
        } else if (payload.eventType === 'UPDATE') {
          setBookings(prev => prev.map(x => x.id === b.id ? b : x));
        }
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'care_logs' }, (payload) => {
        const l = payload.new as any;
        setCareLogs(prev => ({ ...prev, [l.booking_id]: { bookingId: l.booking_id, serviceType: l.service_type || 'clinical', arrivalTime: l.arrival_time || '', departureTime: l.departure_time || '', patientConditionOnArrival: l.patient_condition_on_arrival || 'Bien', patientConditionOnDeparture: l.patient_condition_on_departure || 'Igual', activities: typeof l.activities === 'string' ? JSON.parse(l.activities) : l.activities || [], observations: l.observations || '', narrativeReport: l.narrative_report || '', updatedAt: l.updated_at || new Date().toISOString() } }));
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'care_logs' }, (payload) => {
        const l = payload.new as any;
        setCareLogs(prev => ({ ...prev, [l.booking_id]: { bookingId: l.booking_id, serviceType: l.service_type || 'clinical', arrivalTime: l.arrival_time || '', departureTime: l.departure_time || '', patientConditionOnArrival: l.patient_condition_on_arrival || 'Bien', patientConditionOnDeparture: l.patient_condition_on_departure || 'Igual', activities: typeof l.activities === 'string' ? JSON.parse(l.activities) : l.activities || [], observations: l.observations || '', narrativeReport: l.narrative_report || '', updatedAt: l.updated_at || new Date().toISOString() } }));
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'nurse_reviews' }, (payload) => {
        const rv = payload.new as any;
        setNurseReviews(prev => prev.find(x => x.id === rv.id) ? prev : [...prev, rv]);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

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
      id: `cr-${Date.now()}`,
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
      status: 'open',
      response_deadline: newRequest.response_deadline,
      created_at: now
    }).then(({ error }) => {
      if (error) console.warn('Failed to save care request to Supabase:', error.message);
    });
    return newRequest;
  }, [currentUser, careRequests]);

  const createCareOffer = useCallback((data: Omit<CareOffer, 'id' | 'created_at' | 'status'> & { status?: CareOffer['status'] }): CareOffer => {
    const newOffer: CareOffer = {
      ...data,
      id: `co-${Date.now()}`,
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

  // Save to Local Storage whenever states change (only for data not in Supabase yet)
  useEffect(() => {
    localStorage.setItem('biencuidar_bookings', JSON.stringify(bookings));
  }, [bookings]);

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
    // Immediately sync currentNurse if the updated user is a nurse
    if (updated.role === 'nurse') {
      setCurrentNurse(prev => prev ? { ...prev } : prev);
    }
  };

  // Action: Update nurse rates, bios, specializations
  const updateNurseProfile = (nurseData: Partial<Nurse>) => {
    if (!currentNurse) return;
    const updated = { ...currentNurse, ...nurseData };
    setNurses(prev => prev.map(n => n.id === updated.id ? updated : n));
  };

  // Action: Create high fidelity booking (with localStorage fallback for demo mode)
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
      id: `b-${Date.now()}`,
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
          patient_condition: bookingData.patient_condition
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
    } catch {
      // Fallback to localStorage for demo mode
      setBookings(prev => [newBooking, ...prev]);
      return newBooking;
    }
  };

  const acceptCareOffer = useCallback(async (offerId: string) => {
    const offer = careOffers.find(o => o.id === offerId);
    if (!offer) return;

    // Marcar offer como aceptado y otros como rechazados
    setCareOffers(prev => prev.map(o => o.id === offerId ? { ...o, status: 'accepted' } : { ...o, status: o.status === 'pending' ? 'declined' : o.status, reject_reason: o.status === 'pending' ? 'auto' : o.reject_reason }));
    
    // Sync offers to Supabase
    supabase.from('care_offers').update({ status: 'accepted' }).eq('id', offerId).then();
    supabase.from('care_offers').update({ status: 'rejected' }).eq('request_id', offer.request_id).neq('id', offerId).eq('status', 'pending').then();

    // Marcar request como matched
    setCareRequests(reqs => reqs.map(r => r.id === offer.request_id ? { ...r, status: 'matched' } : r));
    supabase.from('care_requests').update({ status: 'matched' }).eq('id', offer.request_id).then();

    // Crear booking automaticamente usando offered_rate
    const request = careRequests.find(r => r.id === offer.request_id);
    if (request) {
      const slot = request.slots[offer.slot_index];
      const shift = SHIFTS[slot.shift];
      const hours = 8; // cada turno son 8 horas
      const totalPrice = offer.offered_rate * hours;
      
      await createBooking({
        nurse_id: offer.nurse_id,
        date: slot.date,
        start_time: shift.start,
        end_time: shift.end,
        hours,
        total_price: totalPrice,
        patient_name: request.patient_name,
        patient_condition: request.patient_condition,
        notes: request.notes,
        lat: request.lat,
        lng: request.lng,
      });

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
      id: `rev-${Date.now()}`,
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
    } catch {
      // Rollback on error
      setBookings(prev => prev.map(b => b.id === bookingId ? { ...b, payment_status: 'pending' } : b));
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
    setBookings(prev => prev.map(b => b.id === bookingId ? { ...b, check_out_at: now, check_out_lat: lat, check_out_lng: lng, status: 'completed' } : b));

    try {
      const { error } = await supabase
        .from('bookings')
        .update({ check_out_at: now, check_out_lat: lat, check_out_lng: lng, status: 'completed' })
        .eq('id', bookingId);

      if (error) throw error;
      // Notify family
      const booking = bookings.find(b => b.id === bookingId);
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
          id: `av-seed-${nurse.id}-${dateStr}`,
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
      id: `av-${Date.now()}`,
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
    } catch {
      return newAvailability;
    }
  };

  const switchUser = (profile: Profile) => {
    setCurrentUser(profile);
    setActiveTab(profile.role === 'nurse' ? 'nurse-inbox' : profile.role === 'admin' ? 'admin-panel' : 'care-request');
  };

  return (
    <AppContext.Provider value={{
      profiles,
      nurses,
      bookings,
      currentUser,
      switchUser,
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
      careOffers,
      createCareOffer,
      acceptCareOffer,
      nurseReviews,
      submitReview,
      confirmPayment,
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
