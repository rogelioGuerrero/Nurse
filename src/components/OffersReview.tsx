import { useMemo, useState, type FC } from 'react';
import { useApp } from '../context/AppContext';
import { calculateNurseNet } from '../data/standardRates';
import { SHIFTS, type ShiftType } from '../types';
import { CheckCircle2, XCircle, Star, MapPin, User, Calendar, Clock as ClockIcon, Dumbbell, Users, Heart, MessageCircle, X, BadgeCheck, GraduationCap, Briefcase, ShieldAlert, FileText } from 'lucide-react';
import { CSSPVerificationBadge } from './CSSPVerificationBadge';
import { LegalDisclaimer } from './LegalDisclaimer';

const DAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const MONTH_NAMES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return `${DAY_NAMES[d.getDay()]}, ${d.getDate()} ${MONTH_NAMES[d.getMonth()]}`;
}

export const OffersReview: FC = () => {
  const { careRequests, careOffers, nurses, profiles, currentUser, acceptCareOffer } = useApp();

  const [selectedNurseId, setSelectedNurseId] = useState<string | null>(null);
  const [confirmingOfferId, setConfirmingOfferId] = useState<string | null>(null);
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  const profileMap = useMemo(() => new Map(profiles.map(p => [p.id, p])), [profiles]);

  // Get pending offers for this user's requests
  const pendingOffers = useMemo(() => {
    if (!currentUser) return [];
    const myRequestIds = careRequests
      .filter(r => r.user_id === currentUser.id && r.status === 'open')
      .map(r => r.id);
    
    return careOffers.filter(o => 
      myRequestIds.includes(o.request_id) && o.status === 'pending'
    );
  }, [careRequests, careOffers, currentUser]);

  if (pendingOffers.length === 0) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center px-5">
        <div className="text-center space-y-3">
          <ClockIcon className="h-10 w-10 text-slate-300 mx-auto" />
          <p className="font-semibold text-slate-600">No tienes ofertas pendientes.</p>
          <p className="text-xs text-slate-400">Las enfermeras aparecerán aquí cuando envíen sus ofertas.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-800">Ofertas Recibidas</h1>
        <span className="bg-indigo-100 text-indigo-700 text-xs font-bold px-2.5 py-1 rounded-full">
          {pendingOffers.length}
        </span>
      </div>

      {pendingOffers.map(offer => {
        const request = careRequests.find(r => r.id === offer.request_id);
        if (!request) return null;

        const nurse = nurses.find(n => n.id === offer.nurse_id);
        const nurseProfile = nurse ? profileMap.get(nurse.user_id) : null;
        const slot = request.slots[offer.slot_index];
        const shiftInfo = SHIFTS[slot.shift as ShiftType] || SHIFTS.morning;
        const hours = 8;
        const totalNet = calculateNurseNet(offer.offered_rate, true);

        return (
          <div key={offer.id} className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3 shadow-sm">
            {/* Header: nurse info */}
            <div className="flex items-start gap-3">
              <button
                onClick={() => setSelectedNurseId(offer.nurse_id)}
                className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden bg-indigo-100 cursor-pointer hover:ring-2 hover:ring-indigo-400 transition"
              >
                {nurseProfile?.avatar_url ? (
                  <img src={nurseProfile.avatar_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <User className="h-6 w-6 text-indigo-600" />
                )}
              </button>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setSelectedNurseId(offer.nurse_id)}
                    className="font-bold text-slate-800 truncate hover:text-indigo-600 transition cursor-pointer"
                  >
                    {nurseProfile?.full_name || 'Enfermera'}
                  </button>
                  <div className="flex items-center gap-0.5 text-amber-500">
                    <Star className="h-3.5 w-3.5 fill-current" />
                    <span className="text-xs font-bold">{nurse?.rating || 4.5}</span>
                  </div>
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <div className="text-lg font-bold text-slate-800">
                  US$ {offer.offered_rate}
                </div>
                <div className="text-[10px] text-slate-400">por turno</div>
              </div>
            </div>

            {/* Specializations */}
            <div className="flex flex-wrap gap-1">
              {nurse?.specialization.slice(0, 3).map(spec => (
                <span key={spec} className="bg-slate-100 text-slate-600 text-[10px] font-semibold px-2 py-0.5 rounded-full">
                  {spec}
                </span>
              ))}
              {nurse?.specialization.length > 3 && (
                <span className="bg-slate-100 text-slate-600 text-[10px] font-semibold px-2 py-0.5 rounded-full">
                  +{nurse.specialization.length - 3}
                </span>
              )}
            </div>

            {/* Schedule */}
            <div className="flex items-center gap-2 text-xs text-slate-600">
              <Calendar className="h-3.5 w-3.5" />
              <span className="font-medium">{formatDate(slot.date)}</span>
              <span className="text-slate-400">•</span>
              <ClockIcon className="h-3.5 w-3.5" />
              <span className="font-medium">{shiftInfo.label}</span>
              <span className="text-slate-400">({shiftInfo.start}-{shiftInfo.end})</span>
            </div>

            {/* Invoice preference badge */}
            <div className="flex items-center gap-1.5">
              {request.wants_invoice ? (
                <span className="inline-flex items-center gap-1 bg-indigo-50 text-indigo-700 text-[10px] font-bold px-2 py-1 rounded-full border border-indigo-100">
                  <FileText className="h-3 w-3" />
                  Con factura
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 text-[10px] font-bold px-2 py-1 rounded-full border border-emerald-100">
                  Pago directo sin factura
                </span>
              )}
            </div>

            {/* Message from nurse */}
            {offer.message && (
              <div className="bg-slate-50 rounded-xl p-3">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-500 mb-1">
                  <MessageCircle className="h-3 w-3" />
                  <span>Mensaje</span>
                </div>
                <p className="text-xs text-slate-700 leading-relaxed">{offer.message}</p>
              </div>
            )}

            {/* Patient condition */}
            {request.patient_condition && (
              <div className="bg-amber-50 rounded-xl p-3">
                <div className="flex items-center gap-1.5 text-xs font-bold text-amber-700 mb-1">
                  <Heart className="h-3 w-3" />
                  <span>Condición del paciente</span>
                </div>
                <p className="text-xs text-amber-800 leading-relaxed">{request.patient_condition}</p>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => {
                  setConfirmingOfferId(offer.id);
                  setAgreedToTerms(false);
                }}
                className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs py-2.5 rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <CheckCircle2 className="h-4 w-4" />
                Aceptar Oferta
              </button>
              <button
                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-xs py-2.5 rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <XCircle className="h-4 w-4" />
                Rechazar
              </button>
            </div>
          </div>
        );
      })}

      {/* Modal de Confirmación con Deslinde de Responsabilidad */}
      {confirmingOfferId && (() => {
        const offer = careOffers.find(o => o.id === confirmingOfferId);
        const request = offer ? careRequests.find(r => r.id === offer.request_id) : null;
        const nurse = offer ? nurses.find(n => n.id === offer.nurse_id) : null;
        const nurseProfile = nurse ? profileMap.get(nurse.user_id) : null;

        if (!offer || !request || !nurse) return null;

        const handleConfirm = () => {
          if (!agreedToTerms) return;
          acceptCareOffer(confirmingOfferId);
          setConfirmingOfferId(null);
        };

        return (
          <div
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={e => { if (e.target === e.currentTarget) setConfirmingOfferId(null); }}
          >
            <div className="bg-white rounded-3xl max-w-md w-full overflow-hidden shadow-2xl p-6 space-y-4">
              <div className="flex items-center gap-2.5 text-indigo-600">
                <ShieldAlert className="h-6 w-6" />
                <h3 className="font-bold text-lg text-slate-900">Confirmar Contratación</h3>
              </div>

              <div className="text-sm text-slate-600 space-y-2">
                <p>
                  Estás a punto de confirmar el servicio con la enfermera <strong>{nurseProfile?.full_name}</strong> para el cuidado de <strong>{request.patient_name}</strong>.
                </p>
                <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 text-xs space-y-1">
                  <div className="flex justify-between">
                    <span>Tarifa ofrecida por turno:</span>
                    <span className="font-bold text-slate-800">US$ {offer.offered_rate}</span>
                  </div>
                  <div className="flex justify-between text-slate-500">
                    <span>Intermediación BienCuidar:</span>
                    <span>Gratis (fase arranque)</span>
                  </div>
                </div>
              </div>

              {/* Disclaimers */}
              <div className="space-y-3 pt-2">
                <LegalDisclaimer variant="checkout-confirm" />
                <LegalDisclaimer variant="direct-payment" />
              </div>

              {/* Invoice info based on request preference */}
              <div className={`rounded-xl p-3 flex items-start gap-2.5 ${request.wants_invoice ? 'bg-indigo-50 border border-indigo-100' : 'bg-emerald-50 border border-emerald-100'}`}>
                <FileText className={`h-4 w-4 shrink-0 mt-0.5 ${request.wants_invoice ? 'text-indigo-600' : 'text-emerald-600'}`} />
                <div className="space-y-1">
                  <p className={`text-xs font-bold ${request.wants_invoice ? 'text-indigo-800' : 'text-emerald-800'}`}>
                    {request.wants_invoice ? 'Con factura electrónica' : 'Pago directo sin factura'}
                  </p>
                  <p className={`text-[10px] leading-relaxed ${request.wants_invoice ? 'text-indigo-600' : 'text-emerald-600'}`}>
                    {request.wants_invoice
                      ? 'Factura de Consumidor Final emitida a tu nombre. Pago por transferencia a cuenta de BienCuidar. Tarifa de gestión US$ 5 más IVA.'
                      : 'Paga directamente a la enfermera (efectivo, transferencia o como acuerden). Sin comprobante fiscal ni costos administrativos.'}
                  </p>
                </div>
              </div>

              {/* Checkbox de aceptación */}
              <label className="flex items-start gap-2.5 cursor-pointer pt-2 select-none">
                <input
                  type="checkbox"
                  checked={agreedToTerms}
                  onChange={e => setAgreedToTerms(e.target.checked)}
                  className="mt-1 accent-indigo-600 h-4 w-4 shrink-0 rounded cursor-pointer"
                />
                <span className="text-xs text-slate-700 leading-normal font-medium">
                  He leído, comprendido y acepto los términos de intermediación independiente y deslinde de responsabilidad detallados arriba.
                </span>
              </label>

              {/* Botones de acción */}
              <div className="flex gap-3 pt-2">
                <button
                  onClick={handleConfirm}
                  disabled={!agreedToTerms}
                  className={`flex-1 font-bold text-sm py-3 rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer ${
                    agreedToTerms 
                      ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-md' 
                      : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                  }`}
                >
                  <CheckCircle2 className="h-4 w-4" />
                  Confirmar Cuidado
                </button>
                <button
                  onClick={() => setConfirmingOfferId(null)}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-4 py-3 rounded-xl text-sm transition cursor-pointer"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Modal: Perfil de la enfermera */}
      {selectedNurseId && (() => {
        const nurse = nurses.find(n => n.id === selectedNurseId);
        const nurseProfile = nurse ? profileMap.get(nurse.user_id) : null;
        if (!nurse || !nurseProfile) return null;
        return (
          <div
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
            onClick={e => { if (e.target === e.currentTarget) setSelectedNurseId(null); }}
          >
            <div className="bg-white rounded-t-3xl sm:rounded-3xl max-w-md w-full max-h-[90vh] overflow-y-auto shadow-2xl">
              {/* Header con foto y nombre */}
              <div className="relative bg-gradient-to-br from-indigo-600 to-indigo-800 p-6 text-white rounded-t-3xl">
                <button
                  onClick={() => setSelectedNurseId(null)}
                  className="absolute top-4 right-4 w-8 h-8 bg-white/20 hover:bg-white/30 rounded-full flex items-center justify-center cursor-pointer transition"
                >
                  <X className="h-4 w-4" />
                </button>
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-full overflow-hidden bg-white/20 flex items-center justify-center flex-shrink-0">
                    {nurseProfile.avatar_url ? (
                      <img src={nurseProfile.avatar_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <User className="h-8 w-8" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-lg font-bold truncate">{nurseProfile.full_name}</h2>
                    <div className="flex items-center gap-2 mt-1">
                      <div className="flex items-center gap-0.5">
                        <Star className="h-3.5 w-3.5 fill-amber-300 text-amber-300" />
                        <span className="text-sm font-bold">{nurse.rating}</span>
                      </div>
                      <span className="text-white/60">•</span>
                      <span className="text-xs font-medium">{nurse.cssp_level}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-5 space-y-4">
                {/* Especialidades */}
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Especialidades</h3>
                  <div className="flex flex-wrap gap-1.5">
                    {nurse.specialization.map(spec => (
                      <span key={spec} className="bg-indigo-50 text-indigo-700 text-xs font-semibold px-2.5 py-1 rounded-full">
                        {spec}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Sobre Ana */}
                {nurse.bio && (
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Sobre ella</h3>
                    <p className="text-sm text-slate-700 leading-relaxed">{nurse.bio}</p>
                  </div>
                )}

                {/* Experiencia */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-slate-50 rounded-xl p-3">
                    <div className="flex items-center gap-1.5 text-slate-500 mb-1">
                      <Briefcase className="h-3.5 w-3.5" />
                      <span className="text-[10px] font-bold uppercase">Experiencia</span>
                    </div>
                    <p className="text-sm font-bold text-slate-800">{nurse.experience_years} años</p>
                  </div>
                  <div className="bg-slate-50 rounded-xl p-3">
                    <div className="flex items-center gap-1.5 text-slate-500 mb-1">
                      <GraduationCap className="h-3.5 w-3.5" />
                      <span className="text-[10px] font-bold uppercase">Nivel CSSP</span>
                    </div>
                    <p className="text-sm font-bold text-slate-800">{nurse.cssp_level}</p>
                  </div>
                </div>

                {/* CSSP */}
                <CSSPVerificationBadge nurse={nurse} variant="full" />

                {/* Certificaciones */}
                {nurse.certifications.length > 0 && (
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Certificaciones</h3>
                    <ul className="space-y-1">
                      {nurse.certifications.map((cert, i) => (
                        <li key={i} className="text-sm text-slate-700 flex items-center gap-2">
                          <BadgeCheck className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0" />
                          {cert}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Tarifa */}
                <div className="bg-indigo-50 rounded-xl p-3 flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-600">Tarifa por turno</span>
                  <span className="text-lg font-bold text-indigo-700">US$ {nurse.shift_rate}</span>
                </div>

                {/* Cerrar */}
                <button
                  onClick={() => setSelectedNurseId(null)}
                  className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 rounded-xl text-sm transition cursor-pointer"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};
