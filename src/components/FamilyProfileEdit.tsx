/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, type FC } from 'react';
import { useApp } from '../context/AppContext';
import { User, Phone, MapPin, Save, CheckCircle2 } from 'lucide-react';

export const FamilyProfileEdit: FC = () => {
  const { currentUser, updateProfile } = useApp();
  const [fullName, setFullName] = useState(currentUser?.full_name || '');
  const [phone, setPhone] = useState(currentUser?.phone || '');
  const [locationName, setLocationName] = useState(currentUser?.location_name || '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  if (!currentUser) {
    return <div className="p-6 text-center text-slate-500 text-sm">Inicia sesión para editar tu perfil.</div>;
  }

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    await updateProfile({
      full_name: fullName,
      phone,
      location_name: locationName,
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-bold text-slate-800">Mi Perfil</h2>
        <p className="text-xs text-slate-500 mt-0.5">Actualiza tus datos de contacto</p>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
        {/* Full name */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-slate-600 flex items-center gap-1.5">
            <User className="h-3.5 w-3.5" />
            Nombre completo
          </label>
          <input
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
            placeholder="Tu nombre"
          />
        </div>

        {/* Phone */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-slate-600 flex items-center gap-1.5">
            <Phone className="h-3.5 w-3.5" />
            Teléfono / WhatsApp
          </label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
            placeholder="7777-7777"
          />
          <p className="text-[10px] text-slate-400">El administrador usará este número para contactarte por WhatsApp.</p>
        </div>

        {/* Location */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-slate-600 flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5" />
            Ubicación
          </label>
          <input
            type="text"
            value={locationName}
            onChange={(e) => setLocationName(e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
            placeholder="Colonia, ciudad o zona"
          />
          <p className="text-[10px] text-slate-400">Nos ayuda a encontrar enfermeras cercanas.</p>
        </div>

        {/* Save button */}
        <div className="flex items-center gap-3 pt-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-300 text-white font-bold text-sm px-5 py-2.5 rounded-xl transition cursor-pointer"
          >
            <Save className="h-4 w-4" />
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
          {saved && (
            <span className="flex items-center gap-1 text-xs font-bold text-emerald-600">
              <CheckCircle2 className="h-4 w-4" />
              Cambios guardados
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
