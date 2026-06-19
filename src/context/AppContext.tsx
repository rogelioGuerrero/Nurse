/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { createContext, useContext, useState, useEffect } from 'react';
import { Profile, Nurse, Booking, Message, ChatRoom, UserRole, BookingStatus } from '../types';
import { supabase } from '../lib/supabase';
import { INITIAL_PROFILES, INITIAL_NURSES } from '../data/nurses';

interface AppContextType {
  profiles: Profile[];
  nurses: Nurse[];
  bookings: Booking[];
  messages: Message[];
  chatRooms: ChatRoom[];
  currentUser: Profile | null;
  currentNurse: Nurse | null;
  switchUserRole: (role: UserRole) => void;
  updateProfile: (profileData: Partial<Profile>) => void;
  updateNurseProfile: (nurseData: Partial<Nurse>) => void;
  createBooking: (bookingData: Omit<Booking, 'id' | 'user_id' | 'created_at' | 'status'>) => Promise<Booking>;
  updateBookingStatus: (bookingId: string, status: BookingStatus) => Promise<void>;
  sendMessage: (chatRoomId: string, content: string) => Promise<void>;
  getOrCreateChatRoom: (userId: string, nurseId: string) => Promise<ChatRoom>;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  selectedNurseId: string | null;
  setSelectedNurseId: (id: string | null) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppContextProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Load data from Supabase or fallback to local mock data
  const [profiles, setProfiles] = useState<Profile[]>(INITIAL_PROFILES);
  const [nurses, setNurses] = useState<Nurse[]>(INITIAL_NURSES);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [chatRooms, setChatRooms] = useState<ChatRoom[]>([]);

  // Global settings/view state
  const [activeTab, setActiveTab] = useState<string>('home');
  const [selectedNurseId, setSelectedNurseId] = useState<string | null>(null);

  // Authenticated user state
  const [currentUser, setCurrentUser] = useState<Profile | null>(() => {
    const saved = localStorage.getItem('localnurse_current_user');
    if (saved) return JSON.parse(saved);
    return {
      id: '00000000-0000-0000-0000-000000000001',
      email: 'familia.gomez.servicios@gmail.com',
      role: 'user',
      full_name: 'Familia Ramírez Gómez',
      avatar_url: 'https://images.unsplash.com/photo-1511285560929-80b456fea0bc?auto=format&fit=crop&q=80&w=200',
      phone: '+52 55 5555 4444',
      location_name: 'Polanco / Condesa, México DF',
      updated_at: new Date().toISOString()
    };
  });

  const [currentNurse, setCurrentNurse] = useState<Nurse | null>(null);

  // Load data from Supabase on mount
  useEffect(() => {
    loadNurses();
    if (currentUser) {
      loadBookings(currentUser.id);
    }
  }, [currentUser]);

  const loadNurses = async () => {
    // Temporarily use mock data directly while Supabase setup is pending
    setNurses(INITIAL_NURSES);
    return;
    
    try {
      const { data, error } = await supabase
        .from('nurses')
        .select(`*, profiles(*)`);
      if (error) throw error;
      if (data) {
        // Transform Supabase data to match our types
        const transformedNurses = data.map((n: any) => ({
          id: n.id,
          user_id: n.user_id,
          specialization: n.specialization || [],
          hourly_rate: Number(n.hourly_rate),
          coverage_radius: n.coverage_radius,
          availability: n.availability,
          rating: Number(n.rating),
          review_count: n.review_count,
          lat: n.lat,
          lng: n.lng,
          bio: n.bio,
          experience_years: n.experience_years,
          certifications: n.certifications || []
        }));
        setNurses(transformedNurses);
      }
    } catch (err) {
      console.error('Error loading nurses:', err);
      // Fallback to mock data
      setNurses(INITIAL_NURSES);
    }
  };

  const loadBookings = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('bookings')
        .select('*')
        .or(`user_id.eq.${userId}`);
      if (error) throw error;
      if (data) {
        const transformedBookings = data.map((b: any) => ({
          id: b.id,
          user_id: b.user_id,
          nurse_id: b.nurse_id,
          date: b.date,
          start_time: b.start_time,
          end_time: b.end_time,
          hours: Number(b.hours),
          status: b.status,
          total_price: Number(b.total_price),
          notes: b.notes,
          patient_name: b.patient_name,
          patient_condition: b.patient_condition,
          created_at: b.created_at
        }));
        setBookings(transformedBookings);
      }
    } catch (err) {
      console.error('Error loading bookings:', err);
    }
  };

  // Synchronize dynamic nurse profile if active user role is 'nurse'
  useEffect(() => {
    if (currentUser && currentUser.role === 'nurse') {
      const foundNurse = nurses.find(n => n.user_id === currentUser.id);
      setCurrentNurse(foundNurse || null);
    } else {
      setCurrentNurse(null);
    }
  }, [currentUser, nurses]);

  // Save to Supabase instead of localStorage

  // Action: Switch mock user roles for playground testing
  const switchUserRole = (role: UserRole) => {
    if (role === 'nurse') {
      // Switch mock user to Elena Gómez (Nurse n-1, Profile p-1)
      const elenaProfile = profiles.find(p => p.id === '00000000-0000-0000-0000-000000000002');
      if (elenaProfile) {
        setCurrentUser({
          ...elenaProfile,
          role: 'nurse'
        });
      } else {
        const fallbackElena: Profile = {
          id: '00000000-0000-0000-0000-000000000002',
          email: 'elena.gomez@localnurse.com',
          role: 'nurse',
          full_name: 'Lic. Elena Gómez',
          avatar_url: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&q=80&w=200',
          phone: '+52 55 4321 8765',
          location_name: 'Polanco, CDMX',
          updated_at: new Date().toISOString()
        };
        setProfiles(prev => [...prev, fallbackElena]);
        setCurrentUser(fallbackElena);
      }
    } else {
      // Switch back to Family client 'family-1'
      const familyUser: Profile = {
        id: '00000000-0000-0000-0000-000000000001',
        email: 'familia.gomez.servicios@gmail.com',
        role: 'user',
        full_name: 'Familia Ramírez Gómez',
        avatar_url: 'https://images.unsplash.com/photo-1511285560929-80b456fea0bc?auto=format&fit=crop&q=80&w=200',
        phone: '+52 55 5555 4444',
        location_name: 'Polanco / Condesa, México DF',
        updated_at: new Date().toISOString()
      };
      setCurrentUser(familyUser);
    }
    // Deep navigation refresh
    setSelectedNurseId(null);
    setActiveTab('home');
  };

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

  // Action: Create booking with Supabase
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

  // Action: Update booking status with Supabase
  const updateBookingStatus = async (bookingId: string, status: BookingStatus) => {
    const { error } = await supabase
      .from('bookings')
      .update({ status })
      .eq('id', bookingId);

    if (error) throw error;
    setBookings(prev => prev.map(b => b.id === bookingId ? { ...b, status } : b));
  };

  // Helper inside messages
  const updateChatRoomLastMessage = (roomId: string, content: string) => {
    setChatRooms(prev => prev.map(room => {
      if (room.id === roomId) {
        return {
          ...room,
          last_message_content: content,
          last_message_time: new Date().toISOString()
        };
      }
      return room;
    }));
  };

  // Action: Send real time mock message
  const sendMessage = (chatRoomId: string, content: string) => {
    if (!currentUser) return;
    
    const newMsg: Message = {
      id: 'm-' + Math.random().toString(36).substr(2, 9),
      chat_room_id: chatRoomId,
      sender_id: currentUser.id,
      content,
      created_at: new Date().toISOString()
    };

    setMessages(prev => [...prev, newMsg]);
    updateChatRoomLastMessage(chatRoomId, content);

    // Dynamic mock response helper: Simulate the nurse or family replying back in 1.5s
    const room = chatRooms.find(r => r.id === chatRoomId);
    if (room) {
      const isSenderClient = currentUser.id === room.user_id;
      const responderId = isSenderClient ? room.nurse_id : room.user_id;
      
      // Find name profile
      let responderName = 'Enfermera';
      if (isSenderClient) {
        const foundN = nurses.find(n => n.id === room.nurse_id);
        const refP = foundN ? profiles.find(pr => pr.id === foundN.user_id) : null;
        if (refP) responderName = refP.full_name;
      } else {
        const refP = profiles.find(pr => pr.id === room.user_id);
        if (refP) responderName = refP.full_name;
      }

      setTimeout(() => {
        const replies = [
          `Entendido, estaré muy al pendiente de los requerimientos y el plan dietético.`,
          `¡Perfecto! Nos vemos puntualmente a la hora indicada. Si surge algún imprevisto, me comunicaré de inmediato.`,
          `Muchas gracias por la aclaración. ¿El paciente requiere apoyo asistido para levantarse o realizar ejercicios?`,
          `Perfecto, ya he registrado todos los niveles de glucosa que deben tomarse cada tarde.`,
          `Le agradezco mucho la confianza. Todo saldrá excelente con el cuidado especial.`
        ];
        const randomReply = replies[Math.floor(Math.random() * replies.length)];

        const autoResponse: Message = {
          id: 'm-reply-' + Math.random().toString(36).substr(2, 9),
          chat_room_id: chatRoomId,
          sender_id: responderId, // actual responder ID
          content: randomReply,
          created_at: new Date().toISOString()
        };

        setMessages(prev => [...prev, autoResponse]);
        // Update room
        setChatRooms(prevRooms => prevRooms.map(r => r.id === chatRoomId ? {
          ...r,
          last_message_content: randomReply,
          last_message_time: new Date().toISOString()
        } : r));
      }, 1500);
    }
  };

  // Finder or builder of Chat rooms with Supabase
  const getOrCreateChatRoom = async (userId: string, nurseId: string): Promise<ChatRoom> => {
    const existing = chatRooms.find(r => r.user_id === userId && r.nurse_id === nurseId);
    if (existing) return existing;

    const { data, error } = await supabase
      .from('chat_rooms')
      .insert({
        user_id: userId,
        nurse_id: nurseId
      })
      .select()
      .single();

    if (error) throw error;

    const newRoom: ChatRoom = {
      id: data.id,
      user_id: data.user_id,
      nurse_id: data.nurse_id,
      last_message_content: 'Conversación iniciada',
      last_message_time: data.created_at
    };

    setChatRooms(prev => [newRoom, ...prev]);
    return newRoom;
  };

  return (
    <AppContext.Provider value={{
      profiles,
      nurses,
      bookings,
      messages,
      chatRooms,
      currentUser,
      currentNurse,
      switchUserRole,
      updateProfile,
      updateNurseProfile,
      createBooking,
      updateBookingStatus,
      sendMessage,
      getOrCreateChatRoom,
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
