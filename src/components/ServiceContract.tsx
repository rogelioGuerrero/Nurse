import { type FC, useState } from 'react';
import { FileText, Download, X, Share2, CheckCircle2 } from 'lucide-react';
import { SHIFTS, type ShiftType } from '../types';
import { calculateFamilyPrice, calculateNurseNet, PLATFORM_COMMISSION, IVA_RATE, RETENTION_RATE } from '../data/standardRates';

interface ServiceContractProps {
  open: boolean;
  onClose: () => void;
  familyName: string;
  patientName: string;
  patientCondition: string;
  emergencyContact: string;
  slots: { date: string; shift: ShiftType; nurseName: string; nurseRate: number; csspReg: string; csspLevel: string }[];
  totalShifts: number;
  totalPrice: number;
  wantsInvoice?: boolean;
}

export const ServiceContract: FC<ServiceContractProps> = ({
  open, onClose, familyName, patientName, patientCondition, emergencyContact,
  slots, totalShifts, totalPrice, wantsInvoice = false
}) => {
  if (!open) return null;

  const today = new Date().toLocaleDateString('es-SV', { day: 'numeric', month: 'long', year: 'numeric' });
  const [saved, setSaved] = useState(false);

  const handleDownload = () => {
    window.print();
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleShare = () => {
    const text = `Contrato de Servicios de Enfermería - BienCuidar\n\nFamilia: ${familyName}\nPaciente: ${patientName}\nTurnos: ${totalShifts}\nTotal: US$ ${totalPrice.toFixed(2)}\n\nVer contrato completo en https://biencuidar.agtisa.com`;
    if (navigator.share) {
      navigator.share({ title: 'Contrato BienCuidar', text });
    } else {
      const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
      window.open(url, '_blank');
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-[60] flex items-center justify-center p-4 print:bg-white print:p-0 print:block">
      <div className="bg-white rounded-3xl max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-2xl print:shadow-none print:rounded-none print:max-h-none print:max-w-none">
        {/* Header - hidden on print */}
        <div className="sticky top-0 bg-white border-b border-slate-100 px-5 py-4 flex items-center justify-between z-10 print:hidden">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-indigo-600" />
            <h2 className="text-base font-bold text-slate-800">Contrato de Servicios</h2>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 bg-slate-100 hover:bg-slate-200 w-7 h-7 rounded-full flex items-center justify-center cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Contract content */}
        <div className="px-6 py-5 space-y-4 text-xs text-slate-800 leading-relaxed print:px-8 print:py-6">

          {/* Title */}
          <div className="text-center space-y-1 pb-3 border-b border-slate-200">
            <h1 className="text-lg font-bold text-slate-900">Contrato de Prestación de Servicios de Enfermería</h1>
            <p className="text-[10px] text-slate-500">Fecha: {today}</p>
          </div>

          {/* Parties */}
          <section className="space-y-2">
            <h3 className="text-sm font-bold text-slate-800">Partes del Contrato</h3>
            <p>
              <strong>CONTRATANTE (Familia):</strong> {familyName}, en calidad de representante
              del paciente {patientName}, quien solicita servicios de enfermería a domicilio.
            </p>
            <p>
              <strong>CONTRATADA (Enfermera):</strong> Las profesionales detalladas en este
              documento, cada una con registro vigente ante el CSSP, actúan como trabajadoras
              independientes.
            </p>
            <p className="text-[10px] text-slate-500 italic">
              Este contrato se celebra directamente entre la familia y la enfermera(s).
              BienCuidar actúa únicamente como plataforma de intermediación tecnológica{wantsInvoice ? ' y agente de retención fiscal' : ''}, y no es parte de este contrato.
            </p>
          </section>

          {/* Service details */}
          <section className="space-y-2">
            <h3 className="text-sm font-bold text-slate-800">Detalle del Servicio</h3>
            <table className="w-full text-[10px] border border-slate-200 rounded-lg overflow-hidden">
              <thead className="bg-slate-50">
                <tr>
                  <th className="text-left px-2 py-1.5 font-bold text-slate-600">Fecha</th>
                  <th className="text-left px-2 py-1.5 font-bold text-slate-600">Turno</th>
                  <th className="text-left px-2 py-1.5 font-bold text-slate-600">Enfermera</th>
                  <th className="text-left px-2 py-1.5 font-bold text-slate-600">CSSP</th>
                  <th className="text-right px-2 py-1.5 font-bold text-slate-600">Tarifa</th>
                </tr>
              </thead>
              <tbody>
                {slots.map((s, i) => {
                  const shift = SHIFTS[s.shift as ShiftType];
                  const price = calculateFamilyPrice(s.nurseRate, true);
                  return (
                    <tr key={i} className="border-t border-slate-100">
                      <td className="px-2 py-1.5">{s.date}</td>
                      <td className="px-2 py-1.5">{shift.label}</td>
                      <td className="px-2 py-1.5">{s.nurseName}</td>
                      <td className="px-2 py-1.5 text-[9px]">{s.csspReg}</td>
                      <td className="px-2 py-1.5 text-right font-bold">US$ {price.toFixed(2)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-300 bg-slate-50">
                  <td colSpan={4} className="px-2 py-1.5 font-bold text-right">Total:</td>
                  <td className="px-2 py-1.5 text-right font-black text-indigo-700">US$ {totalPrice.toFixed(2)}</td>
                </tr>
              </tfoot>
            </table>
          </section>

          {/* Patient info */}
          <section className="space-y-1">
            <h3 className="text-sm font-bold text-slate-800">Datos del Paciente</h3>
            <p><strong>Nombre:</strong> {patientName}</p>
            <p><strong>Condición:</strong> {patientCondition || 'No especificada'}</p>
            <p><strong>Contacto de emergencia:</strong> {emergencyContact}</p>
          </section>

          {/* Clauses */}
          <section className="space-y-2">
            <h3 className="text-sm font-bold text-slate-800">Cláusulas</h3>

            <p><strong>Primera - Objeto:</strong> La enfermera prestará servicios de enfermería
            profesional al paciente indicado, en el domicilio que la familia designe, durante los
            turnos y fechas especificados en este contrato.</p>

            <p><strong>Segunda - Responsabilidad Profesional:</strong> La enfermera es única
            responsable de sus actos clínicos, decisiones profesionales y omisiones derivadas del
            ejercicio de su profesión. La familia contrata bajo su propia responsabilidad y
            declara haber verificado el registro CSSP de la enfermera.</p>

            <p><strong>Tercera - Pago:</strong> {wantsInvoice ? (
              <>El pago se realiza a través de la plataforma BienCuidar, que actúa como agente de retención. La tarifa incluye la comisión de intermediación de US$ {PLATFORM_COMMISSION.toFixed(2)} por turno más IVA del {(IVA_RATE * 100).toFixed(0)}% sobre la comisión. La retención de ISR del {(RETENTION_RATE * 100).toFixed(0)}% (Art. 156 C.T.) se aplica sobre la tarifa de la enfermera.</>
            ) : (
              <>El pago se realiza directamente entre la familia y la enfermera, en efectivo, transferencia o como acuerden entre ambas partes. BienCuidar no intermedia ni retiene el pago. La enfermera es responsable de reportar sus ingresos ante las autoridades fiscales correspondientes.</>
            )}</p>

            {wantsInvoice ? (
            <p><strong>Cuarta - Cancelación:</strong> La familia puede cancelar sin costo hasta
            24 horas antes del servicio. Cancelaciones con menos anticipación podrán generar un
            cargo equivalente al 50% del turno. Este cargo es exigible únicamente cuando el pago
            se realiza a través de la plataforma con factura.</p>
            ) : (
            <p><strong>Cuarta - Cancelación:</strong> Al optar por pago directo sin factura,
            la política de cancelación con cargo no aplica. La cancelación se coordina directamente
            entre la familia y la enfermera. Esta es una de las ventajas de facturar a través de
            la plataforma.</p>
            )}

            <p><strong>Quinta - Relación entre Partes:</strong> No existe relación laboral entre
            la familia y la enfermera ni entre BienCuidar y la enfermera. La enfermera actúa como
            profesional independiente. BienCuidar no es parte de este contrato ni asume
            responsabilidad por la prestación del servicio clínico.</p>

            <p><strong>Sexta - Resolución de Disputas:</strong> Cualquier disputa derivada de
            este contrato se resolverá directamente entre la familia y la enfermera. BienCuidar
            podrá mediar a solicitud de las partes pero no tiene obligación de hacerlo.</p>
          </section>

          {/* Signatures */}
          <section className="pt-6 space-y-8">
            <div className="grid grid-cols-2 gap-8">
              <div className="text-center space-y-1">
                <div className="border-t border-slate-400 pt-1">
                  <p className="text-[10px] font-bold text-slate-700">{familyName || 'Familia'}</p>
                  <p className="text-[9px] text-slate-500">Contratante (Familia)</p>
                </div>
              </div>
              <div className="text-center space-y-1">
                <div className="border-t border-slate-400 pt-1">
                  <p className="text-[10px] font-bold text-slate-700">Enfermera(s)</p>
                  <p className="text-[9px] text-slate-500">Contratada(s)</p>
                </div>
              </div>
            </div>
          </section>

          <div className="border-t border-slate-100 pt-3">
            <p className="text-[9px] text-slate-400 text-center italic">
              Este documento es un contrato entre la familia y la enfermera(s). BienCuidar no es
              parte del mismo. Generado el {today}.
            </p>
          </div>
        </div>

        {/* Footer - hidden on print */}
        <div className="sticky bottom-0 bg-white border-t border-slate-100 px-5 py-3 flex gap-2 print:hidden">
          <button
            onClick={onClose}
            className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 rounded-xl text-sm transition cursor-pointer"
          >
            Cerrar
          </button>
          <button
            onClick={handleShare}
            className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 rounded-xl text-sm transition flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Share2 className="h-4 w-4" />
            Compartir
          </button>
          <button
            onClick={handleDownload}
            className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 rounded-xl text-sm transition flex items-center justify-center gap-1.5 cursor-pointer"
          >
            {saved ? <CheckCircle2 className="h-4 w-4" /> : <Download className="h-4 w-4" />}
            {saved ? 'Guardado' : 'PDF'}
          </button>
        </div>
      </div>
    </div>
  );
};
