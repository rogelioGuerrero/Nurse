/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { createContext, useContext, useState, useEffect, useCallback, type FC, type ReactNode } from 'react';
import { Profile, Nurse, Booking, BookingStatus, Availability, CareRequest, CareOffer, ShiftType, SHIFTS } from '../types';
import { INITIAL_PROFILES, INITIAL_NURSES } from '../data/nurses';
import { supabase } from '../lib/supabase';
import { getResponseDeadline } from '../data/platformSettings';

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
  // Campos clínicos (cuidado clínico)
  bloodPressure: string;
  heartRate: string;
  glucose: string;
  temperature: string;
  mood: string;
  // Campos fisioterapia
  exercisesDone: string;
  mobilityLevel: string;
  painBefore: string;
  painAfter: string;
  // Campos acompañamiento
  activitiesDone: string;
  // Común a todos
  remarks: string;
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
  getAvailability: (nurseId: string, startDate: string, endDate: string) => Promise<Availability[]>;
  addAvailability: (availabilityData: Omit<Availability, 'id' | 'created_at' | 'updated_at'>) => Promise<Availability>;
  careLogs: Record<string, CareLog>;
  saveCareLog: (bookingId: string, log: Omit<CareLog, 'bookingId' | 'updatedAt'>) => void;
  careRequests: CareRequest[];
  createCareRequest: (data: Omit<CareRequest, 'id' | 'user_id' | 'created_at' | 'status' | 'response_deadline'>) => CareRequest;
  careOffers: CareOffer[];
  createCareOffer: (data: Omit<CareOffer, 'id' | 'created_at' | 'status'> & { status?: CareOffer['status'] }) => CareOffer;
  acceptCareOffer: (offerId: string) => void;
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
        status: 'pending',
        total_price: 60,
        patient_name: 'Don Alberto Gómez (Padre)',
        patient_condition: 'Etapa inicial de Alzheimer, requiere cuidados e hidratación.',
        notes: 'Le agrada conversar de historia y caminar un poco en el jardín.',
        created_at: new Date().toISOString()
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
        created_at: new Date(Date.now() - 86400000 * 5).toISOString()
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
        }
      } else if (event === 'SIGNED_OUT') {
        setCurrentUser(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Load profiles and nurses from Supabase Database
  useEffect(() => {
    const loadData = async () => {
      const { data: profilesData } = await supabase.from('profiles').select('*');
      const { data: nursesData } = await supabase.from('nurses').select('*');
      
      if (profilesData) setProfiles(profilesData);
      if (nursesData) setNurses(nursesData);
    };
    
    loadData();
  }, []);

  const [currentNurse, setCurrentNurse] = useState<Nurse | null>(null);

  // Care logs state (moved from BookingsManager for centralized access)
  const [careLogs, setCareLogs] = useState<Record<string, CareLog>>(() => {
    const saved = safeParse<Record<string, CareLog> | null>('biencuidar_carelogs', null);
    if (saved) return saved;
    return {
      'b-demo-2': {
        bookingId: 'b-demo-2',
        serviceType: 'clinical',
        bloodPressure: '120/80 mmHg',
        heartRate: '72 lpm',
        glucose: '115 mg/dL',
        temperature: '36.6 °C',
        mood: 'Alegre',
        exercisesDone: '',
        mobilityLevel: '',
        painBefore: '',
        painAfter: '',
        activitiesDone: '',
        remarks: 'Paciente completó con éxito su almuerzo y caminó en el jardín por 15 minutos. Nivel de oxígeno estable. Se tomó su recordatorio de medicina puntual.',
        updatedAt: new Date(Date.now() - 86400000 * 3).toISOString()
      }
    };
  });

  useEffect(() => {
    localStorage.setItem('biencuidar_carelogs', JSON.stringify(careLogs));
  }, [careLogs]);

  const saveCareLog = useCallback((bookingId: string, log: Omit<CareLog, 'bookingId' | 'updatedAt'>) => {
    setCareLogs(prev => ({
      ...prev,
      [bookingId]: {
        ...log,
        bookingId,
        updatedAt: new Date().toISOString()
      }
    }));
  }, []);

  // Care requests state (family posts what they need)
  // Migration: clear old-format requests that used start_time/end_time instead of shift
  const [careRequests, setCareRequests] = useState<CareRequest[]>(() => {
    const raw = safeParse('biencuidar_carerequests', []);
    const migrated = raw.map((r: CareRequest) => ({
      ...r,
      slots: (r.slots || []).map((s: { date: string; shift?: string; start_time?: string }) => ({
        date: s.date,
        shift: (s.shift || 'morning') as ShiftType
      }))
    }));
    return migrated;
  });

  useEffect(() => {
    localStorage.setItem('biencuidar_carerequests', JSON.stringify(careRequests));
  }, [careRequests]);

  const [careOffers, setCareOffers] = useState<CareOffer[]>(() => safeParse('biencuidar_careoffers', []));

  useEffect(() => {
    localStorage.setItem('biencuidar_careoffers', JSON.stringify(careOffers));
  }, [careOffers]);

  const createCareRequest = useCallback((data: Omit<CareRequest, 'id' | 'user_id' | 'created_at' | 'status' | 'response_deadline'>): CareRequest => {
    if (!currentUser) throw new Error('Debes iniciar sesión para publicar una solicitud.');
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
    return newRequest;
  }, [currentUser]);

  const createCareOffer = useCallback((data: Omit<CareOffer, 'id' | 'created_at' | 'status'> & { status?: CareOffer['status'] }): CareOffer => {
    const newOffer: CareOffer = {
      ...data,
      id: `co-${Date.now()}`,
      status: data.status || 'pending',
      created_at: new Date().toISOString()
    };
    setCareOffers(prev => [newOffer, ...prev]);
    return newOffer;
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

  // Save to Local Storage whenever states change (only for data not in Supabase yet)
  useEffect(() => {
    localStorage.setItem('biencuidar_bookings', JSON.stringify(bookings));
  }, [bookings]);

  // Action: Update profiles (also syncs currentNurse if user is a nurse)
  const updateProfile = (profileData: Partial<Profile>) => {
    if (!currentUser) return;
    const updated = { ...currentUser, ...profileData, updated_at: new Date().toISOString() };
    setCurrentUser(updated);
    setProfiles(prev => prev.map(p => p.id === updated.id ? updated : p));
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
      status: 'pending',
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
          status: 'pending',
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
    setCareOffers(prev => prev.map(o => o.id === offerId ? { ...o, status: 'accepted' } : { ...o, status: o.status === 'pending' ? 'rejected' : o.status }));
    
    // Marcar request como matched
    setCareRequests(reqs => reqs.map(r => r.id === offer.request_id ? { ...r, status: 'matched' } : r));

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
        notes: request.notes
      });
    }
  }, [careOffers, careRequests, createBooking]);

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
    setActiveTab(profile.role === 'nurse' ? 'nurse-inbox' : 'care-request');
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
      getAvailability,
      addAvailability,
      careLogs,
      saveCareLog,
      careRequests,
      createCareRequest,
      careOffers,
      createCareOffer,
      acceptCareOffer,
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
