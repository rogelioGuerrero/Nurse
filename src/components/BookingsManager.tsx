/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { useApp } from '../context/AppContext';
import { Booking, BookingStatus } from '../types';
import { 
  Calendar, Clock, User, HeartPulse, ShieldAlert, CheckCircle, 
  XCircle, Filter, DollarSign, ArrowRight, UserCheck, CheckCircle2 
} from 'lucide-react';

export const BookingsManager: React.FC = () => {
  const { 
    bookings, 
    nurses, 
    profiles, 
    currentUser, 
    updateBookingStatus 
  } = useApp();

  if (!currentUser) return null;

  const isNurseView = currentUser.role === 'nurse';

  // Filter bookings according to active perspective
  const filteredBookings = bookings.filter(b => {
    if (isNurseView) {
      // Find current user's nurse record
      const myNurse = nurses.find(n => n.user_id === currentUser.id);
      return myNurse ? b.nurse_id === myNurse.id : false;
    } else {
      return b.user_id === currentUser.id;
    }
  });

  const getStatusBadge = (status: BookingStatus) => {
    switch (status) {
      case 'pending':
        return (
          <span className="bg-amber-50 text-amber-700 text-xs font-bold px-3 py-1 rounded-full border border-amber-200">
            Pendiente de Confirmación
          </span>
        );
      case 'confirmed':
        return (
          <span className="bg-indigo-50 text-indigo-700 text-xs font-bold px-3 py-1 rounded-full border border-indigo-200">
            Confirmado / Agendado
          </span>
        );
      case 'completed':
        return (
          <span className="bg-emerald-50 text-emerald-700 text-xs font-bold px-3 py-1 rounded-full border border-emerald-200 flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
            Completado con Éxito
          </span>
        );
      case 'cancelled':
        return (
          <span className="bg-rose-50 text-rose-700 text-xs font-bold px-3 py-1 rounded-full border border-rose-200">
            Cancelado
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6" id="bookings-manager-root">
      
      {/* Header section with toggle descriptions */}
      <div className="bg-gradient-to-r from-indigo-900 to-slate-900 rounded-3xl p-6 text-white shadow-md">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-extrabold tracking-tight">
              {isNurseView ? 'Panel de Gestión de Servicios (Enfermería)' : 'Tus Solicitudes de Asistencia Familiar'}
            </h2>
            <p className="text-xs text-indigo-200 font-normal mt-1 max-w-xl">
              {isNurseView 
                ? 'Monitorea las solicitudes entrantes de familias del sector y actualiza el estado de las visitas médicas.'
                : 'Paga y sigue el estatus de las visitas programadas para tus familiares adultos mayores.'}
            </p>
          </div>
          <div className="bg-indigo-950/60 border border-indigo-800 px-4 py-2.5 rounded-2xl text-center shrink-0">
            <span className="text-[10px] text-indigo-300 font-bold block uppercase tracking-wider">Total Registradas</span>
            <span className="text-xl font-black">{filteredBookings.length} visitas</span>
          </div>
        </div>
      </div>

      {filteredBookings.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center text-slate-500" id="bookings-empty">
          <Calendar className="h-10 w-10 text-slate-300 mx-auto mb-3" />
          <p className="font-semibold text-slate-700">No hay ninguna solicitud registrada actualmente.</p>
          <p className="text-xs text-slate-400 mt-1">Las reservas que solicites o recibas aparecerán en este panel de control.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredBookings.map((b) => {
            // Find opposite party profile
            let counterPartyName = '';
            let counterPartyAvatar = '';
            let counterPartySpecializations: string[] = [];

            if (isNurseView) {
              // Nurse sees client family
              const clientProfile = profiles.find(p => p.id === b.user_id);
              counterPartyName = clientProfile ? clientProfile.full_name : 'Familia Visitada';
              counterPartyAvatar = clientProfile ? clientProfile.avatar_url : 'https://images.unsplash.com/photo-1511285560929-80b456fea0bc?w=200';
            } else {
              // Client sees nurse details
              const nurseRec = nurses.find(n => n.id === b.nurse_id);
              const nurseProfile = nurseRec ? profiles.find(p => p.id === nurseRec.user_id) : null;
              counterPartyName = nurseProfile ? nurseProfile.full_name : 'Caretaker Profesional';
              counterPartyAvatar = nurseProfile ? nurseProfile.avatar_url : 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=200';
              counterPartySpecializations = nurseRec ? nurseRec.specialization : [];
            }

            return (
              <div 
                key={b.id} 
                className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4 hover:border-indigo-200 transition duration-150"
                id={`booking-card-${b.id}`}
              >
                {/* Header party / Badge row */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-50 pb-4">
                  <div className="flex items-center gap-3">
                    <img 
                      src={counterPartyAvatar} 
                      alt={counterPartyName} 
                      className="w-10 h-10 rounded-xl object-cover border border-slate-100"
                      referrerPolicy="no-referrer"
                    />
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                        {isNurseView ? 'Familia Solicitante' : 'Enfermero Asignado'}
                      </span>
                      <h4 className="font-bold text-slate-800 text-sm">{counterPartyName}</h4>
                      {counterPartySpecializations.length > 0 && (
                        <p className="text-[10px] text-indigo-500 font-semibold mt-0.5 max-w-[170px] sm:max-w-xs truncate">
                          {counterPartySpecializations.join(', ')}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    {getStatusBadge(b.status)}
                    <span className="text-sm font-extrabold text-indigo-600 bg-indigo-50 px-3 py-1 rounded-full">
                      ${b.total_price} MXN
                    </span>
                  </div>
                </div>

                {/* Patient / Schedule clinical information */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-slate-50/70 p-4 rounded-xl border border-slate-100 text-xs">
                  
                  {/* Schedule Column */}
                  <div className="space-y-2">
                    <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                      <Calendar className="h-3.5 w-3.5 text-indigo-500" />
                      Fecha y Horario
                    </div>
                    <div className="font-bold text-slate-700 text-xs space-y-1">
                      <p>Día: {b.date}</p>
                      <p className="text-slate-500">Horario: {b.start_time} - {b.end_time} ({b.hours} horas)</p>
                    </div>
                  </div>

                  {/* Patient Name */}
                  <div className="space-y-2">
                    <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                      <User className="h-3.5 w-3.5 text-indigo-500" />
                      Paciente Mayor
                    </div>
                    <div className="font-bold text-slate-700 text-xs">
                      <p className="text-slate-800 font-black">{b.patient_name}</p>
                      <p className="text-slate-500 overflow-hidden text-ellipsis line-clamp-1 mt-0.5">{b.patient_condition}</p>
                    </div>
                  </div>

                  {/* Diagnoses instruction details */}
                  <div className="space-y-2">
                    <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                      <HeartPulse className="h-3.5 w-3.5 text-indigo-500" />
                      Indicaciones Clínicas
                    </div>
                    <p className="text-slate-600 italic font-medium leading-relaxed">
                      {b.notes || 'Ninguna sugerencia o indicación especial descrita por el solicitante familiar.'}
                    </p>
                  </div>
                </div>

                {/* Actions Stepper */}
                <div className="flex items-center justify-end gap-3 pt-1 border-t border-slate-100/60">
                  {b.status === 'pending' && (
                    <>
                      {isNurseView ? (
                        <>
                          <button
                            onClick={() => updateBookingStatus(b.id, 'cancelled').catch(console.error)}
                            className="text-xs font-semibold text-rose-600 bg-rose-50 hover:bg-rose-100 px-4 py-2 rounded-xl transition cursor-pointer"
                            id={`btn-reject-booking-${b.id}`}
                          >
                            Rechazar Cita
                          </button>
                          <button
                            onClick={() => updateBookingStatus(b.id, 'confirmed').catch(console.error)}
                            className="text-xs font-black text-white bg-indigo-600 hover:bg-indigo-500 px-4 py-2 rounded-xl transition cursor-pointer shadow-sm shadow-indigo-200"
                            id={`btn-confirm-booking-${b.id}`}
                          >
                            Aceptar Reserva
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => updateBookingStatus(b.id, 'cancelled').catch(console.error)}
                          className="text-xs font-semibold text-rose-600 bg-rose-50 hover:bg-rose-100 px-4 py-2 rounded-xl transition cursor-pointer"
                          id={`btn-cancel-client-booking-${b.id}`}
                        >
                          Cancelar Solicitud
                        </button>
                      )}
                    </>
                  )}

                  {b.status === 'confirmed' && (
                    <>
                      {isNurseView ? (
                        <button
                          onClick={() => updateBookingStatus(b.id, 'completed').catch(console.error)}
                          className="text-xs font-black text-white bg-emerald-600 hover:bg-emerald-500 px-4 py-2.5 rounded-xl transition cursor-pointer shadow-sm shadow-emerald-200 flex items-center gap-1"
                          id={`btn-complete-booking-${b.id}`}
                        >
                          <CheckCircle2 className="h-4 w-4" />
                          <span>Marcar Visita Completada</span>
                        </button>
                      ) : (
                        <div className="flex gap-4 items-center">
                          <span className="text-[11px] text-indigo-600 font-semibold">El cuidador ya está confirmado para esta fecha.</span>
                          <button
                            onClick={() => updateBookingStatus(b.id, 'cancelled').catch(console.error)}
                            className="text-xs font-semibold text-slate-500 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-xl transition cursor-pointer"
                            id={`btn-cancel-confirmed-booking-${b.id}`}
                          >
                            Cancelar
                          </button>
                        </div>
                      )}
                    </>
                  )}

                  {b.status === 'completed' && (
                    <div className="w-full flex justify-between items-center text-xs text-slate-500">
                      <span className="flex items-center gap-1 text-emerald-700 font-medium">
                        <CheckCircle className="h-4.5 w-4.5 text-emerald-500 shrink-0" />
                        Atendida con alto estándar de calidad
                      </span>
                      {!isNurseView && (
                        <span className="text-indigo-600 font-bold hover:underline cursor-pointer">Dejar Reseña Adicional</span>
                      )}
                    </div>
                  )}

                  {b.status === 'cancelled' && (
                    <span className="text-xs text-slate-400 italic">Esta solicitud fue cancelada y no se generó ningún cargo.</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
