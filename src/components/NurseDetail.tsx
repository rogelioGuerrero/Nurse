/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { type FC } from 'react';
import { useApp } from '../context/AppContext';
import { SHIFTS } from '../types';
import {
  Star, Clock, ChevronLeft, MapPin, Award, ShieldCheck,
  Stethoscope, AlertCircle, Heart, CheckCircle2, BadgeCheck, FileText
} from 'lucide-react';
import { LegalDisclaimer } from './LegalDisclaimer';
import { CSSPVerificationBadge } from './CSSPVerificationBadge';

const DAY_NAMES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

export const NurseDetail: FC = () => {
  const {
    nurses,
    profiles,
    bookings,
    selectedNurseId,
    setSelectedNurseId,
    setActiveTab
  } = useApp();

  // Find nurse and linked profile
  const nurse = nurses.find(n => n.id === selectedNurseId);
  const profile = nurse ? profiles.find(p => p.id === nurse.user_id) : null;


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

      <div className="space-y-6">
          
          {/* Main profile technical specs */}
          <div className="space-y-6">
            
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
                  <span className="text-emerald-700 font-semibold uppercase tracking-wider text-[10px]">Identidad verificada</span>
                </div>

                <div className="pt-3 border-t border-slate-100">
                  <p className="text-[11px] text-slate-400 leading-snug text-center sm:text-left">
                    El contacto directo se habilita cuando la enfermera acepta tu oferta en la plataforma.
                  </p>
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

            </div>

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

          {/* Platform request CTA */}
          <div className="space-y-6">
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-5">
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100">
                <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Tarifa de Atención</span>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-black text-slate-800">US$ {nurse.shift_rate}</span>
                  <span className="text-xs font-semibold text-slate-500">/ turno</span>
                </div>
                <p className="mt-1.5 text-[10px] text-slate-500 leading-normal">
                  <strong>Turnos:</strong> {nurse.available_shifts.map(s => SHIFTS[s]?.label || s).join(', ')}
                </p>
                {nurse.available_days && nurse.available_days.length > 0 && (
                  <p className="mt-1 text-[10px] text-slate-500 leading-normal">
                    <strong>Días:</strong> {[...nurse.available_days].sort((a, b) => a - b).map(d => DAY_NAMES[d]).join(' · ')}
                  </p>
                )}
              </div>

              <div className="space-y-2.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Cómo funciona</span>
                {['Publica tu solicitud de cuidado', 'Recibe ofertas de enfermeras verificadas', 'Acepta la mejor y coordina el servicio'].map((step, i) => (
                  <div key={i} className="flex items-center gap-2.5 text-xs text-slate-600 font-medium">
                    <span className="w-5 h-5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100 text-[10px] font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                    <span>{step}</span>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={() => { setSelectedNurseId(null); setActiveTab('care-request'); }}
                className="w-full py-3 bg-indigo-600 hover:bg-slate-900 active:scale-95 text-white font-bold rounded-xl text-xs transition cursor-pointer shadow-sm"
                id="btn-request-care-platform"
              >
                Solicitar cuidado en la plataforma
              </button>

              <LegalDisclaimer variant="full" />

              <p className="text-[10px] text-slate-400 text-center leading-normal">
                No realizamos cargos a tu tarjeta hasta que el cuidador confirme su visita. La política de cancelación aplica solo con factura.
              </p>
            </div>
          </div>

      </div>
    </div>
  );
};
