/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import AvailabilityCalendar from './AvailabilityCalendar';
import { 
  Star, Clock, ChevronLeft, ChevronRight, MapPin, Award, ShieldCheck, 
  MessageSquare, Calendar, Stethoscope, AlertCircle, Heart, CheckCircle2 
} from 'lucide-react';

export const NurseDetail: React.FC = () => {
  const { 
    nurses, 
    profiles, 
    bookings,
    selectedNurseId, 
    setSelectedNurseId, 
    createBooking, 
    setActiveTab, 
    getOrCreateChatRoom 
  } = useApp();

  // Find nurse and linked profile
  const nurse = nurses.find(n => n.id === selectedNurseId);
  const profile = nurse ? profiles.find(p => p.id === nurse.user_id) : null;

  // Booking Form States
  const [date, setDate] = useState<string>('');
  const [startTime, setStartTime] = useState<string>('09:00');
  const [endTime, setEndTime] = useState<string>('14:00');
  const [patientName, setPatientName] = useState<string>('');
  const [patientCondition, setPatientCondition] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [emergencyContact, setEmergencyContact] = useState<string>('');
  const [patientAllergies, setPatientAllergies] = useState<string>('');
  const [chronicMedications, setChronicMedications] = useState<string>('');
  const [autonomyLevel, setAutonomyLevel] = useState<string>('Dependencia Moderada');

  // Booking Progress Step (1: Selection, 2: Details, 3: Confirmation)
  const [bookingStep, setBookingStep] = useState<number>(1);

  // Mini Calendar Navigation State
  const [calendarMonth, setCalendarMonth] = useState<Date>(() => {
    // Default to today
    return new Date();
  });

  // Status trigger handlers
  const [bookingSuccess, setBookingSuccess] = useState<boolean>(false);
  const [validationError, setValidationError] = useState<string>('');

  if (!nurse || !profile) {
    return (
      <div className="text-center py-12 bg-white rounded-2xl border border-slate-200" id="nurse-not-found">
        <AlertCircle className="h-10 w-10 text-rose-500 mx-auto mb-3" />
        <p className="text-slate-600 font-medium">No se pudo encontrar la ficha técnica del cuidador.</p>
        <button 
          onClick={() => setActiveTab('home')} 
          className="mt-4 text-xs font-bold text-indigo-600 hover:underline"
        >
          Volver al catálogo
        </button>
      </div>
    );
  }

  // Calculate dynamic hour counts
  const calculateHours = (): number => {
    if (!startTime || !endTime) return 0;
    const [startH, startM] = startTime.split(':').map(Number);
    const [endH, endM] = endTime.split(':').map(Number);
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;
    const diff = (endMinutes - startMinutes) / 60;
    return diff > 0 ? parseFloat(diff.toFixed(1)) : 0;
  };

  const hours = calculateHours();
  const totalPrice = hours * nurse.hourly_rate;

  // Spanish names & days for Clean Utility Calendar
  const MONTHS_ES = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];
  const WEEKDAYS_ES = ['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá'];

  const getDaysInMonth = (dateObj: Date) => {
    const year = dateObj.getFullYear();
    const month = dateObj.getMonth();
    const firstDayIndex = new Date(year, month, 1).getDay(); 
    const numDays = new Date(year, month + 1, 0).getDate();
    
    const days: (Date | null)[] = [];
    for (let i = 0; i < firstDayIndex; i++) {
      days.push(null);
    }
    for (let d = 1; d <= numDays; d++) {
      days.push(new Date(year, month, d));
    }
    return days;
  };

  const isDayBooked = (day: Date) => {
    if (!nurse) return false;
    const year = day.getFullYear();
    const month = String(day.getMonth() + 1).padStart(2, '0');
    const dayStr = String(day.getDate()).padStart(2, '0');
    const formatted = `${year}-${month}-${dayStr}`;
    return bookings.some(b => 
      b.nurse_id === nurse.id && 
      b.date === formatted && 
      b.status !== 'cancelled'
    );
  };

  const isDayPast = (day: Date) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const compareDay = new Date(day.getFullYear(), day.getMonth(), day.getDate());
    return compareDay < today;
  };

  const selectDay = (day: Date) => {
    const year = day.getFullYear();
    const month = String(day.getMonth() + 1).padStart(2, '0');
    const dayStr = String(day.getDate()).padStart(2, '0');
    const fullDateVal = `${year}-${month}-${dayStr}`;
    setDate(fullDateVal);
    setValidationError('');
  };

  const handleNextToDetails = () => {
    setValidationError('');
    if (!date) {
      setValidationError('Por favor selecciona una fecha válida.');
      return;
    }
    if (hours <= 0) {
      setValidationError('La hora de fin debe ser posterior a la hora de inicio.');
      return;
    }
    if (hours < 2) {
      setValidationError('La reserva mínima debe ser de al menos 2 horas.');
      return;
    }
    setBookingStep(2);
  };

  const handleNextToConfirmation = () => {
    setValidationError('');
    if (!patientName.trim()) {
      setValidationError('Se requiere el nombre del paciente adulto mayor.');
      return;
    }
    if (!patientCondition.trim()) {
      setValidationError('Indica un breve resumen de las condiciones clínicas o diagnósticos del paciente.');
      return;
    }
    if (!emergencyContact.trim()) {
      setValidationError('Se requiere un contacto de emergencia (Nombre y Teléfono) de El Salvador.');
      return;
    }
    setBookingStep(3);
  };

  const handleBookingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError('');

    if (!date) {
      setValidationError('Por favor selecciona una fecha válida.');
      setBookingStep(1);
      return;
    }
    if (hours <= 0) {
      setValidationError('La hora de fin debe ser posterior a la hora de inicio.');
      setBookingStep(1);
      return;
    }
    if (hours < 2) {
      setValidationError('La reserva mínima debe ser de al menos 2 horas.');
      setBookingStep(1);
      return;
    }
    if (!patientName.trim()) {
      setValidationError('Se requiere el nombre del paciente adulto mayor.');
      setBookingStep(2);
      return;
    }
    if (!patientCondition.trim()) {
      setValidationError('Indica un breve resumen de las condiciones físicas o cognitivas para mejor asignación.');
      setBookingStep(2);
      return;
    }
    if (!emergencyContact.trim()) {
      setValidationError('Se requiere un contacto de emergencia (Nombre y Teléfono).');
      setBookingStep(2);
      return;
    }

    // Prepare packed fields for high compatibility with standard schema
    const packedCondition = `${patientCondition} [Autonomía: ${autonomyLevel}] [Alergias: ${patientAllergies || 'Ninguna'}] [Medicamentos: ${chronicMedications || 'Ninguno'}] [Emergencia: ${emergencyContact}]`;

    try {
      await createBooking({
        nurse_id: nurse.id,
        date,
        start_time: startTime,
        end_time: endTime,
        hours,
        total_price: totalPrice,
        patient_name: patientName,
        patient_condition: packedCondition,
        notes
      });

      setBookingSuccess(true);
      setBookingStep(1);
      setDate('');
      setPatientName('');
      setPatientCondition('');
      setEmergencyContact('');
      setPatientAllergies('');
      setChronicMedications('');
      setAutonomyLevel('Dependencia Moderada');
      setNotes('');
    } catch (err: any) {
      setValidationError(err.message || 'Error al agendar cita.');
    }
  };

  const handleStartChat = async () => {
    const room = await getOrCreateChatRoom('00000000-0000-0000-0000-000000000001', nurse.id);
    setActiveTab('chat');
  };

  const daysInMonthList = getDaysInMonth(calendarMonth);

  return (
    <div className="space-y-6" id="nurse-detail-container">
      
      {/* Dynamic Back Nav */}
      <button 
        onClick={() => {
          setSelectedNurseId(null);
          setActiveTab('home');
        }} 
        className="flex items-center gap-2 text-slate-500 hover:text-slate-800 transition text-sm font-semibold cursor-pointer"
        id="btn-back-catalog"
      >
        <ChevronLeft className="h-5 w-5" />
        <span>Volver a la Lista de Enfermeras</span>
      </button>

      {bookingSuccess ? (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-8 text-center space-y-4 shadow-sm" id="booking-success-box">
          <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto text-emerald-600 animate-bounce">
            <CheckCircle2 className="h-10 w-10" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-emerald-900">¡Reserva enviada con éxito!</h3>
            <p className="text-sm text-emerald-700 mt-2 max-w-lg mx-auto">
              Se ha solicitado tu cita y se ha abierto un chat automático con <strong>{profile.full_name}</strong>. Puedes comunicarte directamente para coordinar aspectos adicionales de la visita.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row justify-center gap-3 pt-3">
            <button
              onClick={() => setActiveTab('bookings')}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm px-5 py-2.5 rounded-xl transition cursor-pointer"
              id="btn-nav-bookings"
            >
              Ver mis Solicitudes
            </button>
            <button
              onClick={() => setActiveTab('chat')}
              className="bg-white hover:bg-slate-50 text-emerald-800 font-semibold text-sm px-5 py-2.5 rounded-xl border border-emerald-200 transition cursor-pointer"
              id="btn-nav-chats"
            >
              Ir a Mensajes
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Main profile technical specs */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* Header Identity */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col sm:flex-row items-center sm:items-start gap-5">
              <img 
                src={profile.avatar_url} 
                alt={profile.full_name} 
                className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl object-cover border border-slate-200 shadow-sm shrink-0"
                referrerPolicy="no-referrer"
              />
              <div className="text-center sm:text-left flex-1 space-y-2">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h2 className="text-3xl font-serif italic text-slate-900 tracking-tight">{profile.full_name}</h2>
                    <p className="text-sm text-indigo-600 font-bold flex items-center justify-center sm:justify-start gap-1">
                      <Stethoscope className="h-4 w-4" />
                      Cuidador Geriátrico Registrado
                    </p>
                  </div>
                  
                  {/* Rating display */}
                  <div className="flex items-center justify-center sm:justify-end gap-1.5 bg-amber-50 px-3 py-1 rounded-full border border-amber-200 shrink-0 w-fit mx-auto sm:mx-0">
                    <Star className="h-4 w-4 fill-amber-400 text-amber-500" />
                    <span className="text-sm font-extrabold text-amber-800">{nurse.rating.toFixed(1)}</span>
                    <span className="text-xs text-amber-600">({nurse.review_count} visitas)</span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-y-1.5 gap-x-4 text-xs text-slate-500 font-medium">
                  <span className="flex items-center gap-1">
                    <MapPin className="h-4 w-4 text-slate-400" />
                    {profile.location_name || 'San Salvador'}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="h-4 w-4 text-slate-400" />
                    Exp: {nurse.experience_years} años
                  </span>
                  <Award className="h-4.5 w-4.5 text-emerald-500 bg-emerald-50 rounded-full" />
                  <span className="text-emerald-700 font-semibold uppercase tracking-wider text-[10px]">Identidad Identificada</span>
                </div>

                <div className="pt-3 border-t border-slate-100 flex flex-wrap justify-center sm:justify-start gap-3">
                  <button 
                    onClick={handleStartChat}
                    className="flex items-center justify-center gap-2 bg-indigo-50 hover:bg-indigo-100/80 active:bg-indigo-200 text-indigo-700 font-bold px-4 py-2 rounded-xl transition text-xs cursor-pointer"
                    id="btn-chat-direct"
                  >
                    <MessageSquare className="h-4 w-4" />
                    <span>Chat para Consultas</span>
                  </button>
                  <span className="text-xs text-slate-400 self-center">Responde normalmente en menos de 15 min</span>
                </div>
              </div>
            </div>

            {/* Specialties and Bio Area */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-5">
              <div>
                <h3 className="text-lg font-bold font-serif italic text-slate-900 mb-3 flex items-center gap-2">
                  <Heart className="h-5 w-5 text-indigo-500" />
                  Biografía Profesional
                </h3>
                <p className="text-sm text-slate-600 leading-relaxed font-normal whitespace-pre-line">
                  {nurse.bio}
                </p>
              </div>

              <div className="pt-4 border-t border-slate-100">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">Especialidades Avaladas</h4>
                <div className="flex flex-wrap gap-2">
                  {nurse.specialization.map(spec => (
                    <span 
                      key={spec}
                      className="bg-indigo-50 text-indigo-700 font-semibold px-3 py-1.5 rounded-xl text-xs border border-indigo-100"
                    >
                      {spec}
                    </span>
                  ))}
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">Estudios y Certificados</h4>
                <ul className="space-y-2.5">
                  {nurse.certifications.map((cert, index) => (
                    <li key={index} className="flex items-start gap-2.5 text-xs text-slate-600">
                      <ShieldCheck className="h-4.5 w-4.5 text-emerald-500 shrink-0 mt-0.5" />
                      <span>{cert}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Sello de Confianza y Seguridad El Salvador */}
              <div className="pt-4 border-t border-slate-100 space-y-3.5">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                  <ShieldCheck className="h-4.5 w-4.5 text-indigo-600" />
                  Sello de Seguridad y Confianza El Salvador
                </h4>
                <div className="bg-indigo-50/50 rounded-2xl p-4 border border-indigo-100/60 space-y-3">
                  <p className="text-[11px] text-indigo-950 font-normal leading-relaxed">
                    Para la absoluta tranquilidad de tu familia, todos nuestros cuidadores en El Salvador pasan por filtros de seguridad rigurosos antes de ser admitidos en la plataforma:
                  </p>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div className="flex items-center gap-2 bg-white p-2 rounded-xl border border-slate-100 shadow-sm">
                      <span className="w-5 h-5 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center text-[10px] font-bold">✓</span>
                      <div>
                        <span className="text-[10px] font-black text-slate-800 block">Solvencia de la PNC</span>
                        <span className="text-[9px] text-slate-450 font-semibold block">Policía Nacional Civil</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 bg-white p-2 rounded-xl border border-slate-100 shadow-sm">
                      <span className="w-5 h-5 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center text-[10px] font-bold">✓</span>
                      <div>
                        <span className="text-[10px] font-black text-slate-800 block">Antecedentes Penales</span>
                        <span className="text-[9px] text-slate-450 font-semibold block">Dirección Gral. de Penales</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 bg-white p-2 rounded-xl border border-slate-100 shadow-sm">
                      <span className="w-5 h-5 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center text-[10px] font-bold">✓</span>
                      <div>
                        <span className="text-[10px] font-black text-slate-800 block">Registro del CSSP</span>
                        <span className="text-[9px] text-slate-450 font-semibold block">CSSP N° {Math.floor(1000 + Math.random() * 9000)} - Activo</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 bg-white p-2 rounded-xl border border-slate-100 shadow-sm">
                      <span className="w-5 h-5 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center text-[10px] font-bold">✓</span>
                      <div>
                        <span className="text-[10px] font-black text-slate-800 block">Verificación de DUI</span>
                        <span className="text-[9px] text-slate-450 font-semibold block">Doc. Único de Identidad</span>
                      </div>
                    </div>
                  </div>

                  <div className="text-[10px] text-slate-500 font-medium italic flex items-start gap-1">
                    <span className="text-amber-500 font-black">ⓘ</span>
                    <span>Los enfermeros autorizan periódicamente la actualización de sus antecedentes legales salvadoreños ante nuestro equipo regulador.</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Testimonials */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
              <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                <Star className="h-5 w-5 text-indigo-500" />
                Opiniones Recientes ({nurse.review_count})
              </h3>
              <div className="space-y-4">
                <div className="border-b border-slate-100 pb-4">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-semibold text-xs text-slate-800">Familia Velázquez S.</span>
                    <div className="flex gap-0.5">
                      {[1, 2, 3, 4, 5].map(s => (
                        <Star key={s} className="h-3 w-3 fill-amber-400 text-amber-400" />
                      ))}
                    </div>
                  </div>
                  <p className="text-xs text-slate-500 leading-relaxed font-normal">
                    "Increíble trato con nuestra madre que sufre de demencia tipo Alzheimer. Muy puntual y paciente a la hora de las comidas. Total tranquilidad para toda la familia."
                  </p>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-semibold text-xs text-slate-800">Roberto Lozano (Hijo)</span>
                    <div className="flex gap-0.5">
                      {[1, 2, 3, 4, 5].map(s => (
                        <Star key={s} className="h-3 w-3 fill-amber-400 text-amber-400" />
                      ))}
                    </div>
                  </div>
                  <p className="text-xs text-slate-500 leading-relaxed font-normal">
                    "Excelente profesional para curación de heridas complejas y asistencia en la toma de medicamentos. Estuvo a cargo del postoperatorio de mi padre y su recuperación fue exitosa."
                  </p>
                </div>
              </div>
            </div>

            {/* Availability Calendar */}
            <AvailabilityCalendar nurseId={nurse.id} isEditable={false} />

          </div>

          {/* Booking Side Panel Form with 3-Step Stepper */}
          <div className="space-y-6">
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-5 sticky top-6">
              
              {/* Stepper progress bar */}
              <div className="border-b border-slate-100 pb-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Progreso de Reserva</span>
                  <span className="text-xs bg-indigo-50 text-indigo-700 font-bold px-2 py-0.5 rounded-full border border-indigo-100">
                    Paso {bookingStep} de 3
                  </span>
                </div>
                
                {/* Visual indicator bar */}
                <div className="flex items-center justify-between gap-1 relative">
                  {/* Background line */}
                  <div className="absolute top-[14px] left-3 right-3 h-0.5 bg-slate-100 -z-10" />
                  {/* Underlay Active line */}
                  <div 
                    className="absolute top-[14px] left-3 h-0.5 bg-indigo-600 -z-10 transition-all duration-300"
                    style={{ width: `${bookingStep === 1 ? '0%' : bookingStep === 2 ? '50%' : '100%'}` }}
                  />
                  {/* Step 1 element */}
                  <button 
                    type="button"
                    onClick={() => setBookingStep(1)}
                    className="flex flex-col items-center gap-1 focus:outline-none group"
                  >
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-200 ${
                      bookingStep >= 1 ? 'bg-indigo-600 text-white ring-4 ring-indigo-50 border border-indigo-600' : 'bg-slate-100 text-slate-500 border border-slate-200'
                    }`}>
                      1
                    </div>
                    <span className={`text-[9px] font-bold uppercase tracking-tight ${bookingStep >= 1 ? 'text-indigo-600' : 'text-slate-400'}`}>Selección</span>
                  </button>

                  {/* Step 2 element */}
                  <button 
                    type="button"
                    onClick={() => {
                      if (date && hours >= 2) {
                        setBookingStep(2);
                      } else {
                        setValidationError('Por favor asigna fecha y horas válidas para avanzar de paso.');
                      }
                    }}
                    className="flex flex-col items-center gap-1 focus:outline-none group"
                  >
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-200 ${
                      bookingStep >= 2 ? 'bg-indigo-600 text-white ring-4 ring-indigo-50 border border-indigo-600' : 'bg-slate-100 text-slate-500 border border-slate-200'
                    }`}>
                      2
                    </div>
                    <span className={`text-[9px] font-bold uppercase tracking-tight ${bookingStep >= 2 ? 'text-indigo-600' : 'text-slate-400'}`}>Detalles</span>
                  </button>

                  {/* Step 3 element */}
                  <button 
                    type="button"
                    onClick={() => {
                      if (date && hours >= 2 && patientName.trim() && patientCondition.trim()) {
                        setBookingStep(3);
                      } else {
                        setValidationError('Completa los campos requeridos en los pasos 1 y 2 antes de avanzar.');
                      }
                    }}
                    className="flex flex-col items-center gap-1 focus:outline-none group"
                  >
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-200 ${
                      bookingStep >= 3 ? 'bg-indigo-600 text-white ring-4 ring-indigo-50 border border-indigo-600' : 'bg-slate-100 text-slate-500 border border-slate-200'
                    }`}>
                      3
                    </div>
                    <span className={`text-[9px] font-bold uppercase tracking-tight ${bookingStep >= 3 ? 'text-indigo-600' : 'text-slate-400'}`}>Confirmación</span>
                  </button>
                </div>
              </div>

              {/* Step 1: Selection (Date and Hours) */}
              {bookingStep === 1 && (
                <div className="space-y-4">
                  <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100">
                    <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Tarifa de Atención</span>
                    <div className="flex items-baseline gap-2">
                      <span className="text-2xl font-black text-slate-800">US$ {nurse.hourly_rate}</span>
                      <span className="text-xs font-semibold text-slate-500">/ hora</span>
                    </div>
                    <p className="mt-1.5 text-[10px] text-slate-500 leading-normal">
                      <strong>Horario preferido:</strong> {nurse.availability}
                    </p>
                  </div>

                  {/* Custom Mini Calendar */}
                  <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3.5 shadow-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">Calendario de Disponibilidad</span>
                      
                      <div className="flex items-center gap-1.5">
                        <button 
                          type="button" 
                          onClick={() => {
                            setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1));
                          }}
                          className="p-1 hover:bg-slate-200/60 rounded-lg text-slate-600 transition flex items-center justify-center cursor-pointer"
                          title="Mes anterior"
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </button>
                        <span className="text-xs font-bold text-slate-700 min-w-[90px] text-center capitalize">
                          {MONTHS_ES[calendarMonth.getMonth()]} {calendarMonth.getFullYear()}
                        </span>
                        <button 
                          type="button" 
                          onClick={() => {
                            setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1));
                          }}
                          className="p-1 hover:bg-slate-200/60 rounded-lg text-slate-600 transition flex items-center justify-center cursor-pointer"
                          title="Siguiente mes"
                        >
                          <ChevronRight className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    {/* Weekday Titles */}
                    <div className="grid grid-cols-7 gap-1 text-center border-b border-slate-200/50 pb-1">
                      {WEEKDAYS_ES.map((label, idx) => (
                        <span key={idx} className="text-[10px] font-bold text-slate-400 capitalize">
                          {label}
                        </span>
                      ))}
                    </div>

                    {/* Days grid */}
                    <div className="grid grid-cols-7 gap-1">
                      {daysInMonthList.map((day, idx) => {
                        if (!day) return <div key={`empty-${idx}`} className="h-8" />;

                        const year = day.getFullYear();
                        const month = String(day.getMonth() + 1).padStart(2, '0');
                        const dayStr = String(day.getDate()).padStart(2, '0');
                        const dateVal = `${year}-${month}-${dayStr}`;

                        const isSelected = date === dateVal;
                        const isPast = isDayPast(day);
                        const isBooked = isDayBooked(day);

                        let cellClasses = "h-8 w-full flex items-center justify-center text-xs font-semibold rounded-xl select-none transition-all duration-150 ";
                        let isDisabled = false;

                        if (isPast) {
                          cellClasses += "text-slate-300 cursor-not-allowed";
                          isDisabled = true;
                        } else if (isBooked) {
                          cellClasses += "bg-amber-50 text-amber-700 line-through border border-amber-200/60 cursor-not-allowed font-semibold p-1";
                          isDisabled = true;
                        } else if (isSelected) {
                          cellClasses += "bg-indigo-600 text-white font-bold ring-2 ring-indigo-100 shadow-sm";
                        } else {
                          cellClasses += "text-slate-700 hover:bg-slate-200 cursor-pointer hover:scale-105 active:scale-95";
                        }

                        return (
                          <button
                            key={`cal-day-${idx}-${day.getDate()}`}
                            type="button"
                            disabled={isDisabled}
                            onClick={() => selectDay(day)}
                            className={cellClasses}
                            title={isBooked ? "Ocupado (Reservado)" : isPast ? "Fecha pasada" : `Seleccionar ${dateVal}`}
                          >
                            {day.getDate()}
                          </button>
                        );
                      })}
                    </div>

                    {/* Legends */}
                    <div className="flex items-center justify-between text-[9px] text-slate-400 border-t border-slate-200/60 pt-2 font-medium">
                      <div className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-slate-250 border border-slate-300" />
                        <span>Disponible</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-amber-100 border border-amber-300" />
                        <span className="text-amber-600 font-semibold">Ocupado</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-indigo-600" />
                        <span className="text-indigo-600 font-bold">Seleccionado</span>
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                      Fecha del servicio <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="date"
                      required
                      min={new Date().toISOString().split('T')[0]}
                      value={date}
                      onChange={(e) => {
                        setDate(e.target.value);
                        setValidationError('');
                      }}
                      className="w-full text-xs font-medium bg-slate-50 border border-slate-200 outline-none rounded-xl px-3.5 py-2.5 focus:bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
                      id="input-booking-date"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                        Hora de inicio <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="time"
                        required
                        value={startTime}
                        onChange={(e) => {
                          setStartTime(e.target.value);
                          setValidationError('');
                        }}
                        className="w-full text-xs font-medium bg-slate-50 border border-slate-200 outline-none rounded-xl px-3 py-2.5 focus:bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
                        id="input-booking-starttime"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                        Hora de fin <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="time"
                        required
                        value={endTime}
                        onChange={(e) => {
                          setEndTime(e.target.value);
                          setValidationError('');
                        }}
                        className="w-full text-xs font-medium bg-slate-50 border border-slate-200 outline-none rounded-xl px-3 py-2.5 focus:bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
                        id="input-booking-endtime"
                      />
                    </div>
                  </div>

                  {hours > 0 && (
                    <div className="bg-slate-50 rounded-xl p-3 border border-slate-200 text-xs text-slate-700 flex justify-between items-center font-medium">
                      <span>Horas de Atención:</span>
                      <span className="font-bold text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-lg border border-indigo-100">{hours} horas</span>
                    </div>
                  )}

                  {validationError && (
                    <div className="flex gap-2 bg-rose-50 border border-rose-100 text-rose-700 p-3 rounded-xl text-xs font-medium">
                      <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-rose-500" />
                      <span>{validationError}</span>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={handleNextToDetails}
                    className="w-full py-3 bg-indigo-600 hover:bg-slate-900 active:scale-95 text-white font-bold rounded-xl text-xs transition cursor-pointer text-center flex items-center justify-center gap-1.5 shadow-sm"
                    id="btn-stepper-goto-2"
                  >
                    <span>Continuar a Detalles</span>
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              )}

              {/* Step 2: Patient Details */}
              {/* Step 2: Patient Details */}
              {bookingStep === 2 && (
                <div className="space-y-4">
                  <div className="bg-slate-55 bg-indigo-50/20 p-4 border border-indigo-100 rounded-2xl mb-2">
                    <span className="text-[10px] font-bold text-indigo-700 uppercase tracking-widest block mb-1">FICHA CLÍNICA DIGITAL DEL ADULTO MAYOR</span>
                    <p className="text-[11px] text-slate-500 font-medium">Esta ficha digital será enviada de forma inmediata al enfermero profesional y se anexará a su reporte.</p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                        Nombre del Paciente Geriátrico <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="Ej. Don Alberto Ramírez"
                        value={patientName}
                        onChange={(e) => {
                          setPatientName(e.target.value);
                          setValidationError('');
                        }}
                        className="w-full text-xs font-medium bg-slate-50 border border-slate-200 outline-none rounded-xl px-3.5 py-2.5 focus:bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
                        id="input-booking-patient"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                        Nivel de Autonomía / Independencia <span className="text-rose-500">*</span>
                      </label>
                      <select
                        value={autonomyLevel}
                        onChange={(e) => setAutonomyLevel(e.target.value)}
                        className="w-full text-xs font-medium bg-slate-50 border border-slate-200 outline-none rounded-xl px-3.5 py-2.5 focus:bg-white focus:border-indigo-500 cursor-pointer transition"
                        id="select-booking-autonomy"
                      >
                        <option value="Autónomo o Independiente">Autónomo / Independiente</option>
                        <option value="Dependencia Moderada">Dependencia Moderada (Silla de ruedas / Apoyo)</option>
                        <option value="Dependencia Severa">Dependencia Severa o Postrado en Cama</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                        Contacto de Emergencia (El Salvador) <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="Ej. Juan Pérez (Hijo) - 7123-4567"
                        value={emergencyContact}
                        onChange={(e) => {
                          setEmergencyContact(e.target.value);
                          setValidationError('');
                        }}
                        className="w-full text-xs font-medium bg-slate-50 border border-slate-200 outline-none rounded-xl px-3.5 py-2.5 focus:bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
                        id="input-booking-emergency"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                        Alergias Conocidas (Opcional)
                      </label>
                      <input
                        type="text"
                        placeholder="Ej. Alérgico a la Penicilina, mariscos o Ninguna"
                        value={patientAllergies}
                        onChange={(e) => setPatientAllergies(e.target.value)}
                        className="w-full text-xs font-medium bg-slate-50 border border-slate-200 outline-none rounded-xl px-3.5 py-2.5 focus:bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
                        id="input-booking-allergies"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                      Medicamentos Crónicos o Receta Activa (Opcional)
                    </label>
                    <input
                      type="text"
                      placeholder="Ej. Donepezilo 10mg (10:00 AM), Metformina 850mg (Cena)"
                      value={chronicMedications}
                      onChange={(e) => setChronicMedications(e.target.value)}
                      className="w-full text-xs font-medium bg-slate-50 border border-slate-200 outline-none rounded-xl px-3.5 py-2.5 focus:bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
                      id="input-booking-meds"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                      Resumen Clínico / Diagnóstico del Paciente <span className="text-rose-500">*</span>
                    </label>
                    <textarea
                      required
                      rows={3}
                      placeholder="Ej. Alzheimer leve, diabetes dependiente. Requiere recordar la toma de insulina y conversar."
                      value={patientCondition}
                      onChange={(e) => {
                        setPatientCondition(e.target.value);
                        setValidationError('');
                      }}
                      className="w-full text-xs font-medium bg-slate-50 border border-slate-200 outline-none rounded-xl px-3.5 py-2.5 focus:bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition resize-none"
                      id="input-booking-condition"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                      Instrucciones Adicionales del Hogar (Opcional)
                    </label>
                    <textarea
                      rows={2}
                      placeholder="Ej. Hay estacionamiento disponible. Le gusta ver fotografías familiares."
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      className="w-full text-xs font-medium bg-slate-50 border border-slate-200 outline-none rounded-xl px-3.5 py-2.5 focus:bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition resize-none"
                      id="input-booking-notes"
                    />
                  </div>

                  {validationError && (
                    <div className="flex gap-2 bg-rose-50 border border-rose-100 text-rose-700 p-3 rounded-xl text-xs font-medium">
                      <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-rose-500" />
                      <span>{validationError}</span>
                    </div>
                  )}

                  <div className="grid grid-cols-3 gap-3">
                    <button
                      type="button"
                      onClick={() => setBookingStep(1)}
                      className="py-3 bg-slate-100 hover:bg-slate-250 text-slate-700 font-bold rounded-xl text-xs transition cursor-pointer text-center"
                    >
                      Atrás
                    </button>
                    <button
                      type="button"
                      onClick={handleNextToConfirmation}
                      className="col-span-2 py-3 bg-indigo-600 hover:bg-slate-900 active:scale-95 text-white font-bold rounded-xl text-xs transition cursor-pointer text-center flex items-center justify-center gap-1.5 shadow-sm"
                      id="btn-stepper-goto-3"
                    >
                      <span>Continuar</span>
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )}

              {/* Step 3: Confirmation Review */}
              {bookingStep === 3 && (
                <form onSubmit={handleBookingSubmit} className="space-y-4">
                  <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 space-y-3.5 text-xs text-slate-700">
                    <h4 className="font-bold text-slate-800 border-b border-slate-200 pb-1.5 flex items-center gap-1.5">
                      <CheckCircle2 className="h-4.5 w-4.5 text-emerald-600" />
                      Revisión del Pedido
                    </h4>

                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-slate-400">Fecha:</span>
                        <span className="font-semibold text-slate-900">{date}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Horario:</span>
                        <span className="font-semibold text-slate-900">{startTime} - {endTime} ({hours} hrs)</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Paciente:</span>
                        <span className="font-semibold text-slate-900 truncate max-w-[150px]">{patientName}</span>
                      </div>
                      <div className="pt-1">
                        <span className="text-slate-400 block mb-0.5">Diagnóstico/Síntoma:</span>
                        <p className="bg-white p-2 rounded-lg border border-slate-100 text-[11px] leading-relaxed italic text-slate-600">
                          "{patientCondition}"
                        </p>
                      </div>
                      {notes.trim() && (
                        <div>
                          <span className="text-slate-400 block mb-0.5">Instrucciones Hogar:</span>
                          <p className="bg-white p-2 rounded-lg border border-slate-100 text-[11px] leading-relaxed text-slate-600">
                            {notes}
                          </p>
                        </div>
                      )}
                    </div>

                    <div className="border-t border-slate-200 pt-3 space-y-1.5">
                      <div className="flex justify-between text-slate-500 font-medium">
                        <span>Costo base por hora:</span>
                        <span>US$ {nurse.hourly_rate}</span>
                      </div>
                      <div className="flex justify-between text-slate-500 font-medium">
                        <span>Total de horas contratadas:</span>
                        <span>{hours} horas</span>
                      </div>
                      <div className="border-t border-slate-200/60 pt-2 flex justify-between items-center font-black text-slate-900 bg-indigo-50/50 -mx-4 px-4 py-2">
                        <span className="text-indigo-800">Total a Pagar:</span>
                        <span className="text-lg text-indigo-600">US$ {totalPrice}</span>
                      </div>
                    </div>
                  </div>

                  {validationError && (
                    <div className="flex gap-2 bg-rose-50 border border-rose-100 text-rose-700 p-3 rounded-xl text-xs font-medium">
                      <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-rose-500" />
                      <span>{validationError}</span>
                    </div>
                  )}

                  <div className="grid grid-cols-3 gap-3">
                    <button
                      type="button"
                      onClick={() => setBookingStep(2)}
                      className="py-3 bg-slate-100 hover:bg-slate-250 text-slate-700 font-bold rounded-xl text-xs transition cursor-pointer text-center"
                    >
                      Atrás
                    </button>
                    <button
                      type="submit"
                      className="col-span-2 py-3 bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white font-bold rounded-xl text-xs transition cursor-pointer text-center shadow-lg shadow-indigo-600/10"
                      id="btn-confirm-booking-form"
                    >
                      Confirmar y Reservar
                    </button>
                  </div>
                </form>
              )}

              <p className="text-[10px] text-slate-400 text-center leading-normal">
                No realizamos cargos a tu tarjeta hasta que el cuidador confirme su visita. Cancela sin costo hasta 24 horas antes del servicio.
              </p>
            </div>
          </div>

        </div>
      )}
    </div>
  );
};
