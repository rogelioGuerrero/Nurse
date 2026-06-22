import { type FC } from 'react';
import { FileText, Printer, X } from 'lucide-react';
import { PLATFORM_COMMISSION, IVA_RATE, RETENTION_RATE } from '../data/standardRates';

interface FSESlot {
  date: string;
  shift: string;
  nurseName: string;
  nurseRate: number;
  csspReg: string;
}

interface FSEProps {
  open: boolean;
  onClose: () => void;
  familyName: string;
  familyEmail?: string;
  slots: FSESlot[];
}

const DAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Jueves', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const MONTH_NAMES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return `${DAY_NAMES[d.getDay()]}, ${d.getDate()} ${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
}

export const FSEDocument: FC<FSEProps> = ({ open, onClose, familyName, familyEmail, slots }) => {
  if (!open) return null;

  const now = new Date();
  const fseNumber = `FSE-BC-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${Math.floor(Math.random() * 9999).toString().padStart(4, '0')}`;

  const totalShifts = slots.length;
  const totalNurseFee = slots.reduce((sum, s) => sum + s.nurseRate, 0);
  const totalCommission = totalShifts * PLATFORM_COMMISSION;
  const totalIVA = totalCommission * IVA_RATE;
  const totalRetention = totalNurseFee * RETENTION_RATE;
  const totalFamily = totalNurseFee + totalCommission + totalIVA;
  const nurseNet = totalNurseFee - totalRetention;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 print:bg-white print:p-0 print:static" id="fse-modal">
      <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto print:max-h-none print:rounded-none print:max-w-none print:overflow-visible">
        {/* Header - hidden on print */}
        <div className="flex items-center justify-between p-4 border-b border-slate-200 print:hidden">
          <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
            <FileText className="h-5 w-5 text-indigo-600" />
            Factura Sujeto Excluido (FSE)
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg transition cursor-pointer">
            <X className="h-5 w-5 text-slate-500" />
          </button>
        </div>

        {/* Printable document */}
        <div className="p-6 print:p-8 space-y-6" id="fse-document">
          {/* Document header */}
          <div className="border-b-2 border-indigo-600 pb-4">
            <div className="flex items-start justify-between">
              <div>
                <h1 className="text-xl font-black text-slate-900">BienCuidar</h1>
                <p className="text-[10px] text-slate-500">Plataforma de intermediación de servicios de enfermería</p>
                <p className="text-[10px] text-slate-500">El Salvador, Centroamérica</p>
              </div>
              <div className="text-right">
                <h2 className="text-sm font-black text-indigo-700">FACTURA SUJETO EXCLUIDO</h2>
                <p className="text-[10px] font-bold text-slate-600">N° {fseNumber}</p>
                <p className="text-[10px] text-slate-500">Fecha: {now.toLocaleDateString('es-SV')}</p>
              </div>
            </div>
          </div>

          {/* Legal basis */}
          <div className="bg-slate-50 rounded-lg p-3 text-[10px] text-slate-600 leading-relaxed">
            <p className="font-bold text-slate-700 mb-1">Fundamento Legal:</p>
            <p>
              Art. 156 Código Tributario — Retención del 10% ISR sobre servicios profesionales independientes.
              La enfermera es Sujeto Excluido del IVA (Art. 29 num. 18 LIVA — servicios de salud).
              BienCuidar actúa como Agente de Retención. IVA del 13% aplica únicamente sobre la comisión de intermediación.
            </p>
          </div>

          {/* Parties */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <p className="text-[10px] font-bold text-slate-500 uppercase">Cliente (Familia)</p>
              <p className="text-sm font-bold text-slate-800">{familyName}</p>
              {familyEmail && <p className="text-[10px] text-slate-500">{familyEmail}</p>}
            </div>
            <div className="space-y-1">
              <p className="text-[10px] font-bold text-slate-500 uppercase">Emisor (Agente de Retención)</p>
              <p className="text-sm font-bold text-slate-800">BienCuidar</p>
              <p className="text-[10px] text-slate-500">NRC: (pendiente de registro Hacienda)</p>
              <p className="text-[10px] text-slate-500">NIT: (pendiente de registro Hacienda)</p>
            </div>
          </div>

          {/* Service detail table */}
          <div>
            <table className="w-full text-[10px] border-collapse">
              <thead>
                <tr className="bg-slate-100 text-slate-700">
                  <th className="border border-slate-200 px-2 py-1.5 text-left">Fecha</th>
                  <th className="border border-slate-200 px-2 py-1.5 text-left">Turno</th>
                  <th className="border border-slate-200 px-2 py-1.5 text-left">Enfermera</th>
                  <th className="border border-slate-200 px-2 py-1.5 text-left">Registro CSSP</th>
                  <th className="border border-slate-200 px-2 py-1.5 text-right">Tarifa</th>
                </tr>
              </thead>
              <tbody>
                {slots.map((slot, i) => (
                  <tr key={i} className="text-slate-600">
                    <td className="border border-slate-200 px-2 py-1.5">{formatDate(slot.date)}</td>
                    <td className="border border-slate-200 px-2 py-1.5 capitalize">{slot.shift}</td>
                    <td className="border border-slate-200 px-2 py-1.5">{slot.nurseName}</td>
                    <td className="border border-slate-200 px-2 py-1.5 font-mono">{slot.csspReg}</td>
                    <td className="border border-slate-200 px-2 py-1.5 text-right">${slot.nurseRate.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Tax breakdown */}
          <div className="space-y-2">
            <h3 className="text-xs font-bold text-slate-700 uppercase border-b border-slate-200 pb-1">Desglose Tributario</h3>
            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-600">Servicio de enfermería ({totalShifts} turno{totalShifts > 1 ? 's' : ''})</span>
                <span className="font-bold text-slate-700">${totalNurseFee.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Comisión de intermediación ({totalShifts} × ${PLATFORM_COMMISSION.toFixed(2)})</span>
                <span className="font-bold text-slate-700">${totalCommission.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">IVA 13% sobre comisión (Art. 29 num. 18 LIVA — salud exenta)</span>
                <span className="font-bold text-slate-700">${totalIVA.toFixed(2)}</span>
              </div>
              <div className="border-t border-slate-300 pt-1.5 flex justify-between items-center">
                <span className="text-sm font-black text-slate-800">Total a pagar por la familia</span>
                <span className="text-lg font-black text-indigo-700">${totalFamily.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Retention detail */}
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-1.5">
            <h3 className="text-xs font-bold text-amber-800 uppercase">Retención ISR (Agente de Retención)</h3>
            <div className="space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-600">Tarifa bruta de enfermería</span>
                <span className="font-bold text-slate-700">${totalNurseFee.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Retención 10% ISR (Art. 156 Código Tributario)</span>
                <span className="font-bold text-rose-600">-${totalRetention.toFixed(2)}</span>
              </div>
              <div className="border-t border-amber-300 pt-1.5 flex justify-between">
                <span className="text-slate-600 font-bold">Pago neto a la enfermera</span>
                <span className="font-bold text-emerald-700">${nurseNet.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Platform revenue */}
          <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-3 space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-600">Comisión BienCuidar (sin IVA)</span>
              <span className="font-bold text-slate-700">${totalCommission.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">IVA retenido/trasladado al cliente</span>
              <span className="font-bold text-slate-700">${totalIVA.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">ISR retenido a enfermera(s) (a pagar a Hacienda)</span>
              <span className="font-bold text-slate-700">${totalRetention.toFixed(2)}</span>
            </div>
          </div>

          {/* Footer */}
          <div className="border-t border-slate-200 pt-4 space-y-2">
            <p className="text-[9px] text-slate-400 leading-relaxed">
              Esta factura es válida ante el Ministerio de Hacienda de El Salvador. La retención del 10% ISR
              es obligatoria conforme al Art. 156 del Código Tributario. BienCuidar actúa únicamente como
              intermediario tecnológico y agente de retención, no como empleador de las enfermeras.
              El servicio de enfermería está exento de IVA conforme al Art. 29 num. 18 de la Ley de IVA.
            </p>
            <div className="flex items-end justify-between pt-4">
              <div className="text-center">
                <div className="border-t border-slate-400 w-32 pt-1">
                  <p className="text-[9px] text-slate-500">BienCuidar (Agente de Retención)</p>
                </div>
              </div>
              <div className="text-center">
                <div className="border-t border-slate-400 w-32 pt-1">
                  <p className="text-[9px] text-slate-500">Recibido por la familia</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Print button - hidden on print */}
        <div className="p-4 border-t border-slate-200 flex gap-3 print:hidden">
          <button
            onClick={() => window.print()}
            className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 rounded-xl text-sm transition flex items-center justify-center gap-2 cursor-pointer"
          >
            <Printer className="h-4 w-4" />
            Imprimir / Guardar PDF
          </button>
          <button
            onClick={onClose}
            className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 px-6 rounded-xl text-sm transition cursor-pointer"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};
