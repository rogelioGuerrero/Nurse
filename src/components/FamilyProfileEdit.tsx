/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useMemo, type FC } from 'react';
import { useApp } from '../context/AppContext';
import { User, Phone, MapPin, Save, CheckCircle2, BookOpen, ChevronDown, ChevronUp, FileText, DollarSign, Star, CheckCircle2 as CheckIcon, XCircle } from 'lucide-react';
import { SHIFTS } from '../types';

const MONTH_NAMES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const DAY_NAMES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

export const FamilyProfileEdit: FC = () => {
  const { currentUser, updateProfile, bookings, careLogs, nurseReviews, nurses, profiles } = useApp();
  const [fullName, setFullName] = useState(currentUser?.full_name || '');
  const [phone, setPhone] = useState(currentUser?.phone || '');
  const [locationName, setLocationName] = useState(currentUser?.location_name || '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showBitacora, setShowBitacora] = useState(false);

  const profileMap = useMemo(() => new Map(profiles.map(p => [p.id, p])), [profiles]);
  const nurseMap = useMemo(() => new Map(nurses.map(n => [n.id, n])), [nurses]);

  const myBookings = useMemo(() => {
    if (!currentUser) return [];
    return bookings
      .filter(b => b.user_id === currentUser.id)
      .sort((a, b) => new Date(b.date + 'T00:00:00').getTime() - new Date(a.date + 'T00:00:00').getTime());
  }, [bookings, currentUser]);

  const stats = useMemo(() => {
    const completed = myBookings.filter(b => b.status === 'completed');
    const totalHours = completed.reduce((sum, b) => sum + b.hours, 0);
    const totalSpent = completed.reduce((sum, b) => sum + b.total_price, 0);
    const reportsCount = completed.filter(b => careLogs[b.id]).length;
    return { total: myBookings.length, completed: completed.length, totalHours, totalSpent, reportsCount };
  }, [myBookings, careLogs]);

  if (!currentUser) {
    return <div className="p-6 text-center text-slate-500 text-sm">Inicia sesión para editar tu perfil.</div>;
  }

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    await updateProfile({
      full_name: fullName,
      phone,
      location_name: locationName,
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-bold text-slate-800">Mi Perfil</h2>
        <p className="text-xs text-slate-500 mt-0.5">Actualiza tus datos de contacto</p>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
        {/* Full name */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-slate-600 flex items-center gap-1.5">
            <User className="h-3.5 w-3.5" />
            Nombre completo
          </label>
          <input
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
            placeholder="Tu nombre"
          />
        </div>

        {/* Phone */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-slate-600 flex items-center gap-1.5">
            <Phone className="h-3.5 w-3.5" />
            Teléfono / WhatsApp
          </label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
            placeholder="7777-7777"
          />
          <p className="text-[10px] text-slate-400">El administrador usará este número para contactarte por WhatsApp.</p>
        </div>

        {/* Location */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-slate-600 flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5" />
            Ubicación
          </label>
          <input
            type="text"
            value={locationName}
            onChange={(e) => setLocationName(e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
            placeholder="Colonia, ciudad o zona"
          />
          <p className="text-[10px] text-slate-400">Nos ayuda a encontrar enfermeras cercanas.</p>
        </div>

        {/* Save button */}
        <div className="flex items-center gap-3 pt-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-300 text-white font-bold text-sm px-5 py-2.5 rounded-xl transition cursor-pointer"
          >
            <Save className="h-4 w-4" />
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
          {saved && (
            <span className="flex items-center gap-1 text-xs font-bold text-emerald-600">
              <CheckCircle2 className="h-4 w-4" />
              Cambios guardados
            </span>
          )}
        </div>
      </div>

      {/* Bitácora colapsable */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <button
          onClick={() => setShowBitacora(!showBitacora)}
          className="w-full flex items-center justify-between p-4 cursor-pointer"
        >
          <div className="flex items-center gap-2.5">
            <BookOpen className="h-5 w-5 text-indigo-600 shrink-0" />
            <div className="text-left">
              <span className="text-sm font-bold text-slate-800 block">Mi Historial</span>
              <span className="text-[10px] text-slate-500">Historial de solicitudes y reportes</span>
            </div>
          </div>
          {showBitacora ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
        </button>

        {showBitacora && (
          <div className="px-4 pb-4 space-y-3">
            {/* Stats */}
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-slate-50 rounded-xl p-2.5 text-center">
                <p className="text-[9px] text-slate-500 font-semibold uppercase">Solicitudes</p>
                <p className="text-lg font-black text-slate-800">{stats.total}</p>
              </div>
              <div className="bg-slate-50 rounded-xl p-2.5 text-center">
                <p className="text-[9px] text-slate-500 font-semibold uppercase">Horas</p>
                <p className="text-lg font-black text-slate-800">{stats.totalHours}</p>
              </div>
              <div className="bg-slate-50 rounded-xl p-2.5 text-center">
                <p className="text-[9px] text-slate-500 font-semibold uppercase">Invertido</p>
                <p className="text-lg font-black text-indigo-600">${stats.totalSpent.toFixed(0)}</p>
              </div>
            </div>

            <div className="flex gap-2 flex-wrap">
              <div className="bg-indigo-50 border border-indigo-100 rounded-lg px-2.5 py-1 flex items-center gap-1.5">
                <CheckIcon className="h-3 w-3 text-indigo-600" />
                <span className="text-[10px] font-bold text-indigo-700">{stats.completed} completados</span>
              </div>
              <div className="bg-amber-50 border border-amber-100 rounded-lg px-2.5 py-1 flex items-center gap-1.5">
                <FileText className="h-3 w-3 text-amber-600" />
                <span className="text-[10px] font-bold text-amber-700">{stats.reportsCount} reportes</span>
              </div>
            </div>

            {/* Empty state */}
            {myBookings.length === 0 && (
              <div className="text-center py-6">
                <BookOpen className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                <p className="text-xs font-semibold text-slate-600">No hay registros en tu bitácora</p>
                <p className="text-[10px] text-slate-400 mt-1">Cuando hagas solicitudes, aparecerán aquí.</p>
              </div>
            )}

            {/* History list */}
            {myBookings.map((b) => {
              const log = careLogs[b.id];
              const review = nurseReviews.find(r => r.booking_id === b.id);
              const nurse = nurseMap.get(b.nurse_id);
              const nurseProfile = nurse ? profileMap.get(nurse.user_id) : null;

              return (
                <div key={b.id} className={`bg-slate-50/70 border rounded-xl overflow-hidden ${b.status === 'cancelled' ? 'border-slate-200 opacity-75' : 'border-slate-200'}`}>
                  <div className="px-3 py-2 flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-white flex flex-col items-center justify-center border border-slate-200">
                        <span className="text-xs font-black text-slate-700">{new Date(b.date + 'T00:00:00').getDate()}</span>
                        <span className="text-[7px] font-bold text-slate-500 uppercase">{MONTH_NAMES[new Date(b.date + 'T00:00:00').getMonth()]}</span>
                      </div>
                      <div className="min-w-0">
                        <h4 className="font-bold text-slate-800 text-xs truncate">{nurseProfile?.full_name || 'Enfermera'}</h4>
                        <div className="flex items-center gap-1 text-[9px] text-slate-500">
                          <span>{b.start_time}-{b.end_time}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
                      <div className="flex items-center gap-1">
                        {b.status === 'completed' ? <CheckIcon className="h-3 w-3 text-emerald-600" /> : b.status === 'cancelled' ? <XCircle className="h-3 w-3 text-rose-500" /> : <FileText className="h-3 w-3 text-indigo-500" />}
                        <span className="text-[9px] font-bold text-slate-600">{b.status === 'completed' ? 'Completado' : b.status === 'cancelled' ? 'Cancelado' : 'Confirmado'}</span>
                      </div>
                      <span className="text-[10px] font-black text-indigo-600">${b.total_price.toFixed(0)}</span>
                    </div>
                  </div>

                  <div className="px-3 py-1.5 bg-white/50 border-t border-slate-100 text-[10px]">
                    <div className="flex items-center gap-1 text-slate-600">
                      <User className="h-2.5 w-2.5 text-indigo-400" />
                      <span className="font-bold">{b.patient_name}</span>
                      <span className="text-slate-300">·</span>
                      <span className="text-slate-500 truncate">{b.patient_condition}</span>
                    </div>
                  </div>

                  {b.status === 'completed' && log && (
                    <div className="px-3 py-2 border-t border-slate-100">
                      <div className="flex items-center gap-1 mb-1">
                        <FileText className="h-3 w-3 text-amber-600" />
                        <span className="text-[9px] font-bold text-slate-600 uppercase">Reporte</span>
                      </div>
                      <p className="text-[10px] text-slate-600 leading-relaxed line-clamp-3">{log.narrativeReport || `La enfermera llegó a las ${log.arrivalTime} y encontró a ${b.patient_name} en estado ${log.patientConditionOnArrival.toLowerCase()}.`}</p>
                    </div>
                  )}

                  {(b.status === 'completed' || b.status === 'confirmed') && (
                    <div className="px-3 py-1.5 border-t border-slate-100 flex items-center justify-between text-[9px]">
                      <div className="flex items-center gap-1">
                        <DollarSign className="h-3 w-3 text-slate-400" />
                        <span className={`font-bold ${b.payment_status === 'paid' ? 'text-emerald-600' : 'text-slate-500'}`}>
                          {b.wants_invoice ? (b.payment_status === 'paid' ? 'Pagado' : 'Pendiente') : 'Pago directo'}
                        </span>
                      </div>
                      {review && (
                        <div className="flex items-center gap-0.5">
                          <Star className="h-2.5 w-2.5 text-amber-400 fill-amber-400" />
                          <span className="font-bold text-amber-700">{review.rating.toFixed(1)}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
