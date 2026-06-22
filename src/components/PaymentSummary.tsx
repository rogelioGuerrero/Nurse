import { useState, type FC } from 'react';
import { Receipt, X, Mail, Building2, Copy, Check } from 'lucide-react';
import { PLATFORM_SETTINGS } from '../data/platformSettings';

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
}

const DAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const MONTH_NAMES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return `${DAY_NAMES[d.getDay()]}, ${d.getDate()} ${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
}

export const PaymentSummary: FC<PaymentSummaryProps> = ({ open, onClose, familyName, slots, totalPrice }) => {
  const [copied, setCopied] = useState(false);
  if (!open) return null;

  const reference = `BC-${familyName.substring(0, 3).toUpperCase()}-${slots.length}T`;

  const copyAccount = () => {
    const text = `${PLATFORM_SETTINGS.bankName} - ${PLATFORM_SETTINGS.bankAccountType}\nTitular: ${PLATFORM_SETTINGS.bankAccountHolder}\nCuenta: ${PLATFORM_SETTINGS.bankAccountNumber}\nReferencia: ${reference}\nMonto: $${totalPrice.toFixed(2)}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" id="payment-summary-modal">
      <div className="bg-white rounded-2xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-slate-200">
          <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
            <Receipt className="h-5 w-5 text-indigo-600" />
            Resumen de Pago
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
            <span className="text-sm font-bold text-slate-700">Total a pagar</span>
            <span className="text-xl font-black text-indigo-700">${totalPrice.toFixed(2)}</span>
          </div>

          {/* Payment instructions */}
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-2.5">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-amber-600 shrink-0" />
              <p className="text-xs font-bold text-amber-800">Instrucciones de pago</p>
            </div>
            <div className="text-[11px] text-slate-700 space-y-1 pl-6">
              <p><span className="font-bold">Banco:</span> {PLATFORM_SETTINGS.bankName}</p>
              <p><span className="font-bold">Titular:</span> {PLATFORM_SETTINGS.bankAccountHolder}</p>
              <p><span className="font-bold">Cuenta:</span> {PLATFORM_SETTINGS.bankAccountNumber} <span className="text-slate-500">({PLATFORM_SETTINGS.bankAccountType})</span></p>
              <p><span className="font-bold">Referencia:</span> {reference}</p>
              <p><span className="font-bold">Monto:</span> ${totalPrice.toFixed(2)}</p>
            </div>
            <button
              onClick={copyAccount}
              className="w-full flex items-center justify-center gap-1.5 text-[10px] font-bold text-amber-700 bg-white border border-amber-200 hover:bg-amber-50 py-2 rounded-lg transition cursor-pointer"
            >
              {copied ? (
                <><Check className="h-3 w-3" />Copiado al portapapeles</>
              ) : (
                <><Copy className="h-3 w-3" />Copiar datos de transferencia</>
              )}
            </button>
            <p className="text-[10px] text-amber-600 leading-relaxed pl-6">
              Realiza la transferencia y envía el comprobante por WhatsApp. Una vez confirmado el pago, tu servicio quedará activo.
            </p>
          </div>

          <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-3 flex items-start gap-2.5">
            <Mail className="h-4 w-4 text-indigo-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-bold text-indigo-800">Factura oficial</p>
              <p className="text-[10px] text-indigo-600 leading-relaxed mt-0.5">
                La factura electrónica (FSE) válida ante el Ministerio de Hacienda se enviará a tu correo electrónico.
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
