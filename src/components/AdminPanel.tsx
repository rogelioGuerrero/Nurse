import { useState, useMemo, type FC } from 'react';
import { useApp } from '../context/AppContext';
import { MessageCircle, ShieldCheck, Users, FileText, Clock, MapPin, Phone, DollarSign, CheckCircle2 } from 'lucide-react';

export const AdminPanel: FC = () => {
  const { currentUser, careRequests, careOffers, profiles, nurses, bookings, confirmPayment } = useApp();
  const [section, setSection] = useState<'notifications' | 'cssp'>('notifications');

  if (!currentUser || currentUser.role !== 'admin') {
    return (
      <div className="text-center py-12 bg-white rounded-2xl border border-slate-200">
        <p className="text-sm text-slate-500">Acceso restringido a administradores.</p>
      </div>
    );
  }

  const profileMap = useMemo(() => new Map(profiles.map(p => [p.id, p])), [profiles]);
  const nurseMap = useMemo(() => new Map(nurses.map(n => [n.id, n])), [nurses]);

  const waLink = (phone: string | undefined, message: string) => {
    const cleanPhone = (phone || '').replace(/[^0-9]/g, '');
    if (!cleanPhone) return null;
    const fullPhone = cleanPhone.startsWith('503') ? cleanPhone : `503${cleanPhone}`;
    return `https://wa.me/${fullPhone}?text=${encodeURIComponent(message)}`;
  };

  // Requests with pending offers that family hasn't been notified about
  const requestsWithOffers = careRequests.filter(r =>
    careOffers.some(o => o.request_id === r.id && o.status === 'pending')
  );

  // Accepted offers where nurse needs to be notified
  const acceptedOffers = careOffers.filter(o => o.status === 'accepted');

  return (
    <div className="space-y-4">
      {/* Section tabs */}
      <div className="flex gap-2 bg-white border border-slate-200 rounded-xl p-1.5">
        <button
          onClick={() => setSection('notifications')}
          className={`flex-1 px-3 py-2 rounded-lg text-xs font-bold transition cursor-pointer ${
            section === 'notifications' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <MessageCircle className="h-3.5 w-3.5 inline mr-1" />
          Notificaciones WhatsApp
        </button>
        <button
          onClick={() => setSection('cssp')}
          className={`flex-1 px-3 py-2 rounded-lg text-xs font-bold transition cursor-pointer ${
            section === 'cssp' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <ShieldCheck className="h-3.5 w-3.5 inline mr-1" />
          Revisión CSSP
        </button>
      </div>

      {section === 'notifications' && (
        <div className="space-y-4">
          {/* Families to notify about new offers */}
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
                  const wa = waLink(
                    family?.phone,
                    `Hola ${family?.full_name || ''}, tienes ${offers.length} oferta(s) de cuidado para ${req.patient_name} en BienCuidar. Entra a la app para revisarlas: https://biencuidar.app`
                  );
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
                      {wa ? (
                        <a
                          href={wa}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="shrink-0 flex items-center gap-1 text-[10px] font-bold text-white bg-emerald-600 hover:bg-emerald-500 px-3 py-2 rounded-lg cursor-pointer"
                        >
                          <MessageCircle className="h-3.5 w-3.5" />
                          Avisar
                        </a>
                      ) : (
                        <span className="shrink-0 text-[10px] text-slate-400 italic">Sin teléfono</span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Nurses to notify about accepted offers */}
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
                  const wa = waLink(
                    nurseProfile?.phone,
                    `Hola ${nurseProfile?.full_name || ''}, tu oferta para cuidar a ${req?.patient_name || 'el paciente'} fue aceptada en BienCuidar. Entra a la app para ver los detalles: https://biencuidar.app`
                  );
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
                      {wa ? (
                        <a
                          href={wa}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="shrink-0 flex items-center gap-1 text-[10px] font-bold text-white bg-emerald-600 hover:bg-emerald-500 px-3 py-2 rounded-lg cursor-pointer"
                        >
                          <MessageCircle className="h-3.5 w-3.5" />
                          Avisar
                        </a>
                      ) : (
                        <span className="shrink-0 text-[10px] text-slate-400 italic">Sin teléfono</span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Transfers to validate — only for invoiced bookings */}
          {bookings.filter(b => b.wants_invoice && b.status === 'confirmed' && b.payment_status !== 'paid').length > 0 && (
            <div className="bg-white border border-amber-200 rounded-2xl overflow-hidden">
              <div className="px-4 py-3 bg-amber-50 border-b border-amber-100">
                <h3 className="text-xs font-bold text-amber-800 uppercase tracking-wide flex items-center gap-1.5">
                  <DollarSign className="h-4 w-4" />
                  Transferencias por validar ({bookings.filter(b => b.wants_invoice && b.status === 'confirmed' && b.payment_status !== 'paid').length})
                </h3>
                <p className="text-[10px] text-slate-500 mt-0.5">Servicios con factura. Confirma que la familia transfirió a la cuenta de BienCuidar.</p>
              </div>
              <div className="divide-y divide-slate-100">
                {bookings.filter(b => b.wants_invoice && b.status === 'confirmed' && b.payment_status !== 'paid').map(b => {
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

          {/* FSEE requests from families */}
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
            <div className="px-4 py-3 bg-indigo-50 border-b border-indigo-100">
              <h3 className="text-xs font-bold text-indigo-800 uppercase tracking-wide flex items-center gap-1.5">
                <FileText className="h-4 w-4" />
                Facturas familiares (FSEE) ({bookings.filter(b => b.wants_invoice && b.status === 'completed').length})
              </h3>
              <p className="text-[10px] text-slate-500 mt-0.5">Servicios con factura. BienCuidar retiene ISR 10% y emite FSEE. Cobro: US$ 5.65 (gestión + IVA).</p>
            </div>
            {bookings.filter(b => b.wants_invoice && b.status === 'completed').length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400">Sin servicios con factura.</div>
            ) : (
              <div className="divide-y divide-slate-100">
                {bookings.filter(b => b.wants_invoice && b.status === 'completed').map(b => {
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
                        Emitir FSEE
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Recent bookings overview */}
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
      )}

      {section === 'cssp' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-4">
          <p className="text-xs text-slate-500 mb-3">
            Para revisión detallada de CSSP, usa el botón "Revisión CSSP" en la barra superior.
          </p>
          <div className="space-y-2">
            {nurses.map(n => {
              const profile = profileMap.get(n.user_id);
              return (
                <div key={n.id} className="flex items-center justify-between text-xs py-2 border-b border-slate-100">
                  <div>
                    <span className="font-bold text-slate-700">{profile?.full_name || 'N/A'}</span>
                    <span className="text-slate-500 ml-2">{n.cssp_registration}</span>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                    n.cssp_verified ? 'bg-emerald-100 text-emerald-700' :
                    n.cssp_verification_status === 'pending' ? 'bg-amber-100 text-amber-700' :
                    'bg-slate-100 text-slate-500'
                  }`}>
                    {n.cssp_verified ? 'Verificada' : n.cssp_verification_status || 'Sin verificar'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
