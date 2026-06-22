import { type FC } from 'react';
import { Receipt, X, Phone, MessageCircle, CreditCard, FileText } from 'lucide-react';

interface SummarySlot {
  date: string;
  shift: string;
  nurseName: string;
  nurseRate: number;
}

interface PaymentSummaryProps {
  open: boolean;
  onClose: () => void;
  familyName: string;
  slots: SummarySlot[];
  totalPrice: number;
  nursePhone?: string;
  wantsInvoice?: boolean;
}

const DAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const MONTH_NAMES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return `${DAY_NAMES[d.getDay()]}, ${d.getDate()} ${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
}

export const PaymentSummary: FC<PaymentSummaryProps> = ({ open, onClose, familyName, slots, totalPrice, nursePhone, wantsInvoice }) => {
  if (!open) return null;

  const nurseName = slots[0]?.nurseName || 'Enfermera';
  const whatsappLink = nursePhone ? `https://wa.me/503${nursePhone.replace(/[^0-9]/g, '')}` : null;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" id="payment-summary-modal">
      <div className="bg-white rounded-2xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-slate-200">
          <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
            <Receipt className="h-5 w-5 text-emerald-600" />
            Servicio Confirmado
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg transition cursor-pointer">
            <X className="h-5 w-5 text-slate-500" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase">Cliente</p>
            <p className="text-sm font-bold text-slate-800">{familyName}</p>
          </div>

          <div className="space-y-2">
            <p className="text-[10px] font-bold text-slate-500 uppercase">Detalle de servicios</p>
            {slots.map((slot, i) => (
              <div key={i} className="flex justify-between items-center bg-slate-50 rounded-xl p-3 text-xs">
                <div>
                  <p className="font-bold text-slate-700">{formatDate(slot.date)}</p>
                  <p className="text-[10px] text-slate-500 capitalize">{slot.shift} · {slot.nurseName}</p>
                </div>
                <span className="font-bold text-slate-700">${slot.nurseRate.toFixed(2)}</span>
              </div>
            ))}
          </div>

          <div className="border-t border-slate-200 pt-3 flex justify-between items-center">
            <span className="text-sm font-bold text-slate-700">Total acordado</span>
            <span className="text-xl font-black text-emerald-700">${totalPrice.toFixed(2)}</span>
          </div>

          {/* Direct payment instructions */}
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 space-y-3">
            <div className="flex items-center gap-2">
              <MessageCircle className="h-4 w-4 text-emerald-600 shrink-0" />
              <p className="text-xs font-bold text-emerald-800">Coordina el pago directamente con la enfermera</p>
            </div>
            <p className="text-[11px] text-slate-600 leading-relaxed pl-6">
              Puedes pagar en efectivo, transferencia o como acuerden entre ustedes. BienCuidar no intermedia el dinero.
            </p>

            {nursePhone && (
              <div className="flex gap-2 pl-6">
                <a
                  href={`tel:${nursePhone}`}
                  className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-700 bg-white border border-emerald-200 hover:bg-emerald-50 px-3 py-2 rounded-lg transition cursor-pointer"
                >
                  <Phone className="h-3 w-3" />
                  Llamar
                </a>
                {whatsappLink && (
                  <a
                    href={whatsappLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-[10px] font-bold text-white bg-emerald-600 hover:bg-emerald-500 px-3 py-2 rounded-lg transition cursor-pointer"
                  >
                    <MessageCircle className="h-3 w-3" />
                    WhatsApp
                  </a>
                )}
              </div>
            )}
          </div>

          {/* Receipt option */}
          <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-3 flex items-start gap-2.5">
            <FileText className="h-4 w-4 text-indigo-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-bold text-indigo-800">¿Quieres recibo del servicio?</p>
              <p className="text-[10px] text-indigo-600 leading-relaxed mt-0.5">
                BienCuidar genera un Recibo Simple en PDF con los datos del servicio. No tiene valor fiscal ante Hacienda, sirve como control privado entre las partes. Costo: US$ 5.
              </p>
            </div>
          </div>

          {/* Coming soon: card payments */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-start gap-2.5">
            <CreditCard className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-bold text-slate-600">Próximamente: pagos con tarjeta</p>
              <p className="text-[10px] text-slate-400 leading-relaxed mt-0.5">
                Soon podrás pagar con tarjeta de crédito directamente desde la plataforma.
              </p>
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-slate-200">
          <button
            onClick={onClose}
            className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 rounded-xl text-sm transition cursor-pointer"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};
