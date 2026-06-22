import { type FC } from 'react';
import { X, ShieldCheck, FileText, Scale, UserCheck } from 'lucide-react';

interface TermsAndConditionsProps {
  open: boolean;
  onClose: () => void;
  role: 'family' | 'nurse';
}

export const TermsAndConditions: FC<TermsAndConditionsProps> = ({ open, onClose, role }) => {
  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-md w-full max-h-[85vh] overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-slate-100 px-5 py-4 flex items-center justify-between z-10">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-indigo-600" />
            <h2 className="text-base font-bold text-slate-800">Términos y Condiciones</h2>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 bg-slate-100 hover:bg-slate-200 w-7 h-7 rounded-full flex items-center justify-center cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="px-5 py-4 space-y-5 text-xs text-slate-700 leading-relaxed">

          {/* Cláusula 1: Naturaleza de la plataforma */}
          <section className="space-y-2">
            <div className="flex items-center gap-2">
              <Scale className="h-4 w-4 text-indigo-600 shrink-0" />
              <h3 className="text-sm font-bold text-slate-800">1. Naturaleza de BienCuidar</h3>
            </div>
            <p>
              BienCuidar es una <strong>plataforma tecnológica de intermediación</strong> que conecta
              familias que requieren servicios de enfermería con profesionales independientes
              registrados. <strong>BienCuidar no es empleador</strong>, ni empresa de servicios
              de salud, ni agencia de enfermería. No contrata, supervisa, ni dirige el trabajo
              clínico de las enfermeras.
            </p>
            <p>
              La relación contractual de prestación de servicios se celebra <strong>directa y
              exclusivamente entre la familia y la enfermera</strong>. BienCuidar no es parte de
              dicho contrato ni asume obligaciones derivadas del mismo.
            </p>
          </section>

          {/* Cláusula 2: Responsabilidad profesional */}
          <section className="space-y-2">
            <div className="flex items-center gap-2">
              <UserCheck className="h-4 w-4 text-indigo-600 shrink-0" />
              <h3 className="text-sm font-bold text-slate-800">2. Responsabilidad Profesional</h3>
            </div>
            <p>
              La enfermera es <strong>única responsable</strong> de sus actos clínicos, decisiones
              profesionales, omisiones y errores derivados del ejercicio de su profesión. La
              enfermera declara que cuenta con registro vigente ante el Consejo Superior de Salud
              Pública (CSSP) y que su ejercicio profesional cumple con las leyes de El Salvador.
            </p>
            <p>
              <strong>BienCuidar no garantiza ni respalda</strong> la calidad clínica de los
              servicios prestados. Cualquier reclamación, demanda o disputa relacionada con la
              atención clínica debe dirigirse <strong>exclusivamente contra la enfermera</strong>
              prestadora del servicio, no contra BienCuidar.
            </p>
          </section>

          {/* Cláusula 3: Rol de facturación */}
          <section className="space-y-2">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-indigo-600 shrink-0" />
              <h3 className="text-sm font-bold text-slate-800">3. Rol de Facturación y Retención</h3>
            </div>
            <p>
              BienCuidar actúa como <strong>agente de retención</strong> autorizado por la
              enfermera para procesar la retención del 10% de ISR (Art. 156 Código Tributario)
              y emitir comprobantes FSE a su nombre. Este servicio administrativo no convierte a
              BienCuidar en empleador ni en parte del contrato de servicios.
            </p>
            <p>
              La comisión de intermediación de BienCuidar es de <strong>US$ 5.00 por turno</strong>,
              sujeta a IVA del 13% (exclusivamente sobre la comisión, no sobre el servicio de
              salud que está exento conforme al Art. 46 LIVA).
            </p>
          </section>

          {/* Cláusula 4: Verificaciones */}
          <section className="space-y-2">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-indigo-600 shrink-0" />
              <h3 className="text-sm font-bold text-slate-800">4. Verificaciones y Antecedentes</h3>
            </div>
            <p>
              BienCuidar solicita a las enfermeras su número de registro CSSP y lo muestra
              públicamente para que las familias puedan verificarlo en el portal oficial
              <span className="text-indigo-600"> cssp.gob.sv</span>. Sin embargo, BienCuidar
              <strong> no garantiza la vigencia ni autenticidad</strong> de dichos registros,
              siendo responsabilidad de la familia verificar antes de contratar.
            </p>
          </section>

          {/* Cláusula 5: Limitación de responsabilidad */}
          <section className="space-y-2">
            <div className="flex items-center gap-2">
              <Scale className="h-4 w-4 text-indigo-600 shrink-0" />
              <h3 className="text-sm font-bold text-slate-800">5. Limitación de Responsabilidad</h3>
            </div>
            <p>
              En ningún caso BienCuidar será responsable por daños directos, indirectos,
              incidentales o consecuentes derivados de la prestación de servicios clínicos por
              parte de las enfermeras. La familia acepta que contrata bajo su propio riesgo y
              que debe verificar las credenciales de la enfermera antes de iniciar el servicio.
            </p>
            {role === 'nurse' && (
              <p>
                La enfermera acepta que es <strong>trabajadora independiente</strong> y que no
                existe relación laboral alguna con BienCuidar. La enfermera es responsable de
                sus propias declaraciones tributarias, seguro de mala praxis y obligaciones
                laborales con terceros.
              </p>
            )}
          </section>

          {/* Cláusula 6: Resolución de disputas */}
          <section className="space-y-2">
            <h3 className="text-sm font-bold text-slate-800">6. Resolución de Disputas</h3>
            <p>
              Cualquier disputa entre familia y enfermera debe resolverse directamente entre
              ambas partes. BienCuidar podrá mediar a solicitud de las partes, pero no tiene
              obligación legal de hacerlo ni asume responsabilidad por el resultado de dicha
              mediación.
            </p>
          </section>

          <div className="border-t border-slate-100 pt-3">
            <p className="text-[10px] text-slate-400 text-center">
              Al continuar con el registro, manifiestas haber leído y aceptado estos términos.
              Última actualización: {new Date().getFullYear()}.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-white border-t border-slate-100 px-5 py-3">
          <button
            onClick={onClose}
            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 rounded-xl text-sm transition cursor-pointer"
          >
            He leído los términos
          </button>
        </div>
      </div>
    </div>
  );
};
