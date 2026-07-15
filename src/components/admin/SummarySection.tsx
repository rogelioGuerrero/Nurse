import { type FC } from 'react';
import { TrendingUp, Clock, DollarSign, ShieldCheck, Users, MessageCircle, RefreshCw, CheckCircle2 } from 'lucide-react';
import type { Booking, CareRequest, CareOffer, Nurse, Profile } from '../../types';

interface Props {
  dailySummary: string;
  summaryLoading: boolean;
  summaryDate: string;
  generateSummary: () => void;
  todayBookings: Booking[];
  completedToday: Booking[];
  pendingPayments: Booking[];
  pendingCSSP: Nurse[];
  newNurses: Nurse[];
  newProfiles: Profile[];
  requestsWithOffers: CareRequest[];
  acceptedOffers: CareOffer[];
  setSection: (s: 'summary' | 'notifications' | 'cssp' | 'packages' | 'nurses' | 'chat' | 'support' | 'benni') => void;
}

export const SummarySection: FC<Props> = ({
  dailySummary, summaryLoading, summaryDate, generateSummary,
  todayBookings, completedToday, pendingPayments, pendingCSSP,
  newNurses, newProfiles, requestsWithOffers, acceptedOffers, setSection
}) => (
  <div className="space-y-4">
    <div className="bg-gradient-to-r from-indigo-900 to-indigo-950 rounded-2xl p-5 text-white shadow-md">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-indigo-300" />
          <div>
            <h3 className="text-sm font-bold">Resumen del día</h3>
            {summaryDate && <p className="text-[10px] text-indigo-300 capitalize">{summaryDate}</p>}
          </div>
        </div>
        <button
          onClick={generateSummary}
          disabled={summaryLoading}
          className="text-[10px] font-bold text-indigo-200 hover:text-white flex items-center gap-1 cursor-pointer disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${summaryLoading ? 'animate-spin' : ''}`} />
          Actualizar
        </button>
      </div>
      {summaryLoading ? (
        <div className="flex items-center gap-2.5 text-xs text-indigo-200 font-medium py-2">
          <div className="w-4 h-4 border-2 border-indigo-300 border-t-transparent rounded-full animate-spin"></div>
          <span>Generando resumen...</span>
        </div>
      ) : (
        <p className="text-xs text-slate-100 leading-relaxed">{dailySummary}</p>
      )}
    </div>

    <div className="grid grid-cols-2 gap-3">
      <div className="bg-white border border-slate-200 rounded-xl p-3">
        <div className="flex items-center gap-1.5 mb-1">
          <Clock className="h-3.5 w-3.5 text-indigo-500" />
          <span className="text-[10px] font-bold text-slate-500 uppercase">Servicios hoy</span>
        </div>
        <p className="text-xl font-bold text-slate-800">{todayBookings.length}</p>
        <p className="text-[10px] text-slate-400">{completedToday.length} completados</p>
      </div>
      <div className="bg-white border border-slate-200 rounded-xl p-3">
        <div className="flex items-center gap-1.5 mb-1">
          <DollarSign className="h-3.5 w-3.5 text-amber-500" />
          <span className="text-[10px] font-bold text-slate-500 uppercase">Pagos pendientes</span>
        </div>
        <p className="text-xl font-bold text-slate-800">{pendingPayments.length}</p>
        <p className="text-[10px] text-slate-400">por validar</p>
      </div>
      <div className="bg-white border border-slate-200 rounded-xl p-3">
        <div className="flex items-center gap-1.5 mb-1">
          <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
          <span className="text-[10px] font-bold text-slate-500 uppercase">CSSP</span>
        </div>
        <p className="text-xl font-bold text-slate-800">{pendingCSSP.length}</p>
        <p className="text-[10px] text-slate-400">por verificar</p>
      </div>
      <div className="bg-white border border-slate-200 rounded-xl p-3">
        <div className="flex items-center gap-1.5 mb-1">
          <Users className="h-3.5 w-3.5 text-indigo-500" />
          <span className="text-[10px] font-bold text-slate-500 uppercase">Nuevos hoy</span>
        </div>
        <p className="text-xl font-bold text-slate-800">{newNurses.length + newProfiles.length}</p>
        <p className="text-[10px] text-slate-400">{newNurses.length} sin verificar, {newProfiles.length} familias</p>
      </div>
    </div>

    {(pendingPayments.length > 0 || pendingCSSP.length > 0 || requestsWithOffers.length > 0 || acceptedOffers.length > 0) && (
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="px-4 py-3 bg-amber-50 border-b border-amber-100">
          <h3 className="text-xs font-bold text-amber-800 uppercase tracking-wide">Requiere atención</h3>
        </div>
        <div className="divide-y divide-slate-100">
          {pendingPayments.length > 0 && (
            <button onClick={() => setSection('notifications')} className="w-full px-4 py-3 flex items-center justify-between text-left cursor-pointer hover:bg-slate-50">
              <div>
                <p className="text-xs font-bold text-slate-700">{pendingPayments.length} pago(s) por validar</p>
                <p className="text-[10px] text-slate-400">Servicios con factura pendientes</p>
              </div>
              <DollarSign className="h-4 w-4 text-amber-500" />
            </button>
          )}
          {pendingCSSP.length > 0 && (
            <button onClick={() => setSection('cssp')} className="w-full px-4 py-3 flex items-center justify-between text-left cursor-pointer hover:bg-slate-50">
              <div>
                <p className="text-xs font-bold text-slate-700">{pendingCSSP.length} enfermera(s) por verificar CSSP</p>
                <p className="text-[10px] text-slate-400">Revisión pendiente</p>
              </div>
              <ShieldCheck className="h-4 w-4 text-emerald-500" />
            </button>
          )}
          {requestsWithOffers.length > 0 && (
            <button onClick={() => setSection('notifications')} className="w-full px-4 py-3 flex items-center justify-between text-left cursor-pointer hover:bg-slate-50">
              <div>
                <p className="text-xs font-bold text-slate-700">{requestsWithOffers.length} familia(s) por notificar</p>
                <p className="text-[10px] text-slate-400">Tienen ofertas pendientes</p>
              </div>
              <MessageCircle className="h-4 w-4 text-indigo-500" />
            </button>
          )}
          {acceptedOffers.length > 0 && (
            <button onClick={() => setSection('notifications')} className="w-full px-4 py-3 flex items-center justify-between text-left cursor-pointer hover:bg-slate-50">
              <div>
                <p className="text-xs font-bold text-slate-700">{acceptedOffers.length} enfermera(s) por avisar</p>
                <p className="text-[10px] text-slate-400">Ofertas aceptadas, notificar</p>
              </div>
              <MessageCircle className="h-4 w-4 text-emerald-500" />
            </button>
          )}
        </div>
      </div>
    )}
  </div>
);
