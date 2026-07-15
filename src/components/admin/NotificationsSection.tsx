import { type FC } from 'react';
import { Users, FileText, DollarSign, CheckCircle2, Clock, MapPin, Phone, MessageCircle, Loader2 } from 'lucide-react';
import type { Booking, CareRequest, CareOffer, Nurse, Profile } from '../../types';

interface Props {
  requestsWithOffers: CareRequest[];
  acceptedOffers: CareOffer[];
  profileMap: Map<string, Profile>;
  nurseMap: Map<string, Nurse>;
  careOffers: CareOffer[];
  careRequests: CareRequest[];
  bookings: Booking[];
  waLoading: string | null;
  handleFamilyWa: (reqId: string, familyName: string, patientName: string, offerCount: number, location: string, phone?: string) => void;
  handleNurseWa: (offerId: string, nurseName: string, patientName: string, offeredRate: number, phone?: string) => void;
  confirmPayment: (id: string) => void;
}

export const NotificationsSection: FC<Props> = ({
  requestsWithOffers, acceptedOffers, profileMap, nurseMap,
  careOffers, careRequests, bookings, waLoading,
  handleFamilyWa, handleNurseWa, confirmPayment
}) => {
  const pendingPaymentBookings = bookings.filter(b => b.wants_invoice && (b.status === 'confirmed' || b.status === 'pending_payment') && b.payment_status !== 'paid');
  const completedInvoiced = bookings.filter(b => b.wants_invoice && b.status === 'completed');

  return (
    <div className="space-y-4">
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="px-4 py-3 bg-indigo-50 border-b border-indigo-100">
          <h3 className="text-xs font-bold text-indigo-800 uppercase tracking-wide flex items-center gap-1.5">
            <Users className="h-4 w-4" />
            Familias con nuevas ofertas ({requestsWithOffers.length})
          </h3>
          <p className="text-[10px] text-slate-500 mt-0.5">Avisa a las familias que hay enfermeras interesadas en su solicitud.</p>
        </div>
        {requestsWithOffers.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-400">No hay familias pendientes de notificar.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {requestsWithOffers.map(req => {
              const family = profileMap.get(req.user_id);
              const offers = careOffers.filter(o => o.request_id === req.id && o.status === 'pending');
              return (
                <div key={req.id} className="px-4 py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-slate-700">{family?.full_name || 'Familia'}</p>
                    <p className="text-[10px] text-slate-500 truncate">
                      {req.patient_name} · {offers.length} oferta(s) · {req.location_name}
                    </p>
                    <p className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5">
                      <Phone className="h-2.5 w-2.5" />{family?.phone || 'Sin teléfono'}
                    </p>
                  </div>
                  {family?.phone ? (
                    <button
                      onClick={() => handleFamilyWa(req.id, family?.full_name || '', req.patient_name, offers.length, req.location_name || '', family?.phone)}
                      disabled={waLoading === req.id}
                      className="shrink-0 flex items-center gap-1 text-[10px] font-bold text-white bg-emerald-600 hover:bg-emerald-500 px-3 py-2 rounded-lg cursor-pointer disabled:opacity-60"
                    >
                      {waLoading === req.id ? (
                        <><Loader2 className="h-3.5 w-3.5 animate-spin" />Redactando...</>
                      ) : (
                        <><MessageCircle className="h-3.5 w-3.5" />Avisar</>
                      )}
                    </button>
                  ) : (
                    <span className="shrink-0 text-[10px] text-slate-400 italic">Sin teléfono</span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="px-4 py-3 bg-emerald-50 border-b border-emerald-100">
          <h3 className="text-xs font-bold text-emerald-800 uppercase tracking-wide flex items-center gap-1.5">
            <FileText className="h-4 w-4" />
            Enfermeras con ofertas aceptadas ({acceptedOffers.length})
          </h3>
          <p className="text-[10px] text-slate-500 mt-0.5">Avisa a las enfermeras que su oferta fue aceptada.</p>
        </div>
        {acceptedOffers.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-400">No hay enfermeras pendientes de notificar.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {acceptedOffers.map(offer => {
              const nurse = nurseMap.get(offer.nurse_id);
              const nurseProfile = nurse ? profileMap.get(nurse.user_id) : null;
              const req = careRequests.find(r => r.id === offer.request_id);
              return (
                <div key={offer.id} className="px-4 py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-slate-700">{nurseProfile?.full_name || 'Enfermera'}</p>
                    <p className="text-[10px] text-slate-500 truncate">
                      {req?.patient_name || 'Paciente'} · ${offer.offered_rate}/turno
                    </p>
                    <p className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5">
                      <Phone className="h-2.5 w-2.5" />{nurseProfile?.phone || 'Sin teléfono'}
                    </p>
                  </div>
                  {nurseProfile?.phone ? (
                    <button
                      onClick={() => handleNurseWa(offer.id, nurseProfile?.full_name || '', req?.patient_name || 'el paciente', offer.offered_rate, nurseProfile?.phone)}
                      disabled={waLoading === offer.id}
                      className="shrink-0 flex items-center gap-1 text-[10px] font-bold text-white bg-emerald-600 hover:bg-emerald-500 px-3 py-2 rounded-lg cursor-pointer disabled:opacity-60"
                    >
                      {waLoading === offer.id ? (
                        <><Loader2 className="h-3.5 w-3.5 animate-spin" />Redactando...</>
                      ) : (
                        <><MessageCircle className="h-3.5 w-3.5" />Avisar</>
                      )}
                    </button>
                  ) : (
                    <span className="shrink-0 text-[10px] text-slate-400 italic">Sin teléfono</span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {pendingPaymentBookings.length > 0 && (
        <div className="bg-white border border-amber-200 rounded-2xl overflow-hidden">
          <div className="px-4 py-3 bg-amber-50 border-b border-amber-100">
            <h3 className="text-xs font-bold text-amber-800 uppercase tracking-wide flex items-center gap-1.5">
              <DollarSign className="h-4 w-4" />
              Transferencias por validar ({pendingPaymentBookings.length})
            </h3>
            <p className="text-[10px] text-slate-500 mt-0.5">Servicios con factura. Confirma que la familia transfirió a la cuenta de BienCuidar.</p>
          </div>
          <div className="divide-y divide-slate-100">
            {pendingPaymentBookings.map(b => {
              const family = profileMap.get(b.user_id);
              const nurse = nurseMap.get(b.nurse_id);
              const nurseProfile = nurse ? profileMap.get(nurse.user_id) : null;
              const isrRetention = (b.total_price || 0) * 0.10;
              const managementFee = 5.65;
              const totalToTransfer = (b.total_price || 0) + managementFee;
              return (
                <div key={b.id} className="px-4 py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-slate-700">{b.patient_name}</p>
                    <p className="text-[10px] text-slate-500">
                      Familia: {family?.full_name || 'N/A'} · Enfermera: {nurseProfile?.full_name || 'N/A'}
                    </p>
                    <div className="text-[10px] text-slate-500 mt-1 space-y-0.5">
                      <div className="flex gap-2"><span>Total a transferir:</span><span className="font-bold text-amber-700">${totalToTransfer.toFixed(2)}</span></div>
                      <div className="flex gap-2"><span>Enfermera recibe:</span><span className="font-bold text-emerald-600">${((b.total_price || 0) - isrRetention).toFixed(2)}</span></div>
                    </div>
                  </div>
                  <button
                    onClick={() => confirmPayment(b.id)}
                    className="shrink-0 flex items-center gap-1 text-[10px] font-bold text-white bg-emerald-600 hover:bg-emerald-500 px-3 py-2 rounded-lg cursor-pointer"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Confirmar
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="px-4 py-3 bg-indigo-50 border-b border-indigo-100">
          <h3 className="text-xs font-bold text-indigo-800 uppercase tracking-wide flex items-center gap-1.5">
            <FileText className="h-4 w-4" />
            Facturas familiares ({completedInvoiced.length})
          </h3>
          <p className="text-[10px] text-slate-500 mt-0.5">BienCuidar retiene ISR 10%, emite Factura a la familia y FSEE a la enfermera. Comisión: US$ 5.65 (gestión + IVA).</p>
        </div>
        {completedInvoiced.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-400">Sin servicios con factura.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {completedInvoiced.map(b => {
              const family = profileMap.get(b.user_id);
              const nurse = nurseMap.get(b.nurse_id);
              const nurseProfile = nurse ? profileMap.get(nurse.user_id) : null;
              const serviceAmount = b.total_price || 0;
              const managementFee = 5.65;
              return (
                <div key={b.id} className="px-4 py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-slate-700">{b.patient_name}</p>
                    <p className="text-[10px] text-slate-500">
                      Familia: {family?.full_name || 'N/A'} · Enfermera: {nurseProfile?.full_name || 'N/A'}
                    </p>
                    <p className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5">
                      <Phone className="h-2.5 w-2.5" />{family?.phone || 'Sin teléfono'}
                    </p>
                    <div className="text-[10px] text-slate-500 mt-1 space-y-0.5">
                      <div className="flex gap-2"><span>Servicio:</span><span className="font-bold">${serviceAmount.toFixed(2)}</span></div>
                      <div className="flex gap-2"><span>Gestión + IVA:</span><span className="font-bold">${managementFee.toFixed(2)}</span></div>
                    </div>
                  </div>
                  <button
                    className="shrink-0 flex items-center gap-1 text-[10px] font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-3 py-2 rounded-lg cursor-pointer"
                  >
                    <FileText className="h-3.5 w-3.5" />
                    Emitir factura
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="px-4 py-3 bg-slate-50 border-b border-slate-100">
          <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wide flex items-center gap-1.5">
            <Clock className="h-4 w-4" />
            Servicios recientes ({bookings.length})
          </h3>
        </div>
        <div className="divide-y divide-slate-100 max-h-64 overflow-y-auto">
          {bookings.slice(0, 10).map(b => {
            const family = profileMap.get(b.user_id);
            const nurse = nurseMap.get(b.nurse_id);
            const nurseProfile = nurse ? profileMap.get(nurse.user_id) : null;
            return (
              <div key={b.id} className="px-4 py-2.5 text-[10px]">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-700">{b.patient_name}</span>
                  <div className="flex items-center gap-1">
                    {b.payment_status === 'paid' && (
                      <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-emerald-100 text-emerald-700">Pagado</span>
                    )}
                    <span className={`px-2 py-0.5 rounded-full font-bold ${
                      b.status === 'completed' ? 'bg-emerald-100 text-emerald-700' :
                      b.status === 'confirmed' ? 'bg-indigo-100 text-indigo-700' :
                      b.status === 'cancelled' ? 'bg-rose-100 text-rose-700' :
                      'bg-amber-100 text-amber-700'
                    }`}>{b.status}</span>
                  </div>
                </div>
                <p className="text-slate-500 mt-0.5">
                  Enfermera: {nurseProfile?.full_name || 'Por asignar'} · Familia: {family?.full_name || b.patient_name || 'N/A'}
                </p>
                {b.check_in_at && (
                  <p className="text-emerald-600 mt-0.5 flex items-center gap-1">
                    <MapPin className="h-2.5 w-2.5" />Check-in: {new Date(b.check_in_at).toLocaleString('es-SV')}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
