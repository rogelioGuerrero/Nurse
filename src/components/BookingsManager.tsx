/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, type FC } from 'react';
import { useApp } from '../context/AppContext';
import { Booking, BookingStatus } from '../types';
import { groqChat } from '../lib/groq';
import { 
  Calendar, User, HeartPulse, CheckCircle, 
  CheckCircle2,
  Activity, Smile, PlusCircle, Sparkles, FileText, AlertTriangle,
  Printer, Phone
} from 'lucide-react';

interface CareLog {
  bookingId: string;
  bloodPressure: string; // e.g., 120/80 mmHg
  heartRate: string; // e.g., 75 lpm
  glucose: string; // e.g., 110 mg/dL
  temperature: string; // e.g., 36.5 °C
  mood: string; // Alegre, Somnoliento, etc.
  remarks: string;
  updatedAt: string;
}

export const BookingsManager: FC = () => {
  const { 
    bookings, 
    nurses, 
    profiles, 
    currentUser, 
    updateBookingStatus 
  } = useApp();

  const isNurseView = currentUser?.role === 'nurse';

  const [selectedReceiptBooking, setSelectedReceiptBooking] = useState<Booking | null>(null);

  const [careLogs, setCareLogs] = useState<Record<string, CareLog>>(() => {
    const saved = localStorage.getItem('localnurse_carelogs');
    if (saved) return JSON.parse(saved);
    // Seed default logs for demo completed booking
    return {
      'b-demo-2': {
        bookingId: 'b-demo-2',
        bloodPressure: '120/80 mmHg',
        heartRate: '72 lpm',
        glucose: '115 mg/dL',
        temperature: '36.6 °C',
        mood: 'Alegre',
        remarks: 'Paciente completó con éxito su almuerzo y caminó en el jardín por 15 minutos. Nivel de oxígeno estable. Se tomó su recordatorio de medicina puntual.',
        updatedAt: new Date(Date.now() - 86400000 * 3).toISOString()
      }
    };
  });

  useEffect(() => {
    localStorage.setItem('localnurse_carelogs', JSON.stringify(careLogs));
  }, [careLogs]);

  // Forms for editing/creating care log
  const [editingBookingId, setEditingBookingId] = useState<string | null>(null);
  const [formBloodPressure, setFormBloodPressure] = useState('');
  const [formHeartRate, setFormHeartRate] = useState('');
  const [formGlucose, setFormGlucose] = useState('');
  const [formTemperature, setFormTemperature] = useState('');
  const [formMood, setFormMood] = useState('Tranquilo');
  const [formRemarks, setFormRemarks] = useState('');

  // AI Interpretation states
  const [aiReportId, setAiReportId] = useState<string | null>(null);
  const [aiReportContent, setAiReportContent] = useState<string>('');
  const [aiReportLoading, setAiReportLoading] = useState(false);

  if (!currentUser) return null;

  const handleOpenLogForm = (bookingId: string) => {
    const log = careLogs[bookingId];
    setEditingBookingId(bookingId);
    setFormBloodPressure(log?.bloodPressure || '120/80 mmHg');
    setFormHeartRate(log?.heartRate || '75 lpm');
    setFormGlucose(log?.glucose || '100 mg/dL');
    setFormTemperature(log?.temperature || '36.5 °C');
    setFormMood(log?.mood || 'Tranquilo');
    setFormRemarks(log?.remarks || '');
  };

  const handleSaveLog = (bookingId: string) => {
    setCareLogs(prev => ({
      ...prev,
      [bookingId]: {
        bookingId,
        bloodPressure: formBloodPressure,
        heartRate: formHeartRate,
        glucose: formGlucose,
        temperature: formTemperature,
        mood: formMood,
        remarks: formRemarks,
        updatedAt: new Date().toISOString()
      }
    }));
    setEditingBookingId(null);
  };

  const handleGenerateAIInterpretation = async (bookingId: string, patientName: string) => {
    const log = careLogs[bookingId];
    if (!log) return;
    
    setAiReportId(bookingId);
    setAiReportContent('');
    setAiReportLoading(true);

    try {
      const content = await groqChat(
        [
          {
            role: 'system',
            content: 'Eres un enfermero geriatra clínico experto en El Salvador. Analiza los signos vitales de un paciente adulto mayor y proporciona un informe corto, empático y profesional de la jornada para sus familiares. Explica si los valores están en rangos normales y da recomendaciones prácticas salvadoreñas de cuidado.'
          },
          {
            role: 'user',
            content: `Analiza esta bitácora del paciente ${patientName}:
            - Presión Arterial: ${log.bloodPressure}
            - Ritmo Cardíaco: ${log.heartRate}
            - Glucemia (Glucosa): ${log.glucose}
            - Temperatura: ${log.temperature}
            - Estado de ánimo: ${log.mood}
            - Comentarios del enfermero: ${log.remarks}`
          }
        ],
        { temperature: 0.5, maxTokens: 400 }
      );
      setAiReportContent(content);
    } catch {
      setAiReportContent('Ocurrió un error al contactar con el Asistente Clínico Llama-3. Asegúrate de que tu clave Groq API Key sea válida.');
    } finally {
      setAiReportLoading(false);
    }
  };

  const parsePatientCondition = (condition: string) => {
    if (!condition) {
      return { raw: '', diagnosis: 'No especificado', autonomy: 'No especificada', allergies: 'Ninguna', medications: 'Ninguna', emergency: 'No proporcionado' };
    }
    
    if (!condition.includes('[Autonomía:')) {
      return {
        raw: condition,
        diagnosis: condition,
        autonomy: 'No especificada',
        allergies: 'Ninguna',
        medications: 'Ninguna',
        emergency: 'No proporcionado'
      };
    }
    
    try {
      const diagMatch = condition.match(/^([^[]+)/);
      const autonomyMatch = condition.match(/\[Autonomía:\s*([^\]]+)\]/);
      const allergiesMatch = condition.match(/\[Alergias:\s*([^\]]+)\]/);
      const medsMatch = condition.match(/\[Medicamentos:\s*([^\]]+)\]/);
      const emergencyMatch = condition.match(/\[Emergencia:\s*([^\]]+)\]/);
      
      return {
        raw: condition,
        diagnosis: diagMatch ? diagMatch[1].trim() : condition,
        autonomy: autonomyMatch ? autonomyMatch[1].trim() : 'No especificada',
        allergies: allergiesMatch ? allergiesMatch[1].trim() : 'Ninguna',
        medications: medsMatch ? medsMatch[1].trim() : 'Ninguno',
        emergency: emergencyMatch ? emergencyMatch[1].trim() : 'No proporcionado'
      };
    } catch {
      return {
        raw: condition,
        diagnosis: condition,
        autonomy: 'No especificada',
        allergies: 'Ninguna',
        medications: 'Ninguna',
        emergency: 'No proporcionado'
      };
    }
  };

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

      {/* EL SALVADOR SOS EMERGENCY BANNER */}
      {filteredBookings.some(b => b.status === 'confirmed') && (
        <div className="bg-rose-50 border-2 border-rose-200 rounded-3xl p-5 text-rose-950 flex flex-col md:flex-row items-start md:items-center gap-4 shadow-sm" id="sos-emergency-banner">
          <div className="w-12 h-12 bg-rose-100 border border-rose-200 rounded-2xl flex items-center justify-center text-rose-600 shrink-0 animate-pulse">
            <AlertTriangle className="h-6.5 w-6.5 animate-bounce" />
          </div>
          <div className="flex-1 space-y-1 text-xs">
            <span className="font-extrabold text-rose-800 uppercase tracking-wider text-[11px] block flex items-center gap-1.5">
              🚨 ASISTENCIA SOS CRÍTICA (EL SALVADOR)
            </span>
            <p className="font-semibold text-slate-700 leading-normal">
              Tienes una visita de cuidado activo programada. Ante cualquier descompensación clínica severa o emergencia domiciliaria, mantén la calma y comunícate de inmediato con la red nacional de salud de El Salvador:
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1.5 text-center text-[10px] font-black uppercase">
              <a href="tel:132" className="bg-rose-100 hover:bg-rose-200 text-rose-800 p-2 rounded-xl border border-rose-200 transition flex items-center justify-center gap-1">
                <Phone className="h-3 w-3" />
                <span>SEM 132 (Ambulancia)</span>
              </a>
              <a href="tel:911" className="bg-rose-100 hover:bg-rose-200 text-rose-800 p-2 rounded-xl border border-rose-200 transition flex items-center justify-center gap-1">
                <Phone className="h-3 w-3" />
                <span>PNC 911 (Seguridad)</span>
              </a>
              <a href="tel:22225155" className="bg-rose-100 hover:bg-rose-200 text-rose-800 p-2 rounded-xl border border-rose-200 transition flex items-center justify-center gap-1">
                <Phone className="h-3 w-3" />
                <span>Cruz Roja 2222-5155</span>
              </a>
              <a href="tel:913" className="bg-rose-100 hover:bg-rose-200 text-rose-800 p-2 rounded-xl border border-rose-200 transition flex items-center justify-center gap-1">
                <Phone className="h-3 w-3" />
                <span>Bomberos 913</span>
              </a>
            </div>
          </div>
        </div>
      )}

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
            const clientProfile = profiles.find(p => p.id === b.user_id);
            const counterPartyName = isNurseView
              ? (clientProfile?.full_name ?? 'Familia Visitada')
              : (profiles.find(p => p.id === nurses.find(n => n.id === b.nurse_id)?.user_id)?.full_name ?? 'Caretaker Profesional');
            const counterPartyAvatar = isNurseView
              ? (clientProfile?.avatar_url ?? 'https://images.unsplash.com/photo-1511285560929-80b456fea0bc?w=200')
              : (profiles.find(p => p.id === nurses.find(n => n.id === b.nurse_id)?.user_id)?.avatar_url ?? 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=200');
            const counterPartySpecializations = !isNurseView
              ? (nurses.find(n => n.id === b.nurse_id)?.specialization ?? [])
              : [];

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
                      US$ {b.total_price}
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
                      Ficha Médica Geriátrica
                    </div>
                    {(() => {
                      const info = parsePatientCondition(b.patient_condition);
                      return (
                        <div className="font-bold text-slate-700 text-xs space-y-1">
                          <p className="text-slate-800 font-black text-sm">{b.patient_name}</p>
                          <p className="text-slate-600 font-semibold"><span className="text-slate-400">Diag:</span> {info.diagnosis}</p>
                          
                          {b.patient_condition.includes('[Autonomía:') && (
                            <div className="mt-2 pt-1 border-t border-slate-200/50 space-y-1 text-[11px] font-medium text-slate-500">
                              <p><span className="font-bold text-slate-700">Autonomía:</span> <span className="bg-indigo-50 text-indigo-700 font-bold px-1.5 py-0.5 rounded text-[9px] border border-indigo-100">{info.autonomy}</span></p>
                              <p><span className="font-bold text-slate-700">Alergias:</span> <span className="text-rose-600 font-semibold">{info.allergies}</span></p>
                              <p><span className="font-bold text-slate-700">Meds:</span> <span className="text-slate-600 italic">{info.medications}</span></p>
                              <p className="text-indigo-800 font-semibold bg-indigo-50/30 p-1.5 rounded border border-indigo-100/40"><span className="font-black">SOS El Salvador:</span> {info.emergency}</p>
                            </div>
                          )}
                        </div>
                      );
                    })()}
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

                {/* INTERACTIVE CLINICAL LOG & VITAL SIGNS BITÁCORA */}
                {(b.status === 'confirmed' || b.status === 'completed') && (
                  <div className="border-t border-slate-100 pt-4 space-y-4">
                    {/* Log Header */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Activity className="h-5 w-5 text-indigo-600" />
                        <h5 className="font-extrabold text-xs text-slate-800 uppercase tracking-wider">Bitácora Médica de Signos Vitales</h5>
                      </div>
                      <span className="text-[10px] bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded border border-indigo-100 font-bold">
                        Valor Agregado Geriátrico
                      </span>
                    </div>

                    {editingBookingId === b.id ? (
                      /* NURSE EDITING FORM */
                      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-4 text-xs">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                          <div>
                            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Presión Arterial</label>
                            <input 
                              type="text" 
                              value={formBloodPressure} 
                              onChange={(e) => setFormBloodPressure(e.target.value)} 
                              className="w-full bg-white border border-slate-200 rounded-lg p-2 font-semibold"
                              placeholder="Ej. 120/80 mmHg" 
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Frecuencia Cardíaca</label>
                            <input 
                              type="text" 
                              value={formHeartRate} 
                              onChange={(e) => setFormHeartRate(e.target.value)} 
                              className="w-full bg-white border border-slate-200 rounded-lg p-2 font-semibold"
                              placeholder="Ej. 75 lpm" 
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Glucemia (Glucosa)</label>
                            <input 
                              type="text" 
                              value={formGlucose} 
                              onChange={(e) => setFormGlucose(e.target.value)} 
                              className="w-full bg-white border border-slate-200 rounded-lg p-2 font-semibold"
                              placeholder="Ej. 100 mg/dL" 
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Temperatura</label>
                            <input 
                              type="text" 
                              value={formTemperature} 
                              onChange={(e) => setFormTemperature(e.target.value)} 
                              className="w-full bg-white border border-slate-200 rounded-lg p-2 font-semibold"
                              placeholder="Ej. 36.5 °C" 
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div>
                            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Estado de Ánimo</label>
                            <select 
                              value={formMood} 
                              onChange={(e) => setFormMood(e.target.value)} 
                              className="w-full bg-white border border-slate-200 rounded-lg p-2 font-semibold cursor-pointer"
                            >
                              <option value="Alegre">Alegre / Estimulado</option>
                              <option value="Tranquilo">Tranquilo / Relajado</option>
                              <option value="Ansioso">Ansioso / Inquieto</option>
                              <option value="Agitado">Agitado / Reactivo</option>
                              <option value="Somnoliento">Somnoliento / Decaído</option>
                            </select>
                          </div>
                          <div className="sm:col-span-2">
                            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Comentarios de Evolución Clínica y Diaria</label>
                            <input 
                              type="text" 
                              value={formRemarks} 
                              onChange={(e) => setFormRemarks(e.target.value)} 
                              className="w-full bg-white border border-slate-200 rounded-lg p-2"
                              placeholder="Ej. Almorzó sopa, tomó abundantes líquidos y anduvo con buena energía..." 
                            />
                          </div>
                        </div>

                        <div className="flex justify-end gap-2 pt-1">
                          <button 
                            type="button" 
                            onClick={() => setEditingBookingId(null)} 
                            className="bg-slate-200 hover:bg-slate-300 text-slate-700 px-3.5 py-1.5 rounded-lg font-bold transition cursor-pointer"
                          >
                            Cancelar
                          </button>
                          <button 
                            type="button" 
                            onClick={() => handleSaveLog(b.id)} 
                            className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-1.5 rounded-lg font-bold transition shadow-sm cursor-pointer"
                          >
                            Guardar Signos Vitales
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* RENDER SIGNOS VITALES BOARD */
                      (() => {
                        const log = careLogs[b.id];
                        if (log) {
                          return (
                            <div className="space-y-3.5">
                              {/* Signs Cards Grid */}
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                                <div className="bg-indigo-50/45 p-3 rounded-xl border border-indigo-100/30 flex flex-col justify-center">
                                  <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">P. Arterial</span>
                                  <span className="text-sm font-black text-indigo-900">{log.bloodPressure}</span>
                                </div>
                                <div className="bg-indigo-50/45 p-3 rounded-xl border border-indigo-100/30 flex flex-col justify-center">
                                  <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">Frec. Cardíaca</span>
                                  <span className="text-sm font-black text-indigo-900">{log.heartRate}</span>
                                </div>
                                <div className="bg-indigo-50/45 p-3 rounded-xl border border-indigo-100/30 flex flex-col justify-center">
                                  <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">Glucemia</span>
                                  <span className="text-sm font-black text-indigo-900">{log.glucose}</span>
                                </div>
                                <div className="bg-indigo-50/45 p-3 rounded-xl border border-indigo-100/30 flex flex-col justify-center">
                                  <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">Temperatura</span>
                                  <span className="text-sm font-black text-indigo-900">{log.temperature}</span>
                                </div>
                              </div>

                              {/* Mood and Remarks row */}
                              <div className="bg-slate-50 border border-slate-100 rounded-xl p-3.5 text-xs text-slate-700 space-y-2">
                                <div className="flex items-center gap-2 text-[11px] font-bold text-slate-500">
                                  <Smile className="h-4 w-4 text-indigo-500" />
                                  <span>Estado de Ánimo:</span>
                                  <span className="bg-amber-100 text-amber-800 font-extrabold px-2 py-0.5 rounded text-[10px] border border-amber-200/30">{log.mood}</span>
                                  <span className="text-[10px] text-slate-400 font-normal ml-auto">Última actualización: {new Date(log.updatedAt).toLocaleTimeString()}</span>
                                </div>
                                <p className="leading-relaxed font-medium bg-white p-2.5 rounded-lg border border-slate-100 text-slate-600">
                                  {log.remarks || 'Sin notas de evolución descritas.'}
                                </p>
                              </div>

                              {/* BUTTONS FOR LOG MANAGEMENT */}
                              <div className="flex items-center gap-3">
                                {isNurseView ? (
                                  <button 
                                    onClick={() => handleOpenLogForm(b.id)} 
                                    className="text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-xl border border-indigo-100 transition cursor-pointer"
                                  >
                                    Editar Signos Vitales
                                  </button>
                                ) : (
                                  <button 
                                    onClick={() => handleGenerateAIInterpretation(b.id, b.patient_name)}
                                    className="text-xs font-black text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-4 py-2 rounded-xl border border-indigo-100 transition flex items-center gap-1.5 shadow-sm shadow-indigo-100/40 cursor-pointer"
                                  >
                                    <Sparkles className="h-4.5 w-4.5 text-indigo-600 animate-pulse" />
                                    <span>Generar Reporte Clínico IA con Groq</span>
                                  </button>
                                )}
                              </div>

                              {/* AI advice content output */}
                              {aiReportId === b.id && (
                                <div className="bg-gradient-to-br from-indigo-50/70 to-purple-50/70 border border-indigo-100 rounded-2xl p-4 space-y-2.5 relative shadow-sm">
                                  <div className="flex items-center gap-2">
                                    <Sparkles className="h-4.5 w-4.5 text-indigo-600" />
                                    <span className="text-xs font-extrabold text-indigo-950 uppercase tracking-wider block">Análisis Clínico Llama IA (El Salvador)</span>
                                    <button 
                                      onClick={() => setAiReportId(null)} 
                                      className="text-slate-400 hover:text-slate-600 text-xs font-black ml-auto cursor-pointer"
                                    >
                                      ✕
                                    </button>
                                  </div>

                                  {aiReportLoading ? (
                                    <div className="flex items-center gap-2 text-xs text-indigo-600 py-2">
                                      <div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                                      <span>Llama-3 está revisando el reporte geriátrico...</span>
                                    </div>
                                  ) : (
                                    <p className="text-xs text-slate-700 font-medium leading-relaxed whitespace-pre-line bg-white/70 p-3 rounded-xl border border-white">
                                      {aiReportContent}
                                    </p>
                                  )}
                                </div>
                              )}

                            </div>
                          );
                        } else {
                          return (
                            <div className="bg-slate-50 border border-dashed border-slate-200 rounded-xl p-4 text-center text-xs space-y-2">
                              <p className="text-slate-500 font-medium">No se han registrado signos vitales ni evolución diaria para esta visita.</p>
                              {isNurseView ? (
                                <button 
                                  onClick={() => handleOpenLogForm(b.id)} 
                                  className="text-xs font-black text-white bg-indigo-600 hover:bg-indigo-500 px-4 py-2 rounded-xl transition shadow-sm inline-flex items-center gap-1.5 cursor-pointer"
                                >
                                  <PlusCircle className="h-4 w-4" />
                                  <span>Registrar Bitácora de Signos Vitales</span>
                                </button>
                              ) : (
                                <p className="text-[10px] text-slate-400">El enfermero registrará los signos vitales y notas de la jornada durante o al finalizar su visita.</p>
                              )}
                            </div>
                          );
                        }
                      })()
                    )}
                  </div>
                )}

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
                    <div className="w-full flex flex-col sm:flex-row justify-between sm:items-center text-xs text-slate-500 gap-3">
                      <span className="flex items-center gap-1 text-emerald-700 font-medium">
                        <CheckCircle className="h-4.5 w-4.5 text-emerald-500 shrink-0" />
                        Atendida con alto estándar de calidad
                      </span>
                      <div className="flex flex-wrap items-center gap-2.5">
                        <button
                          onClick={() => setSelectedReceiptBooking(b)}
                          className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-3 py-1.5 rounded-xl border border-slate-200 transition cursor-pointer flex items-center gap-1.5 text-[11px]"
                        >
                          <FileText className="h-3.5 w-3.5 text-slate-500" />
                          <span>Ver Recibo de Honorarios</span>
                        </button>
                      </div>
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

      {/* RECIBO DE HONORARIOS MODAL OVERLAY */}
      {selectedReceiptBooking && (() => {
        const b = selectedReceiptBooking;
        const nurseRec = nurses.find(n => n.id === b.nurse_id);
        const nurseProfile = nurseRec ? profiles.find(p => p.id === nurseRec.user_id) : null;
        const clientProfile = profiles.find(p => p.id === b.user_id);
        
        const emisorName = nurseProfile ? nurseProfile.full_name : 'Cuidadores Profesionales de El Salvador';
        const receptorName = clientProfile ? clientProfile.full_name : 'Familia Ramírez Gómez';
        
        const subtotal = b.total_price;
        const retencion = subtotal * 0.1;
        const liquido = subtotal * 0.9;

        return (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" id="receipt-modal-overlay">
            <div className="bg-white rounded-3xl max-w-xl w-full border border-slate-200 shadow-2xl p-6 md:p-8 space-y-6 relative overflow-hidden">
              
              {/* Receipt Header Banner */}
              <div className="flex justify-between items-start border-b border-slate-100 pb-4">
                <div className="space-y-1">
                  <span className="text-[10px] font-black uppercase tracking-widest bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded border border-indigo-100">
                    Facturación / Sujeto Excluido
                  </span>
                  <h3 className="text-xl font-bold text-slate-800 font-serif italic">Recibo de Honorarios Profesionales</h3>
                  <p className="text-[9px] text-slate-400">Emitido bajo regulaciones de la Dirección General de Impuestos Internos de El Salvador (Art. 156 C.T.)</p>
                </div>
                <button 
                  onClick={() => setSelectedReceiptBooking(null)}
                  className="text-slate-400 hover:text-slate-600 font-bold text-sm bg-slate-100 hover:bg-slate-200 w-8 h-8 rounded-full flex items-center justify-center transition cursor-pointer"
                >
                  ✕
                </button>
              </div>

              {/* Watermarked Receipt Body */}
              <div className="space-y-4 text-xs text-slate-700 relative">
                {/* Simulated Watermark background */}
                <div className="absolute inset-0 flex items-center justify-center opacity-[0.03] select-none pointer-events-none transform -rotate-12">
                  <span className="text-8xl font-black font-serif text-indigo-600">LOCALNURSE</span>
                </div>

                <div className="grid grid-cols-2 gap-4 border-b border-slate-50 pb-4">
                  <div>
                    <span className="text-[9px] uppercase font-black text-slate-400 block mb-0.5">Emisor (Enfermero Profesional)</span>
                    <span className="font-extrabold text-slate-900 block text-sm">{emisorName}</span>
                    <span className="text-[10px] text-slate-500 block">DUI: —</span>
                    <span className="text-[10px] text-indigo-600 font-semibold block">Reg. CSSP: N° —</span>
                  </div>
                  <div className="text-right">
                    <span className="text-[9px] uppercase font-black text-slate-400 block mb-0.5">Adquirente (Cliente Familiar)</span>
                    <span className="font-extrabold text-slate-900 block text-sm">{receptorName}</span>
                    <span className="text-[10px] text-slate-500 block">Fecha Servicio: {b.date}</span>
                    <span className="text-[10px] text-slate-500 block">Código Recibo: #LN-{b.id.substring(0, 8).toUpperCase()}</span>
                  </div>
                </div>

                {/* Concept and hours */}
                <div className="space-y-1.5 bg-slate-50 p-4 rounded-2xl border border-slate-100">
                  <span className="text-[9px] uppercase font-black text-slate-400 block">Concepto del Servicio</span>
                  <p className="font-bold text-slate-800">Servicios de asistencia de enfermería geriátrica a domicilio</p>
                  <p className="text-slate-500 text-[11px] leading-normal">
                    Servicio profesional de cuidado gerontológico para el paciente <strong className="text-slate-700 font-extrabold">{b.patient_name}</strong>. Duración contratada de <strong className="text-slate-700 font-extrabold">{b.hours} horas</strong> ({b.start_time} a {b.end_time}).
                  </p>
                </div>

                {/* Totals and calculations table */}
                <div className="border-t border-slate-100 pt-3 space-y-2">
                  <div className="flex justify-between font-semibold">
                    <span className="text-slate-500">Honorarios Brutos:</span>
                    <span className="text-slate-800">US$ {subtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between font-semibold text-rose-600">
                    <span>Retención del Impuesto sobre la Renta (10%):</span>
                    <span>-US$ {retencion.toFixed(2)}</span>
                  </div>
                  <div className="border-t border-slate-200/60 pt-2 flex justify-between items-center font-black text-base text-slate-900 bg-indigo-50/50 -mx-4 px-4 py-2.5">
                    <span className="text-indigo-800 text-sm">Monto Neto Líquido Recibido:</span>
                    <span className="text-lg text-indigo-700 font-black">US$ {liquido.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              {/* Legal Notice */}
              <p className="text-[10px] leading-relaxed text-slate-400 text-justify italic">
                *Nota Legal: Este comprobante ha sido generado automáticamente por LocalNurse Inc. en representación del emisor, de conformidad al artículo 156 del Código Tributario de la República de El Salvador. El emisor autoriza la respectiva retención del 10% del I.S.R. por servicios profesionales independientes.
              </p>

              {/* Control triggers */}
              <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
                <button
                  onClick={() => setSelectedReceiptBooking(null)}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-4 py-2.5 rounded-xl transition cursor-pointer text-xs"
                >
                  Cerrar Comprobante
                </button>
                <button
                  onClick={() => window.print()}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-5 py-2.5 rounded-xl transition cursor-pointer text-xs flex items-center gap-1.5 shadow-md shadow-indigo-100"
                >
                  <Printer className="h-4 w-4" />
                  <span>Imprimir Recibo</span>
                </button>
              </div>

            </div>
          </div>
        );
      })()}
    </div>
  );
};
