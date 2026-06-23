import { type FC } from 'react';
import { ShieldAlert } from 'lucide-react';

interface LegalDisclaimerProps {
  variant?: 'compact' | 'full' | 'direct-payment' | 'invoice-payment' | 'checkout-confirm';
}

export const LegalDisclaimer: FC<LegalDisclaimerProps> = ({ variant = 'compact' }) => {
  if (variant === 'full') {
    return (
      <div className="bg-amber-50/80 border border-amber-200 rounded-2xl p-4 space-y-2">
        <div className="flex items-start gap-2.5">
          <ShieldAlert className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="space-y-1.5">
            <h4 className="text-xs font-bold text-amber-800 uppercase tracking-wide">
              Límite de Responsabilidad
            </h4>
            <p className="text-[11px] text-amber-800 leading-relaxed">
              BienCuidar no es una agencia de empleo, clínica ni prestador de servicios de salud. Las enfermeras en nuestro catálogo ejercen de manera libre e independiente bajo su propio registro del CSSP. BienCuidar no se responsabiliza por diagnósticos, tratamientos o cualquier eventualidad médica surgida durante el servicio.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (variant === 'direct-payment') {
    return (
      <div className="bg-amber-50/60 border border-amber-200/40 rounded-xl p-3 flex items-start gap-2">
        <ShieldAlert className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
        <p className="text-[10px] text-amber-800 leading-relaxed font-medium">
          <strong>Aviso de Pago Directo:</strong> BienCuidar no intermedia el flujo de dinero. La familia paga directamente a la enfermera (efectivo, transferencia o como acuerden). La enfermera es responsable de reportar sus ingresos ante Hacienda.
        </p>
      </div>
    );
  }

  if (variant === 'invoice-payment') {
    return (
      <div className="bg-indigo-50/60 border border-indigo-200/40 rounded-xl p-3 flex items-start gap-2">
        <ShieldAlert className="h-4 w-4 text-indigo-600 shrink-0 mt-0.5" />
        <p className="text-[10px] text-indigo-800 leading-relaxed font-medium">
          <strong>Aviso de Pago con Factura:</strong> El pago se realiza por transferencia a BienCuidar. Emitimos comprobante legal (Factura o Crédito Fiscal) válido ante el Ministerio de Hacienda. El total incluye el pago de la enfermera y nuestra tarifa de gestión de US$5 más IVA.
        </p>
      </div>
    );
  }

  if (variant === 'checkout-confirm') {
    return (
      <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-3 flex items-start gap-2">
        <ShieldAlert className="h-4 w-4 text-indigo-600 shrink-0 mt-0.5" />
        <p className="text-[10px] text-indigo-800 leading-relaxed font-medium">
          <strong>Aceptación de Servicio Independiente:</strong> Entiendo y acepto que BienCuidar actúa exclusivamente como intermediario tecnológico. La relación laboral o profesional de cuidado se constituye directamente entre el cliente contratante y la enfermera seleccionada. BienCuidar no asume responsabilidad civil, penal ni clínica por el desempeño de las labores de enfermería.
        </p>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-1.5 px-1 bg-slate-100 p-2.5 rounded-xl border border-slate-200">
      <ShieldAlert className="h-4 w-4 text-slate-500 shrink-0 mt-0.5" />
      <p className="text-[10px] text-slate-500 leading-relaxed">
        <strong>Términos de Intermediación:</strong> BienCuidar es únicamente una plataforma tecnológica de contacto. No prestamos servicios médicos ni empleamos al personal de enfermería. El servicio y el cuidado clínico se contratan y acuerdan directamente entre la familia y la enfermera independiente. Recuerda verificar el carnet CSSP en el enlace oficial antes de contratar.
      </p>
    </div>
  );
};

