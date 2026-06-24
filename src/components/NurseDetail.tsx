/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, type FC, type FormEvent } from 'react';
import { useApp } from '../context/AppContext';
import AvailabilityCalendar from './AvailabilityCalendar';
import {
  Star, Clock, ChevronLeft, ChevronRight, MapPin, Award, ShieldCheck,
  Stethoscope, AlertCircle, Heart, CheckCircle2, MessageCircle, BadgeCheck, FileText
} from 'lucide-react';
import { LegalDisclaimer } from './LegalDisclaimer';
import { CSSPVerificationBadge } from './CSSPVerificationBadge';

export const NurseDetail: FC = () => {
  const {
    nurses,
    profiles,
    bookings,
    selectedNurseId,
    setSelectedNurseId,
    createBooking,
    setActiveTab
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

  const totalPrice = nurse.shift_rate;

  const calculateShiftHours = (): number => {
    if (!startTime || !endTime) return 0;
    const [startH, startM] = startTime.split(':').map(Number);
    const [endH, endM] = endTime.split(':').map(Number);
    let diff = (endH * 60 + endM - startH * 60 - startM) / 60;
    if (diff <= 0) diff += 24;
    return parseFloat(diff.toFixed(1));
  };

  const handleNextToDetails = () => {
    setValidationError('');
    if (!date) {
      setValidationError('Por favor selecciona una fecha válida.');
      return;
    }
    setBookingStep(2);
  };

  const handleNextToConfirmation = () => {
    setValidationError('');
    if (!patientName.trim()) {
      setValidationError('Se requiere el nombre del paciente.');
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

  const handleBookingSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setValidationError('');

    // Validation is already enforced by the stepper (handleNextToDetails + handleNextToConfirmation)
    // before reaching step 3, so we can proceed directly to booking creation.

    // Prepare packed fields for high compatibility with standard schema
    const packedCondition = `${patientCondition} [Autonomía: ${autonomyLevel}] [Alergias: ${patientAllergies || 'Ninguna'}] [Medicamentos: ${chronicMedications || 'Ninguno'}] [Emergencia: ${emergencyContact}]`;

    try {
      await createBooking({
        nurse_id: nurse.id,
        date,
        start_time: startTime,
        end_time: endTime,
        hours: calculateShiftHours(),
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
    } catch (err) {
      setValidationError(err instanceof Error ? err.message : 'Error al agendar cita.');
    }
  };

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
              Se ha solicitado tu cita con <strong>{profile.full_name}</strong>. Puedes coordinar directamente por WhatsApp.
            </p>
          </div>
          <div className="flex justify-center pt-3">
            <button
              onClick={() => setActiveTab('bookings')}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm px-5 py-2.5 rounded-xl transition cursor-pointer"
              id="btn-nav-bookings"
            >
              Ver mis Solicitudes
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
                      Cuidador Profesional Registrado
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
                  {profile.phone && (
                    <a
                      href={`https://wa.me/503${profile.phone.replace(/[^0-9]/g, '').replace(/^503/, '')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold px-4 py-2 rounded-xl transition text-xs"
                    >
                      <MessageCircle className="h-4 w-4" />
                      <span>Contactar por WhatsApp</span>
                    </a>
                  )}
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

              {/* CSSP obligatorio */}
              <div className="pt-4 border-t border-slate-100 space-y-3.5">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                  <ShieldCheck className="h-4.5 w-4.5 text-indigo-600" />
                  Registro profesional
                </h4>
                <div className="bg-emerald-50/50 rounded-2xl p-4 border border-emerald-100/60 space-y-3">
                  <CSSPVerificationBadge nurse={nurse} variant="full" />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div className="flex items-center gap-2 bg-white p-2 rounded-xl border border-emerald-100 shadow-sm">
                      <BadgeCheck className="h-5 w-5 text-emerald-600 shrink-0" />
                      <div>
                        <span className="text-[10px] font-black text-slate-800 block">Nivel profesional</span>
                        <span className="text-[9px] text-slate-400 font-semibold block">{nurse.cssp_level}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 bg-white p-2 rounded-xl border border-emerald-100 shadow-sm">
                    <FileText className="h-5 w-5 text-emerald-600 shrink-0" />
                    <div>
                      <span className="text-[10px] font-black text-slate-800 block">Pago con FSE</span>
                      <span className="text-[9px] text-slate-400 font-semibold block">BienCuidar gestiona FSE e ISR</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Verificaciones opcionales */}
              {nurse.verifications?.college_registration ? (
                <div className="pt-4 border-t border-slate-100 space-y-3.5">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                    <ShieldCheck className="h-4.5 w-4.5 text-indigo-600" />
                    Verificaciones adicionales
                  </h4>
                  <div className="bg-indigo-50/50 rounded-2xl p-4 border border-indigo-100/60 space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div className="flex items-center gap-2 bg-white p-2 rounded-xl border border-slate-100 shadow-sm">
                        <BadgeCheck className="h-5 w-5 text-emerald-600 shrink-0" />
                        <div>
                          <span className="text-[10px] font-black text-slate-800 block">Registro del Colegio</span>
                          <span className="text-[9px] text-slate-400 font-semibold block">{nurse.verifications.college_registration}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>

            {/* Availability Calendar */}
            <AvailabilityCalendar nurseId={nurse.id} isEditable={false} />

            {/* Portfolio: completed services track record */}
            {(() => {
              const completedBookings = bookings.filter(b => b.nurse_id === nurse.id && b.status === 'completed');
              if (completedBookings.length === 0) return null;
              return (
                <div className="pt-4 border-t border-slate-100">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-1.5">
                    <Award className="h-4 w-4 text-amber-500" />
                    Portafolio de Servicios ({completedBookings.length})
                  </h4>
                  <div className="space-y-2">
                    {completedBookings.slice(0, 8).map((b) => {
                      const familyProfile = profiles.find(p => p.id === b.user_id);
                      return (
                        <div key={b.id} className="flex items-center gap-3 bg-slate-50 rounded-xl p-3 border border-slate-100">
                          <div className="flex-shrink-0 w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center">
                            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-bold text-slate-700 truncate">
                              {b.patient_name || 'Paciente'}
                            </div>
                            <div className="text-[10px] text-slate-400">
                              {new Date(b.date + 'T00:00:00').toLocaleDateString('es-SV', { day: 'numeric', month: 'short', year: 'numeric' })} · {b.patient_condition || 'Cuidado general'}
                            </div>
                          </div>
                          <span className="text-xs font-bold text-emerald-700">${b.total_price}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

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
                      if (date) {
                        setBookingStep(2);
                      } else {
                        setValidationError('Por favor selecciona una fecha para avanzar.');
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
                      if (date && patientName.trim() && patientCondition.trim()) {
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

              {/* Step 1: Selection (Date and Turno) */}
              {bookingStep === 1 && (
                <div className="space-y-4">
                  <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100">
                    <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Tarifa de Atención</span>
                    <div className="flex items-baseline gap-2">
                      <span className="text-2xl font-black text-slate-800">US$ {nurse.shift_rate}</span>
                      <span className="text-xs font-semibold text-slate-500">/ turno</span>
                    </div>
                    <p className="mt-1.5 text-[10px] text-slate-500 leading-normal">
                      <strong>Turnos disponibles:</strong> {nurse.available_shifts.map(s => s === 'morning' ? 'Mañana' : s === 'afternoon' ? 'Tarde' : 'Noche').join(', ')}
                    </p>
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

                  {date && (
                    <div className="bg-slate-50 rounded-xl p-3 border border-slate-200 text-xs text-slate-700 flex justify-between items-center font-medium">
                      <span>Turno:</span>
                      <span className="font-bold text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-lg border border-indigo-100">{startTime} - {endTime}</span>
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
              {bookingStep === 2 && (
                <div className="space-y-4">
                  <div className="bg-indigo-50/20 p-4 border border-indigo-100 rounded-2xl mb-2">
                    <span className="text-[10px] font-bold text-indigo-700 uppercase tracking-widest block mb-1">FICHA CLÍNICA DIGITAL DEL PACIENTE</span>
                    <p className="text-[11px] text-slate-500 font-medium">Esta ficha digital será enviada de forma inmediata al enfermero profesional y se anexará a su reporte.</p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                        Nombre del Paciente <span className="text-rose-500">*</span>
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
                      className="py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition cursor-pointer text-center"
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
                        <span className="font-semibold text-slate-900">{startTime} - {endTime}</span>
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
                        <span>Tarifa por turno:</span>
                        <span>US$ {nurse.shift_rate}</span>
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
                      className="py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition cursor-pointer text-center"
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

              <LegalDisclaimer variant="full" />

              <p className="text-[10px] text-slate-400 text-center leading-normal">
                No realizamos cargos a tu tarjeta hasta que el cuidador confirme su visita. La política de cancelación aplica solo con factura.
              </p>
            </div>
          </div>

        </div>
      )}
    </div>
  );
};
