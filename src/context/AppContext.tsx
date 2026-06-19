/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { createContext, useContext, useState, useEffect } from 'react';
import { Profile, Nurse, Booking, BookingStatus, Availability } from '../types';
import { INITIAL_PROFILES, INITIAL_NURSES } from '../data/nurses';
import { supabase } from '../lib/supabase';

interface AppContextType {
  profiles: Profile[];
  nurses: Nurse[];
  bookings: Booking[];
  availability: Availability[];
  currentUser: Profile | null;
  currentNurse: Nurse | null;
  updateProfile: (profileData: Partial<Profile>) => void;
  updateNurseProfile: (nurseData: Partial<Nurse>) => void;
  createBooking: (bookingData: Omit<Booking, 'id' | 'user_id' | 'created_at' | 'status'>) => Promise<Booking>;
  updateBookingStatus: (bookingId: string, status: BookingStatus) => Promise<void>;
  getAvailability: (nurseId: string, startDate: string, endDate: string) => Promise<Availability[]>;
  addAvailability: (availabilityData: Omit<Availability, 'id' | 'created_at' | 'updated_at'>) => Promise<Availability>;
  updateAvailability: (id: string, availabilityData: Partial<Availability>) => Promise<void>;
  deleteAvailability: (id: string) => Promise<void>;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  selectedNurseId: string | null;
  setSelectedNurseId: (id: string | null) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppContextProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Load or seed data from local storage
  const [profiles, setProfiles] = useState<Profile[]>(() => {
    const saved = localStorage.getItem('localnurse_profiles');
    return saved ? JSON.parse(saved) : INITIAL_PROFILES;
  });

  const [nurses, setNurses] = useState<Nurse[]>(() => {
    const saved = localStorage.getItem('localnurse_nurses');
    return saved ? JSON.parse(saved) : INITIAL_NURSES;
  });

  const [bookings, setBookings] = useState<Booking[]>(() => {
    const saved = localStorage.getItem('localnurse_bookings');
    if (saved) return JSON.parse(saved);
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

  const [availability, setAvailability] = useState<Availability[]>([]);

  // Global settings/view state
  const [activeTab, setActiveTab] = useState<string>('home');
  const [selectedNurseId, setSelectedNurseId] = useState<string | null>(null);

  // Authenticated user state
  // We simulate a default logged-in family client
  // Or a nurse user (Elena Gómez) when switching roles
  const [currentUser, setCurrentUser] = useState<Profile | null>(() => {
    const saved = localStorage.getItem('localnurse_current_user');
    if (saved) return JSON.parse(saved);
    return {
      id: '00000000-0000-0000-0000-000000000001',
      email: 'familia.gomez.servicios@gmail.com',
      role: 'user',
      full_name: 'Familia Ramírez Gómez',
      avatar_url: 'https://images.unsplash.com/photo-1511285560929-80b456fea0bc?auto=format&fit=crop&q=80&w=200',
      phone: '+503 2222 9999',
      location_name: 'San Salvador',
      updated_at: new Date().toISOString()
    };
  });

  const [currentNurse, setCurrentNurse] = useState<Nurse | null>(null);

  // Synchronize dynamic nurse profile if active user role is 'nurse'
  useEffect(() => {
    if (currentUser && currentUser.role === 'nurse') {
      const foundNurse = nurses.find(n => n.user_id === currentUser.id);
      setCurrentNurse(foundNurse || null);
    } else {
      setCurrentNurse(null);
    }
  }, [currentUser, nurses]);

  // Save to Local Storage whenever states change
  useEffect(() => {
    localStorage.setItem('localnurse_profiles', JSON.stringify(profiles));
  }, [profiles]);

  useEffect(() => {
    localStorage.setItem('localnurse_nurses', JSON.stringify(nurses));
  }, [nurses]);

  useEffect(() => {
    localStorage.setItem('localnurse_bookings', JSON.stringify(bookings));
  }, [bookings]);

  useEffect(() => {
    if (currentUser) {
      localStorage.setItem('localnurse_current_user', JSON.stringify(currentUser));
    } else {
      localStorage.removeItem('localnurse_current_user');
    }
  }, [currentUser]);

  // Action: Update profiles
  const updateProfile = (profileData: Partial<Profile>) => {
    if (!currentUser) return;
    const updated = { ...currentUser, ...profileData, updated_at: new Date().toISOString() };
    setCurrentUser(updated);
    setProfiles(prev => prev.map(p => p.id === updated.id ? updated : p));
  };

  // Action: Update nurse rates, bios, specializations
  const updateNurseProfile = (nurseData: Partial<Nurse>) => {
    if (!currentNurse) return;
    const updated = { ...currentNurse, ...nurseData };
    setNurses(prev => prev.map(n => n.id === updated.id ? updated : n));
  };

  // Action: Create high fidelity booking
  const createBooking = async (bookingData: Omit<Booking, 'id' | 'user_id' | 'created_at' | 'status'>) => {
    if (!currentUser) throw new Error('Debes iniciar sesión para agendar.');
    
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

    const newBooking: Booking = {
      id: data.id,
      user_id: data.user_id,
      nurse_id: data.nurse_id,
      date: data.date,
      start_time: data.start_time,
      end_time: data.end_time,
      hours: Number(data.hours),
      status: data.status,
      total_price: Number(data.total_price),
      notes: data.notes,
      patient_name: data.patient_name,
      patient_condition: data.patient_condition,
      created_at: data.created_at
    };

    setBookings(prev => [newBooking, ...prev]);

    return newBooking;
  };

  // Action: Update state of booking (pending, confirmed, completed, cancelled)
  const updateBookingStatus = async (bookingId: string, status: BookingStatus) => {
    const { error } = await supabase
      .from('bookings')
      .update({ status })
      .eq('id', bookingId);

    if (error) throw error;
    setBookings(prev => prev.map(b => b.id === bookingId ? { ...b, status } : b));
  };

  // Availability functions
  const getAvailability = async (nurseId: string, startDate: string, endDate: string): Promise<Availability[]> => {
    const { data, error } = await supabase
      .from('availability')
      .select('*')
      .eq('nurse_id', nurseId)
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date', { ascending: true });

    if (error) throw error;
    return data || [];
  };

  const addAvailability = async (availabilityData: Omit<Availability, 'id' | 'created_at' | 'updated_at'>): Promise<Availability> => {
    const { data, error } = await supabase
      .from('availability')
      .insert(availabilityData)
      .select()
      .single();

    if (error) throw error;

    const newAvailability: Availability = {
      id: data.id,
      nurse_id: data.nurse_id,
      date: data.date,
      start_time: data.start_time,
      end_time: data.end_time,
      is_available: data.is_available,
      notes: data.notes,
      created_at: data.created_at,
      updated_at: data.updated_at
    };

    setAvailability(prev => [...prev, newAvailability]);
    return newAvailability;
  };

  const updateAvailability = async (id: string, availabilityData: Partial<Availability>): Promise<void> => {
    const { error } = await supabase
      .from('availability')
      .update(availabilityData)
      .eq('id', id);

    if (error) throw error;
    setAvailability(prev => prev.map(a => a.id === id ? { ...a, ...availabilityData } : a));
  };

  const deleteAvailability = async (id: string): Promise<void> => {
    const { error } = await supabase
      .from('availability')
      .delete()
      .eq('id', id);

    if (error) throw error;
    setAvailability(prev => prev.filter(a => a.id !== id));
  };

  return (
    <AppContext.Provider value={{
      profiles,
      nurses,
      bookings,
      availability,
      currentUser,
      currentNurse,
      updateProfile,
      updateNurseProfile,
      createBooking,
      updateBookingStatus,
      getAvailability,
      addAvailability,
      updateAvailability,
      deleteAvailability,
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
