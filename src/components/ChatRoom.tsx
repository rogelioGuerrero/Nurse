/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { Message, ChatRoom as ChatRoomType } from '../types';
import { Send, User, Calendar, MessageCircle, AlertCircle, Sparkles, PhoneCall, Check, CheckCheck } from 'lucide-react';

export const ChatRoom: React.FC = () => {
  const { 
    chatRooms, 
    messages, 
    currentUser, 
    profiles, 
    nurses, 
    sendMessage,
    markMessagesAsRead
  } = useApp();

  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [typedText, setTypedText] = useState<string>('');
  const [showQuickReplies, setShowQuickReplies] = useState(false);
  const msgEndRef = useRef<HTMLDivElement>(null);

  const quickReplies = [
    'Confirmo la cita',
    'Necesito cambiar horario',
    'El paciente está bien',
    'Tengo una duda',
    '¿Necesito preparar algo?'
  ];

  // Set default active room if none is selected
  useEffect(() => {
    if (chatRooms.length > 0 && !activeRoomId) {
      setActiveRoomId(chatRooms[0].id);
    }
  }, [chatRooms, activeRoomId]);

  // Mark messages as read when room changes
  useEffect(() => {
    if (activeRoomId && currentUser) {
      markMessagesAsRead(activeRoomId, currentUser.id);
    }
  }, [activeRoomId, currentUser, markMessagesAsRead]);

  // Scroll to bottom when messages are appended
  useEffect(() => {
    msgEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, activeRoomId]);

  if (!currentUser) return null;

  const isNurseView = currentUser.role === 'nurse';

  const handleSendSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!typedText.trim() || !activeRoomId) return;

    await sendMessage(activeRoomId, typedText.trim());
    setTypedText('');
  };

  // Find info about the current active room
  const activeRoom = chatRooms.find(r => r.id === activeRoomId);

  let activeCounterPartyName = 'Conversación';
  let activeCounterPartyRole = 'Cuidador';
  let activeCounterPartyAvatar = '';
  let activeCounterPartyPhone = '';

  if (activeRoom) {
    if (isNurseView) {
      const clientP = profiles.find(p => p.id === activeRoom.user_id);
      activeCounterPartyName = clientP ? clientP.full_name : 'Familia Solicitante';
      activeCounterPartyRole = 'Familia de Adulto Mayor';
      activeCounterPartyAvatar = clientP ? clientP.avatar_url : 'https://images.unsplash.com/photo-1511285560929-80b456fea0bc?w=200';
      activeCounterPartyPhone = clientP?.phone || '+52 55 5555 4444';
    } else {
      const nurseR = nurses.find(n => n.id === activeRoom.nurse_id);
      const nurseP = nurseR ? profiles.find(p => p.id === nurseR.user_id) : null;
      activeCounterPartyName = nurseP ? nurseP.full_name : 'Caretaker Profesional';
      activeCounterPartyRole = 'Enfermero Registrado';
      activeCounterPartyAvatar = nurseP ? nurseP.avatar_url : 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=200';
      activeCounterPartyPhone = nurseP?.phone || '+52 55 4321 8765';
    }
  }

  // Filter messages in the selected active chatroom
  const currentRoomMessages = activeRoomId 
    ? messages.filter(m => m.chat_room_id === activeRoomId)
    : [];

  return (
    <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden h-[500px] md:h-[580px] grid grid-cols-1 md:grid-cols-3 shadow-md" id="chat-component-root">
      
      {/* Rooms Sidebar */}
      <div className="border-r border-slate-200 flex flex-col h-full bg-slate-50/50">
        <div className="p-4 border-b border-slate-200 bg-white">
          <h3 className="font-bold text-slate-800 text-sm flex items-center gap-1.5 uppercase tracking-wider text-[11px] text-slate-500">
            <MessageCircle className="h-4.5 w-4.5 text-indigo-500" />
            Bandeja de Mensajes ({chatRooms.length})
          </h3>
        </div>

        {chatRooms.length === 0 ? (
          <div className="flex-1 flex flex-col justify-center items-center p-6 text-center text-slate-400">
            <AlertCircle className="h-8 w-8 text-slate-300 mb-2" />
            <p className="text-xs font-semibold text-slate-600">No hay chats activos</p>
            <p className="text-[10px] text-slate-400 mt-1">Busca una enfermera en la lista y abre un chat para iniciar consultas.</p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto divide-y divide-slate-100 p-2 space-y-1">
            {chatRooms.map((room) => {
              // Find details of counterparty
              let rName = 'Conversación';
              let rAvatar = '';
              let rLastText = room.last_message_content || 'Inicio de chat';

              if (isNurseView) {
                const p = profiles.find(pr => pr.id === room.user_id);
                rName = p ? p.full_name : 'Familia Solicitante';
                rAvatar = p ? p.avatar_url : '';
              } else {
                const n = nurses.find(nr => nr.id === room.nurse_id);
                const p = n ? profiles.find(pr => pr.id === n.user_id) : null;
                rName = p ? p.full_name : 'Enfermero Asignado';
                rAvatar = p ? p.avatar_url : '';
              }

              const isActive = activeRoomId === room.id;

              return (
                <button
                  key={room.id}
                  onClick={() => setActiveRoomId(room.id)}
                  className={`w-full flex items-center gap-3 p-3 rounded-2xl transition text-left cursor-pointer ${
                    isActive 
                      ? 'bg-indigo-50/80 border border-indigo-100/90' 
                      : 'hover:bg-slate-50 border border-transparent'
                  }`}
                  id={`room-btn-${room.id}`}
                >
                  <img 
                    src={rAvatar} 
                    alt={rName} 
                    className="w-10 h-10 rounded-xl object-cover border border-slate-250 shrink-0"
                    referrerPolicy="no-referrer"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="font-bold text-slate-800 text-xs truncate max-w-[124px] sm:max-w-[140px]">
                        {rName}
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-500 truncate leading-snug">
                      {rLastText}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Main Active Conversation Frame */}
      <div className="md:col-span-2 flex flex-col h-full bg-slate-50">
        {activeRoom ? (
          <>
            {/* Header target banner */}
            <div className="bg-white border-b border-slate-200 p-4 flex justify-between items-center shrink-0">
              <div className="flex items-center gap-3">
                <img 
                  src={activeCounterPartyAvatar} 
                  alt={activeCounterPartyName} 
                  className="w-10 h-10 rounded-xl object-cover border border-slate-100 shadow-sm"
                  referrerPolicy="no-referrer"
                />
                <div>
                  <h4 className="font-extrabold text-slate-800 text-sm">{activeCounterPartyName}</h4>
                  <span className="text-[10px] text-indigo-600 font-bold tracking-wider">{activeCounterPartyRole}</span>
                </div>
              </div>

              {/* Call indicator shortcut */}
              <div className="flex gap-2.5">
                <a 
                  href={`tel:${activeCounterPartyPhone}`}
                  className="bg-slate-50 hover:bg-slate-100 text-slate-650 px-3 py-2 rounded-xl text-xs font-bold border border-slate-200/80 flex items-center gap-1.5 transition"
                >
                  <PhoneCall className="h-3.5 w-3.5 text-indigo-600 animate-pulse" />
                  <span className="hidden sm:inline">Llamar Ahora</span>
                </a>
              </div>
            </div>

            {/* Bubble logs lists */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3.5 min-h-[220px]">
              
              <div className="mx-auto text-center py-2">
                <span className="bg-slate-200/60 font-semibold text-slate-600 py-1.5 px-3 rounded-full text-[9px] uppercase tracking-wider">
                  Inicio de correspondencia cifrada
                </span>
              </div>

              {currentRoomMessages.map((m) => {
                const isMyMessage = m.sender_id === currentUser.id;
                const isSystem = m.sender_id === 'system';

                if (isSystem) {
                  return (
                    <div key={m.id} className="mx-auto text-center max-w-sm px-4 py-2.5 bg-indigo-50 text-indigo-800 border border-indigo-100 rounded-2xl text-[11px] leading-relaxed font-medium">
                      <Sparkles className="h-3.5 w-3.5 text-indigo-500 mx-auto mb-1 animate-spin-slow" />
                      <span>{m.content}</span>
                    </div>
                  );
                }

                return (
                  <div 
                    key={m.id}
                    className={`flex ${isMyMessage ? 'justify-end' : 'justify-start'}`}
                    id={`message-bubble-${m.id}`}
                  >
                    <div className={`max-w-[82%] sm:max-w-md rounded-2xl px-4 py-2.5 shadow-sm space-y-1 ${
                      isMyMessage 
                        ? 'bg-indigo-600 text-white rounded-br-none' 
                        : 'bg-white text-slate-800 border border-slate-200 rounded-bl-none'
                    }`}>
                      <p className="text-xs font-normal whitespace-pre-line leading-relaxed">
                        {m.content}
                      </p>
                      <div className="flex items-center justify-end gap-2">
                        <span className="text-[9px] font-medium opacity-70">
                          {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        {isMyMessage && (
                          <div className="flex items-center gap-0.5">
                            {m.is_read ? (
                              <CheckCheck className="h-3 w-3 text-indigo-200" />
                            ) : (
                              <Check className="h-3 w-3 text-indigo-200 opacity-50" />
                            )}
                          </div>
                        )}
                        {m.is_urgent && (
                          <AlertCircle className="h-3 w-3 text-red-300" />
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={msgEndRef} />
            </div>

            {/* Form Input submit panel */}
            <form onSubmit={handleSendSubmit} className="p-3 border-t border-slate-200 bg-white flex flex-col gap-2 shrink-0">
              {showQuickReplies && (
                <div className="flex flex-wrap gap-2">
                  {quickReplies.map((reply) => (
                    <button
                      key={reply}
                      type="button"
                      onClick={() => {
                        setTypedText(reply);
                        setShowQuickReplies(false);
                      }}
                      className="text-xs bg-indigo-50 text-indigo-700 px-3 py-1.5 rounded-full hover:bg-indigo-100 transition-colors"
                    >
                      {reply}
                    </button>
                  ))}
                </div>
              )}
              <div className="flex gap-2.5 items-center">
                <button
                  type="button"
                  onClick={() => setShowQuickReplies(!showQuickReplies)}
                  className="p-2 hover:bg-slate-100 rounded-lg transition-colors text-slate-500"
                  title="Respuestas rápidas"
                >
                  <Sparkles className="h-4 w-4" />
                </button>
                <input
                  type="text"
                  placeholder="Escribe un mensaje privado con el cuidador..."
                  value={typedText}
                  onChange={(e) => setTypedText(e.target.value)}
                  className="flex-1 bg-slate-50 border border-slate-200 hover:bg-slate-50/70 focus:bg-white text-xs px-4 py-3 rounded-xl focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition outline-none"
                  id="input-text-message"
                />
                <button
                  type="submit"
                  className="bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white p-3 rounded-xl transition cursor-pointer shrink-0"
                  id="btn-send-message"
                >
                  <Send className="h-4.5 w-4.5" />
                </button>
              </div>
            </form>
          </>
        ) : (
          <div className="flex-grow flex flex-col justify-center items-center py-20 px-8 text-center text-slate-500">
            <MessageCircle className="h-12 w-12 text-slate-300 animate-bounce" />
            <h4 className="font-bold text-slate-700 mt-2">Ninguna Conversación Abierta</h4>
            <p className="text-xs text-slate-400 mt-1 max-w-sm">
              Selecciona uno de tus contactos o solicita una cita para interactuar directamente con los miembros registrados en LocalNurse.
            </p>
          </div>
        )}
      </div>

    </div>
  );
};
