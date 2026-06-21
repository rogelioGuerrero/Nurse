/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, type FC, type FormEvent } from 'react';
import { useApp } from '../context/AppContext';
import { Save, Edit3, CheckCircle2, Calculator, Sun, Moon, Sunset, ShieldCheck, FileText, BadgeCheck } from 'lucide-react';
import { SHIFTS, type ShiftType, type WeekDay } from '../types';
import { PLATFORM_COMMISSION, RETENTION_RATE, calculateNurseNet } from '../data/standardRates';

const allSpecialtyTags = [
  'Geriatría', 'Demencia y Alzheimer', 'Inyecciones', 'Postoperatorio', 
  'Curaciones complejas', 'Fisioterapia Básica', 'Manejo de Sondas', 
  'Cuidados Paliativos', 'Monitoreo Cardíaco', 'Control de Diabetes', 'Nutrición asistida'
];

const DAY_LABELS: { day: WeekDay; label: string }[] = [
  { day: 1, label: 'Lun' },
  { day: 2, label: 'Mar' },
  { day: 3, label: 'Mié' },
  { day: 4, label: 'Jue' },
  { day: 5, label: 'Vie' },
  { day: 6, label: 'Sáb' },
  { day: 0, label: 'Dom' },
];

const SHIFT_ICONS: Record<ShiftType, typeof Sun> = {
  morning: Sun,
  afternoon: Sunset,
  night: Moon,
};

export const NurseProfileEdit: FC = () => {
  const { currentNurse, currentUser, updateNurseProfile, updateProfile } = useApp();

  const [shiftRate, setShiftRate] = useState<number>(currentNurse?.shift_rate || 25);
  const [coverageRadius, setCoverageRadius] = useState<number>(currentNurse?.coverage_radius || 5);
  const [selectedShifts, setSelectedShifts] = useState<ShiftType[]>(currentNurse?.available_shifts || ['morning']);
  const [selectedDays, setSelectedDays] = useState<WeekDay[]>(currentNurse?.available_days || [1, 2, 3, 4, 5]);
  const [bio, setBio] = useState<string>(currentNurse?.bio || '');
  const [experienceYears, setExperienceYears] = useState<number>(currentNurse?.experience_years || 5);
  const [phone, setPhone] = useState<string>(currentUser?.phone || '');
  const [locationName, setLocationName] = useState<string>(currentUser?.location_name || '');

  const [selectedSpecs, setSelectedSpecs] = useState<string[]>(currentNurse?.specialization || []);
  const [showNotify, setShowNotify] = useState(false);

  // Optional verifications
  const [collegeReg, setCollegeReg] = useState<string>(currentNurse?.verifications?.college_registration || '');
  const [pncDate, setPncDate] = useState<string>(currentNurse?.verifications?.pnc_clearance_date || '');
  const [criminalDate, setCriminalDate] = useState<string>(currentNurse?.verifications?.criminal_record_date || '');
  const [csspReg, setCsspReg] = useState<string>(currentNurse?.verifications?.cssp_registration || '');
  const [wantsInvoicing, setWantsInvoicing] = useState<boolean>(currentNurse?.wants_invoicing || false);

  if (!currentNurse || !currentUser) return null;

  const handleToggleSpec = (tag: string) => {
    setSelectedSpecs(prev => 
      prev.includes(tag) 
        ? prev.filter(t => t !== tag) 
        : [...prev, tag]
    );
  };

  const toggleShift = (shift: ShiftType) => {
    setSelectedShifts(prev =>
      prev.includes(shift) ? prev.filter(s => s !== shift) : [...prev, shift]
    );
  };

  const toggleDay = (day: WeekDay) => {
    setSelectedDays(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
    );
  };

  const handleProfileSave = (e: FormEvent) => {
    e.preventDefault();

    updateNurseProfile({
      shift_rate: Number(shiftRate),
      coverage_radius: Number(coverageRadius),
      available_shifts: selectedShifts,
      available_days: selectedDays,
      bio,
      experience_years: Number(experienceYears),
      specialization: selectedSpecs,
      verifications: {
        college_registration: collegeReg.trim() || undefined,
        pnc_clearance_date: pncDate || undefined,
        criminal_record_date: criminalDate || undefined,
        cssp_registration: csspReg.trim() || undefined,
      },
      wants_invoicing: wantsInvoicing,
    });

    updateProfile({
      phone,
      location_name: locationName
    });

    setShowNotify(true);
    setTimeout(() => setShowNotify(false), 3000);
  };

  return (
    <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-6" id="nurse-profile-edit-root">
      
      <div className="flex items-center justify-between border-b border-slate-100 pb-4">
        <div>
          <h2 className="text-xl font-extrabold text-slate-800 flex items-center gap-2">
            <Edit3 className="h-5 w-5 text-indigo-600" />
            Configurar mi Perfil de Cuidador Profesional
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Modifica tu tarifa por turno, tu ubicación y especializaciones médicas que ven las familias.
          </p>
        </div>

        {/* Dynamic notify card */}
        {showNotify && (
          <div className="bg-emerald-50 border border-emerald-100 text-emerald-800 text-xs font-semibold px-4 py-2 rounded-xl flex items-center gap-1.5 animate-fade-in" id="notify-save-success">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            <span>¡Guardado Correctamente!</span>
          </div>
        )}
      </div>

      <form onSubmit={handleProfileSave} className="space-y-6">
        
        {/* Core numbers parameters */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          
          {/* Rate Card */}
          <div className="bg-slate-50/50 p-4 border border-slate-200 rounded-2xl relative space-y-1.5">
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide">
              Tarifa por Turno (US$)
            </label>
            <div className="relative rounded-xl overflow-hidden shadow-inner bg-slate-100/60 border border-slate-200">
              <span className="absolute inset-y-0 left-3 flex items-center text-slate-400 font-bold">$</span>
              <input
                type="number"
                required
                min="15"
                max="50"
                value={shiftRate}
                onChange={(e) => setShiftRate(Number(e.target.value))}
                className="w-full bg-transparent pl-7 pr-3 py-2.5 outline-none font-bold text-slate-800 text-sm"
                id="input-edit-rate"
              />
            </div>
            <p className="text-[10px] text-slate-400 leading-normal">Cada turno son 8 horas. Se sugiere entre US$ 20 y US$ 35 según especialización.</p>
          </div>

          {/* Coverage Radius - reference only */}
          <div className="bg-slate-50/50 p-4 border border-slate-200 rounded-2xl relative space-y-1.5">
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide">
              Radio de Referencia (Km)
            </label>
            <div className="relative rounded-xl overflow-hidden shadow-inner bg-slate-100/60 border border-slate-200">
              <input
                type="number"
                required
                min="1"
                max="50"
                value={coverageRadius}
                onChange={(e) => setCoverageRadius(Number(e.target.value))}
                className="w-full bg-transparent px-3 py-2.5 outline-none font-bold text-slate-800 text-sm"
                id="input-edit-radius"
              />
              <span className="absolute inset-y-0 right-3 flex items-center text-slate-400 text-xs font-bold">Km</span>
            </div>
            <p className="text-[10px] text-slate-400 leading-normal">Distancia máxima que estás dispuesta a viajar desde tu vivienda. Al recibir una solicitud verás la distancia exacta al paciente.</p>
          </div>

          {/* Experience years count */}
          <div className="bg-slate-50/50 p-4 border border-slate-200 rounded-2xl relative space-y-1.5">
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide">
              Años de Experiencia
            </label>
            <div className="relative rounded-xl overflow-hidden shadow-inner bg-slate-100/60 border border-slate-200">
              <input
                type="number"
                required
                min="0"
                max="50"
                value={experienceYears}
                onChange={(e) => setExperienceYears(Number(e.target.value))}
                className="w-full bg-transparent px-3 py-2.5 outline-none font-bold text-slate-800 text-sm"
                id="input-edit-exp"
              />
              <span className="absolute inset-y-0 right-3 flex items-center text-slate-400 text-xs font-bold">Años</span>
            </div>
            <p className="text-[10px] text-slate-400 leading-normal">Años de servicio formal que avalan el currículum de cuidados geriátricos.</p>
          </div>

        </div>

        {/* CALCULADORA TRIBUTARIA EL SALVADOR */}
        <div className="bg-indigo-50/30 border border-indigo-100 rounded-2xl p-5 space-y-4">
          <div className="flex items-start gap-2.5">
            <Calculator className="h-5 w-5 text-indigo-600 shrink-0 mt-0.5" />
            <div>
              <h4 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                Calculadora Tributaria de El Salvador
                <span className="bg-indigo-100 text-indigo-700 text-[8px] px-1.5 py-0.5 rounded font-black uppercase">Art. 156 C.T.</span>
              </h4>
              <p className="text-[10px] text-slate-500 leading-relaxed mt-0.5 font-medium">Bajo el Art. 156 del Código Tributario de El Salvador, las rentas por servicios profesionales independientes están sujetas al 10% de retención de Impuesto sobre la Renta. Esta herramienta te ayuda a proyectar tu ingreso neto.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs text-slate-700 font-medium">
            <div className="bg-white p-3.5 rounded-xl border border-slate-100 shadow-sm">
              <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Tu Tarifa Bruta / Turno</span>
              <span className="text-base font-black text-slate-800">US$ {shiftRate.toFixed(2)}</span>
              <span className="text-[9px] text-slate-400 block mt-1">Ingreso bruto por 8 horas</span>
            </div>

            <div className="bg-white p-3.5 rounded-xl border border-slate-100 shadow-sm">
              <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Retención del Renta (10%)</span>
              <span className="text-base font-black text-rose-600">-(US$ {(shiftRate * 0.1).toFixed(2)})</span>
              <span className="text-[9px] text-slate-400 block mt-1">Retención que realiza la familia</span>
            </div>

            <div className="bg-white p-3.5 rounded-xl border border-indigo-100 shadow-sm bg-indigo-50/20">
              <span className="text-[10px] uppercase font-bold text-indigo-700 block mb-1">Tu Tarifa Neta / Turno</span>
              <span className="text-base font-black text-indigo-700">US$ {(shiftRate * 0.9).toFixed(2)}</span>
              <span className="text-[9px] text-indigo-600 block mt-1">Monto neto que ingresa a tu cuenta</span>
            </div>
          </div>

          {/* Projection Calculator Table */}
          <div className="bg-white rounded-xl border border-slate-200 p-3.5 text-xs">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-2">Simulación de Ganancias Estimadas (Neto Líquido)</span>
            <div className="grid grid-cols-3 gap-2.5 text-center text-[11px]">
              <div className="p-2 bg-slate-50 rounded-lg border border-slate-100">
                <span className="font-bold text-slate-500 block text-[9px] uppercase">1 Turno (8h)</span>
                <span className="font-black text-slate-800 block mt-0.5">US$ {calculateNurseNet(shiftRate, wantsInvoicing).toFixed(2)}</span>
                <span className="text-[9px] text-slate-400 block mt-0.5">{wantsInvoicing ? `(Neto de $${shiftRate})` : '(Sin factura)'}</span>
              </div>
              <div className="p-2 bg-slate-50 rounded-lg border border-slate-100">
                <span className="font-bold text-slate-500 block text-[9px] uppercase">1 Semana (5 turnos)</span>
                <span className="font-black text-slate-800 block mt-0.5">US$ {(calculateNurseNet(shiftRate, wantsInvoicing) * 5).toFixed(2)}</span>
                <span className="text-[9px] text-slate-400 block mt-0.5">{wantsInvoicing ? `(Neto de $${shiftRate * 5})` : '(Sin factura)'}</span>
              </div>
              <div className="p-2 bg-slate-50 rounded-lg border border-slate-100">
                <span className="font-bold text-slate-500 block text-[9px] uppercase">1 Mes (20 turnos)</span>
                <span className="font-black text-indigo-600 block mt-0.5">US$ {(calculateNurseNet(shiftRate, wantsInvoicing) * 20).toFixed(2)}</span>
                <span className="text-[9px] text-slate-400 block mt-0.5">{wantsInvoicing ? `(Neto de $${shiftRate * 20})` : '(Sin factura)'}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Demographics row controls */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-2">
          
          {/* Phone */}
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Teléfono de Contacto</label>
            <input
              type="text"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full text-xs font-medium bg-slate-50 border border-slate-200 outline-none rounded-xl px-4 py-2.5 focus:bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
              id="input-edit-phone"
            />
          </div>

          {/* Location Area Text */}
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Área de Operación Principal</label>
            <input
              type="text"
              required
              value={locationName}
              onChange={(e) => setLocationName(e.target.value)}
              className="w-full text-xs font-medium bg-slate-50 border border-slate-200 outline-none rounded-xl px-4 py-2.5 focus:bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
              id="input-edit-location"
            />
          </div>

        </div>

        {/* Availability: Weekly shift calendar */}
        <div className="space-y-3">
          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">
            Disponibilidad Semanal
          </label>
          <p className="text-[10px] text-slate-400">Marca los días y turnos en los que estás disponible para aceptar visitas.</p>

          {/* Shift toggles */}
          <div className="flex gap-2">
            {(Object.keys(SHIFTS) as ShiftType[]).map(shift => {
              const Icon = SHIFT_ICONS[shift];
              const isSelected = selectedShifts.includes(shift);
              return (
                <button
                  key={shift}
                  type="button"
                  onClick={() => toggleShift(shift)}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border text-xs font-bold transition cursor-pointer ${
                    isSelected
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                      : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {SHIFTS[shift].label}
                  <span className="text-[9px] opacity-70">{SHIFTS[shift].start}-{SHIFTS[shift].end}</span>
                </button>
              );
            })}
          </div>

          {/* Day toggles */}
          <div className="flex gap-1.5">
            {DAY_LABELS.map(({ day, label }) => {
              const isSelected = selectedDays.includes(day);
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => toggleDay(day)}
                  className={`flex-1 py-2.5 rounded-xl border text-xs font-bold transition cursor-pointer ${
                    isSelected
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                      : 'bg-white text-slate-400 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Bio description */}
        <div className="space-y-2">
          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">
            Biografía Profesional y Enfoque Geriátrico
          </label>
          <textarea
            required
            rows={4}
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            className="w-full text-xs font-medium bg-slate-50 border border-slate-200 outline-none rounded-xl px-4 py-3 focus:bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition resize-none leading-relaxed"
            id="input-edit-bio"
          />
        </div>

        {/* Optional verifications */}
        <div className="space-y-3 pt-4 border-t border-slate-50">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-indigo-500" />
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">
              Verificaciones (Opcional)
            </label>
          </div>
          <p className="text-[10px] text-slate-400">Si tienes estos documentos, compártelos. Las familias verán badges de confianza en tu perfil. No es obligatorio.</p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase mb-1 block">Registro del Colegio/Asociación</label>
              <input
                type="text"
                value={collegeReg}
                onChange={(e) => setCollegeReg(e.target.value)}
                placeholder="Ej: ENF-2024-0123"
                className="w-full text-xs font-medium bg-slate-50 border border-slate-200 outline-none rounded-xl px-3 py-2.5 focus:bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase mb-1 block">Solvencia PNC (fecha)</label>
              <input
                type="date"
                value={pncDate}
                onChange={(e) => setPncDate(e.target.value)}
                className="w-full text-xs font-medium bg-slate-50 border border-slate-200 outline-none rounded-xl px-3 py-2.5 focus:bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase mb-1 block">Antecedentes Penales (fecha)</label>
              <input
                type="date"
                value={criminalDate}
                onChange={(e) => setCriminalDate(e.target.value)}
                className="w-full text-xs font-medium bg-slate-50 border border-slate-200 outline-none rounded-xl px-3 py-2.5 focus:bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase mb-1 block">Registro CSSP</label>
              <input
                type="text"
                value={csspReg}
                onChange={(e) => setCsspReg(e.target.value)}
                placeholder="Ej: CSSP-2024-456"
                className="w-full text-xs font-medium bg-slate-50 border border-slate-200 outline-none rounded-xl px-3 py-2.5 focus:bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
              />
            </div>
          </div>
        </div>

        {/* Invoicing option */}
        <div className="pt-4 border-t border-slate-50 space-y-3">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={wantsInvoicing}
              onChange={(e) => setWantsInvoicing(e.target.checked)}
              className="mt-0.5 w-4 h-4 accent-indigo-600 cursor-pointer"
            />
            <div className="flex-1">
              <div className="flex items-center gap-1.5">
                <FileText className="h-3.5 w-3.5 text-indigo-500" />
                <span className="text-xs font-bold text-slate-700">Quiero que BienCuidar facture por mí</span>
              </div>
              <p className="text-[10px] text-slate-400 mt-0.5 leading-relaxed">
                BienCuidar emite factura electrónica al familiar y te transfiere tu pago neto. No necesitas inscribirte en Hacienda ni manejar facturación.
              </p>
            </div>
          </label>

          {wantsInvoicing && (
            <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-200 space-y-2">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Ejemplo con tu tarifa de ${shiftRate}/turno</p>
              <div className="space-y-1 text-[11px] text-slate-600">
                <div className="flex justify-between">
                  <span>Tu tarifa por turno</span>
                  <span className="font-bold text-slate-800">${shiftRate.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Retención ISR ({(RETENTION_RATE * 100).toFixed(0)}% → Ministerio de Hacienda)</span>
                  <span>-${(shiftRate * RETENTION_RATE).toFixed(2)}</span>
                </div>
                <div className="border-t border-slate-200 pt-1.5 flex justify-between">
                  <span className="font-bold text-slate-700">Tú recibes neto</span>
                  <span className="font-black text-emerald-600">${calculateNurseNet(shiftRate, true).toFixed(2)}</span>
                </div>
              </div>
              <p className="text-[10px] text-slate-400 leading-relaxed pt-1">
                El familiar paga tu tarifa más ${PLATFORM_COMMISSION} de comisión de la plataforma. De tu tarifa, se retiene {RETENTION_RATE * 100}% de ISR (Impuesto sobre la Renta) que va directo al Ministerio de Hacienda. Si cobras directamente, tú debes declarar y pagar tus impuestos. BienCuidar se encarga de todo eso por ti y evita problemas por evasión de impuestos.
              </p>
            </div>
          )}
        </div>

        {/* Speciality selections list */}
        <div className="space-y-2 pt-2 border-t border-slate-50">
          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
            Habilidades Médicas y Especializaciones Especiales (Selecciona las que dominas)
          </label>
          <div className="flex flex-wrap gap-2">
            {allSpecialtyTags.map(tag => {
              const isSelected = selectedSpecs.includes(tag);
              return (
                <button
                  type="button"
                  key={tag}
                  onClick={() => handleToggleSpec(tag)}
                  className={`text-xs font-semibold px-3.5 py-2 rounded-xl border transition cursor-pointer ${
                    isSelected 
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm' 
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
                  id={`btn-spec-toggle-${tag}`}
                >
                  {tag}
                </button>
              );
            })}
          </div>
        </div>

        {/* Submit */}
        <div className="pt-4 border-t border-slate-100 flex justify-end">
          <button
            type="submit"
            className="bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-bold text-xs px-6 py-3 rounded-xl transition shadow-md shadow-indigo-100 flex items-center gap-2 cursor-pointer"
            id="btn-edit-profile-submit"
          >
            <Save className="h-4 w-4" />
            <span>Guardar Ajustes y Publicar</span>
          </button>
        </div>

      </form>
    </div>
  );
};
