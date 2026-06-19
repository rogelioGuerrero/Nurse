/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { createContext, useContext, useState, useEffect } from 'react';
import { Profile, Nurse, Booking, Message, ChatRoom, UserRole, BookingStatus, Availability } from '../types';
import { INITIAL_PROFILES, INITIAL_NURSES } from '../data/nurses';
import { supabase } from '../lib/supabase';

interface AppContextType {
  profiles: Profile[];
  nurses: Nurse[];
  bookings: Booking[];
  messages: Message[];
  chatRooms: ChatRoom[];
  availability: Availability[];
  currentUser: Profile | null;
  currentNurse: Nurse | null; // loaded if current user is a nurse
  switchUserRole: (role: UserRole) => void;
  updateProfile: (profileData: Partial<Profile>) => void;
  updateNurseProfile: (nurseData: Partial<Nurse>) => void;
  createBooking: (bookingData: Omit<Booking, 'id' | 'user_id' | 'created_at' | 'status'>) => Promise<Booking>;
  updateBookingStatus: (bookingId: string, status: BookingStatus) => Promise<void>;
  sendMessage: (chatRoomId: string, content: string) => Promise<void>;
  getOrCreateChatRoom: (userId: string, nurseId: string) => Promise<ChatRoom>;
  getAvailability: (nurseId: string, startDate: string, endDate: string) => Promise<Availability[]>;
  addAvailability: (availabilityData: Omit<Availability, 'id' | 'created_at' | 'updated_at'>) => Promise<Availability>;
  updateAvailability: (id: string, availabilityData: Partial<Availability>) => Promise<void>;
  deleteAvailability: (id: string) => Promise<void>;
  markMessagesAsRead: (chatRoomId: string, userId: string) => Promise<void>;
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
        total_price: 900,
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
        total_price: 1600,
        patient_name: 'Doña Teresa Ramos (Abuela)',
        patient_condition: 'Postoperatorio de fractura de cadera.',
        notes: 'Muy importante recordar la movilización cada 2 horas.',
        created_at: new Date(Date.now() - 86400000 * 5).toISOString()
      }
    ];
  });

  const [messages, setMessages] = useState<Message[]>(() => {
    const saved = localStorage.getItem('localnurse_messages');
    if (saved) return JSON.parse(saved);
    return [
      {
        id: 'm-demo-1',
        chat_room_id: 'crm-demo-1',
        sender_id: '00000000-0000-0000-0000-000000000002',
        content: 'Hola, un gusto saludarlos. Estoy disponible para el cuidado de Don Alberto este miércoles. ¿Tienen alguna indicación adicional para las medicinas?',
        created_at: new Date(Date.now() - 3600000 * 4).toISOString()
      },
      {
        id: 'm-demo-2',
        chat_room_id: 'crm-demo-1',
        sender_id: '00000000-0000-0000-0000-000000000001',
        content: 'Hola Lic. Elena, excelente. Sí, él toma su recordatorio de Aricept justo a las 10:00 AM después del desayuno. Le daremos más detalles el día de su visita.',
        created_at: new Date(Date.now() - 3600000 * 2).toISOString()
      }
    ];
  });

  const [chatRooms, setChatRooms] = useState<ChatRoom[]>(() => {
    const saved = localStorage.getItem('localnurse_chatrooms');
    if (saved) return JSON.parse(saved);
    return [
      {
        id: 'crm-demo-1',
        user_id: '00000000-0000-0000-0000-000000000001',
        nurse_id: '00000000-0000-0000-0000-000000000011',
        last_message_content: 'Hola Lic. Elena, excelente. Sí, él toma su recordatorio de Aricept...',
        last_message_time: new Date(Date.now() - 3600000 * 2).toISOString()
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
      phone: '+52 55 5555 4444',
      location_name: 'Polanco / Condesa, México DF',
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
    localStorage.setItem('localnurse_messages', JSON.stringify(messages));
  }, [messages]);

  useEffect(() => {
    localStorage.setItem('localnurse_chatrooms', JSON.stringify(chatRooms));
  }, [chatRooms]);

  useEffect(() => {
    if (currentUser) {
      localStorage.setItem('localnurse_current_user', JSON.stringify(currentUser));
    } else {
      localStorage.removeItem('localnurse_current_user');
    }
  }, [currentUser]);

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
      // Switch back to Family client
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

    // Automatically trigger an onboarding chat message when booking
    const nurse = nurses.find(n => n.id === bookingData.nurse_id);
    if (nurse) {
      const room = await getOrCreateChatRoom(currentUser.id, nurse.id);
      
      const welcomeMsg: Message = {
        id: 'm-auto-' + Math.random().toString(36).substr(2, 9),
        chat_room_id: room.id,
        sender_id: currentUser.id,
        content: `👋 He solicitado una reserva para el día **${bookingData.date}** de **${bookingData.start_time} a ${bookingData.end_time}** (${bookingData.hours} horas) para mi familiar **${bookingData.patient_name}**. Detalle del estado: ${bookingData.patient_condition}. ¿Podrías confirmar tu disponibilidad?`,
        created_at: new Date().toISOString()
      };

      setMessages(prev => [...prev, welcomeMsg]);
      updateChatRoomLastMessage(room.id, welcomeMsg.content);
    }

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
    
    // Add automated message notification on changes
    const booking = bookings.find(b => b.id === bookingId);
    if (booking) {
      const room = await getOrCreateChatRoom(booking.user_id, booking.nurse_id);
      let alertContent = '';
      if (status === 'confirmed') {
        alertContent = `⚡ Reserva Confirmada: El enfermero ha aceptado la reserva para el día **${booking.date}** de ${booking.start_time} a ${booking.end_time}.`;
      } else if (status === 'cancelled') {
        alertContent = `❌ Reserva Cancelada para el día **${booking.date}**.`;
      } else if (status === 'completed') {
        alertContent = `✅ Visita completada con éxito para el día **${booking.date}**. Te invitamos a dejar tu valoración en el perfil.`;
      }

      if (alertContent) {
        const alertMsg: Message = {
          id: 'm-alert-' + Math.random().toString(36).substr(2, 9),
          chat_room_id: room.id,
          sender_id: 'system',
          content: alertContent,
          created_at: new Date().toISOString()
        };
        setMessages(prev => [...prev, alertMsg]);
        updateChatRoomLastMessage(room.id, alertContent);
      }
    }
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
  const sendMessage = async (chatRoomId: string, content: string) => {
    if (!currentUser) return;
    
    const { data, error } = await supabase
      .from('messages')
      .insert({
        chat_room_id: chatRoomId,
        sender_id: currentUser.id,
        content
      })
      .select()
      .single();

    if (error) throw error;

    const newMsg: Message = {
      id: data.id,
      chat_room_id: data.chat_room_id,
      sender_id: data.sender_id,
      content: data.content,
      created_at: data.created_at,
      is_read: false
    };

    setMessages(prev => [...prev, newMsg]);
    updateChatRoomLastMessage(chatRoomId, content);

    // Dynamic mock response helper: Simulate the nurse or family replying back in 1.5s
    const room = chatRooms.find(r => r.id === chatRoomId);
    if (room) {
      const isSenderClient = currentUser.id === room.user_id;
      const responderId = isSenderClient ? room.nurse_id : room.user_id;
      
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
          sender_id: responderId,
          content: randomReply,
          created_at: new Date().toISOString()
        };

        setMessages(prev => [...prev, autoResponse]);
        setChatRooms(prevRooms => prevRooms.map(r => r.id === chatRoomId ? {
          ...r,
          last_message_content: randomReply,
          last_message_time: new Date().toISOString()
        } : r));
      }, 1500);
    }
  };

  // Finder or builder of Chat rooms
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

  const markMessagesAsRead = async (chatRoomId: string, userId: string): Promise<void> => {
    // Update local state first
    setMessages(prev => prev.map(msg => 
      msg.chat_room_id === chatRoomId && msg.sender_id !== userId
        ? { ...msg, is_read: true, read_at: new Date().toISOString() }
        : msg
    ));

    // Update in Supabase
    const { error } = await supabase
      .from('messages')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('chat_room_id', chatRoomId)
      .neq('sender_id', userId);

    if (error) console.error('Error marking messages as read:', error);
  };

  return (
    <AppContext.Provider value={{
      profiles,
      nurses,
      bookings,
      messages,
      chatRooms,
      availability,
      currentUser,
      currentNurse,
      switchUserRole,
      updateProfile,
      updateNurseProfile,
      createBooking,
      updateBookingStatus,
      sendMessage,
      getOrCreateChatRoom,
      getAvailability,
      addAvailability,
      updateAvailability,
      deleteAvailability,
      markMessagesAsRead,
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
