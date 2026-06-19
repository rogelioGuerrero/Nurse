/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { createContext, useContext, useState, useEffect } from 'react';
import { Profile, Nurse, Booking, Message, ChatRoom, UserRole, BookingStatus } from '../types';
import { INITIAL_PROFILES, INITIAL_NURSES } from '../data/nurses';

interface AppContextType {
  profiles: Profile[];
  nurses: Nurse[];
  bookings: Booking[];
  messages: Message[];
  chatRooms: ChatRoom[];
  currentUser: Profile | null;
  currentNurse: Nurse | null; // loaded if current user is a nurse
  switchUserRole: (role: UserRole) => void;
  updateProfile: (profileData: Partial<Profile>) => void;
  updateNurseProfile: (nurseData: Partial<Nurse>) => void;
  createBooking: (bookingData: Omit<Booking, 'id' | 'user_id' | 'created_at' | 'status'>) => Booking;
  updateBookingStatus: (bookingId: string, status: BookingStatus) => void;
  sendMessage: (chatRoomId: string, content: string) => void;
  getOrCreateChatRoom: (userId: string, nurseId: string) => ChatRoom;
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
        user_id: 'family-1',
        nurse_id: 'n-1',
        date: new Date(Date.now() + 86400000 * 2).toISOString().split('T')[0], // 2 days from now
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
        user_id: 'family-1',
        nurse_id: 'n-3',
        date: new Date(Date.now() - 86400000 * 3).toISOString().split('T')[0], // 3 days ago
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
        chat_room_id: 'crm-family-1-n-1',
        sender_id: 'p-1', // Nurse Elena
        content: 'Hola, un gusto saludarlos. Estoy disponible para el cuidado de Don Alberto este miércoles. ¿Tienen alguna indicación adicional para las medicinas?',
        created_at: new Date(Date.now() - 3600000 * 4).toISOString()
      },
      {
        id: 'm-demo-2',
        chat_room_id: 'crm-family-1-n-1',
        sender_id: 'family-1', // Client Family
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
        id: 'crm-family-1-n-1',
        user_id: 'family-1',
        nurse_id: 'n-1',
        last_message_content: 'Hola Lic. Elena, excelente. Sí, él toma su recordatorio de Aricept...',
        last_message_time: new Date(Date.now() - 3600000 * 2).toISOString()
      }
    ];
  });

  // Global settings/view state
  const [activeTab, setActiveTab] = useState<string>('home');
  const [selectedNurseId, setSelectedNurseId] = useState<string | null>(null);

  // Authenticated user state
  // We simulate a default logged-in family client 'family-1'
  // Or a nurse user 'p-1' (Elena Gómez) when switching roles
  const [currentUser, setCurrentUser] = useState<Profile | null>(() => {
    const saved = localStorage.getItem('localnurse_current_user');
    if (saved) return JSON.parse(saved);
    return {
      id: 'family-1',
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
      const elenaProfile = profiles.find(p => p.id === 'p-1');
      if (elenaProfile) {
        setCurrentUser({
          ...elenaProfile,
          role: 'nurse'
        });
      } else {
        const fallbackElena: Profile = {
          id: 'p-1',
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
        id: 'family-1',
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
  const createBooking = (bookingData: Omit<Booking, 'id' | 'user_id' | 'created_at' | 'status'>) => {
    if (!currentUser) throw new Error('Debes iniciar sesión para agendar.');
    
    const newBooking: Booking = {
      ...bookingData,
      id: 'b-' + Math.random().toString(36).substr(2, 9),
      user_id: currentUser.id,
      status: 'pending',
      created_at: new Date().toISOString()
    };

    setBookings(prev => [newBooking, ...prev]);

    // Automatically trigger an onboarding chat message when booking
    const nurse = nurses.find(n => n.id === bookingData.nurse_id);
    if (nurse) {
      const room = getOrCreateChatRoom(currentUser.id, nurse.id);
      
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
  const updateBookingStatus = (bookingId: string, status: BookingStatus) => {
    setBookings(prev => prev.map(b => b.id === bookingId ? { ...b, status } : b));
    
    // Add automated message notification on changes
    const booking = bookings.find(b => b.id === bookingId);
    if (booking) {
      const room = getOrCreateChatRoom(booking.user_id, booking.nurse_id);
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
          sender_id: 'system', // system text or nurse text
          content: alertContent,
          created_at: new Date().toISOString()
        };
        setMessages(prev => [...prev, alertMsg]);
        updateChatRoomLastMessage(room.id, alertMsg.content);
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

  // Finder or builder of Chat rooms
  const getOrCreateChatRoom = (userId: string, nurseId: string): ChatRoom => {
    const existing = chatRooms.find(r => r.user_id === userId && r.nurse_id === nurseId);
    if (existing) return existing;

    const newRoom: ChatRoom = {
      id: `crm-${userId}-${nurseId}`,
      user_id: userId,
      nurse_id: nurseId,
      last_message_content: 'Conversación iniciada',
      last_message_time: new Date().toISOString()
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
