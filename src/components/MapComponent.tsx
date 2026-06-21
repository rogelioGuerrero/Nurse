import { useState, useMemo, useEffect } from 'react';
import { MapContainer, TileLayer, Circle, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { Nurse } from '../types';
import { useApp } from '../context/AppContext';
import { getDistanceKm, USER_COORDS } from '../lib/distance';
import { Compass, Eye, Navigation } from 'lucide-react';
import 'leaflet/dist/leaflet.css';

interface MapComponentProps {
  filteredNurses: Nurse[];
}

const userIcon = L.divIcon({
  className: 'custom-div-icon',
  html: `<div style="background:#6366f1;width:16px;height:16px;border-radius:50%;border:3px solid white;box-shadow:0 0 8px rgba(99,102,241,0.6);"></div>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

const nurseIcon = (isWithinRadius: boolean) => L.divIcon({
  className: 'custom-div-icon',
  html: `<div style="background:${isWithinRadius ? '#6366f1' : '#94a3b8'};width:14px;height:14px;border-radius:50%;border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.3);"></div>`,
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

const nurseIconSelected = L.divIcon({
  className: 'custom-div-icon',
  html: `<div style="background:#6366f1;width:20px;height:20px;border-radius:50%;border:3px solid white;box-shadow:0 0 12px rgba(99,102,241,0.8);"></div>`,
  iconSize: [20, 20],
  iconAnchor: [10, 10],
});

function MapResizer() {
  const map = useMap();
  useEffect(() => {
    setTimeout(() => map.invalidateSize(), 100);
  }, [map]);
  return null;
}

export const MapComponent = ({ filteredNurses }: MapComponentProps) => {
  const { profiles, selectedNurseId, setSelectedNurseId, setActiveTab } = useApp();
  const [filterRadius, setFilterRadius] = useState<number>(10);

  // O(1) profile lookup
  const profileMap = useMemo(() => {
    const map = new Map<string, typeof profiles[number]>();
    profiles.forEach(p => map.set(p.id, p));
    return map;
  }, [profiles]);

  const mapItems = useMemo(() => {
    return filteredNurses.map(nurse => {
      const profile = profileMap.get(nurse.user_id);
      const distance = getDistanceKm(USER_COORDS.lat, USER_COORDS.lng, nurse.lat, nurse.lng);
      const isWithinRadius = distance <= filterRadius;

      return {
        nurse,
        profile,
        distance: parseFloat(distance.toFixed(1)),
        isWithinRadius
      };
    });
  }, [filteredNurses, profileMap, filterRadius]);

  const handleInspectNurse = (nurseId: string) => {
    setSelectedNurseId(nurseId);
    setActiveTab('nurse-detail');
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden flex flex-col h-full" id="map-component-root">
      
      <div className="p-4 bg-slate-50 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="font-semibold text-slate-800 text-sm flex items-center gap-2">
            <Compass className="h-4 w-4 text-indigo-600" />
            Radio de Cobertura y Distancias
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Ajusta el radio para identificar enfermeras dentro de tu cobertura.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold text-slate-600 shrink-0">Radio:</span>
          <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border border-slate-200">
            <input 
              type="range" 
              min="2" 
              max="50" 
              step="1"
              value={filterRadius}
              onChange={(e) => setFilterRadius(Number(e.target.value))}
              className="w-24 sm:w-32 accent-indigo-600 cursor-pointer h-1.5"
              id="input-range-radius"
            />
            <span className="text-xs font-bold text-indigo-600 min-w-[42px] text-right">
              {filterRadius} km
            </span>
          </div>
        </div>
      </div>

      <div className="relative flex-1 min-h-[380px] md:min-h-[460px]">
        <MapContainer
          center={[USER_COORDS.lat, USER_COORDS.lng]}
          zoom={12}
          scrollWheelZoom={false}
          style={{ height: '100%', width: '100%', zIndex: 0 }}
        >
          <MapResizer />
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; OpenStreetMap'
          />

          <Circle
            center={[USER_COORDS.lat, USER_COORDS.lng]}
            radius={filterRadius * 1000}
            pathOptions={{
              color: '#0d9488',
              fillColor: '#0d9488',
              fillOpacity: 0.05,
              dashArray: '4 3',
            }}
          />

          <Marker position={[USER_COORDS.lat, USER_COORDS.lng]} icon={userIcon}>
            <Popup>
              <strong>Tu ubicacion</strong><br />San Salvador, El Salvador
            </Popup>
          </Marker>

          {mapItems.map(item => {
            const isSelected = selectedNurseId === item.nurse.id;
            const icon = isSelected ? nurseIconSelected : nurseIcon(item.isWithinRadius);

            return (
              <Marker
                key={item.nurse.id}
                position={[item.nurse.lat, item.nurse.lng]}
                icon={icon}
                eventHandlers={{
                  click: () => setSelectedNurseId(item.nurse.id),
                }}
              >
                <Popup>
                  <div style={{ minWidth: '180px' }}>
                    {item.profile && (
                      <img
                        src={item.profile.avatar_url}
                        alt={item.profile.full_name}
                        style={{ width: '40px', height: '40px', borderRadius: '8px', objectFit: 'cover', marginBottom: '6px' }}
                      />
                    )}
                    <strong>{item.profile?.full_name}</strong><br />
                    <span style={{ fontSize: '11px', color: '#666' }}>
                      {item.nurse.specialization.join(', ')}
                    </span><br />
                    <span style={{ fontSize: '12px', color: '#0d9488', fontWeight: 'bold' }}>
                      US$ {item.nurse.shift_rate}/turno
                    </span>
                    <span style={{ fontSize: '11px', color: '#999' }}> | {item.distance} km</span><br />
                    {item.isWithinRadius ? (
                      <span style={{ fontSize: '10px', color: '#059669', fontWeight: 'bold' }}>En rango</span>
                    ) : (
                      <span style={{ fontSize: '10px', color: '#e11d48', fontWeight: 'bold' }}>Fuera de rango</span>
                    )}
                  </div>
                </Popup>
              </Marker>
            );
          })}
        </MapContainer>

        <div className="absolute top-3 left-3 bg-white/95 backdrop-blur-md px-3 py-1.5 rounded-xl border border-slate-200 shadow-lg text-slate-700 flex items-center gap-2 text-xs z-[400]">
          <div className="h-2 w-2 rounded-full bg-indigo-500 animate-pulse" />
          <span className="font-semibold">San Salvador, El Salvador</span>
        </div>

        <div className="absolute right-3 top-3 bg-white/95 p-2 border border-slate-200 rounded-xl text-slate-400 shadow-lg z-[400]">
          <Navigation className="h-5 w-5 transform rotate-45 select-none" />
        </div>

        {mapItems.map(item => {
          if (selectedNurseId !== item.nurse.id || !item.profile) return null;
          return (
            <div 
              key={`overlay-${item.nurse.id}`}
              className="absolute bottom-3 left-3 right-3 bg-white/95 backdrop-blur-md rounded-2xl p-4 border border-slate-200 shadow-xl flex gap-3.5 items-center justify-between text-slate-900 z-[400] animate-fade-in"
              id={`map-overlay-${item.nurse.id}`}
            >
              <div className="flex items-center gap-3">
                <img 
                  src={item.profile.avatar_url} 
                  alt={item.profile.full_name} 
                  className="w-12 h-12 rounded-xl object-cover border border-slate-200"
                  referrerPolicy="no-referrer"
                />
                <div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <h4 className="font-bold text-slate-800 text-sm leading-tight">{item.profile.full_name}</h4>
                    {item.isWithinRadius ? (
                      <span className="bg-emerald-50 text-emerald-700 text-[10px] font-semibold px-2 py-0.5 rounded-full border border-emerald-100">
                        En Rango
                      </span>
                    ) : (
                      <span className="bg-rose-50 text-rose-700 text-[10px] font-semibold px-2 py-0.5 rounded-full border border-rose-100">
                        Fuera de Rango ({item.distance} km)
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 font-medium truncate max-w-[170px] sm:max-w-xs">
                    {item.nurse.specialization.join(', ')}
                  </p>
                  <p className="text-xs text-indigo-600 font-bold mt-0.5">
                    US$ {item.nurse.shift_rate}/turno <span className="text-slate-400 font-normal">| {item.distance} km</span>
                  </p>
                </div>
              </div>

              <button 
                onClick={() => handleInspectNurse(item.nurse.id)}
                className="bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white text-xs font-bold px-3.5 py-2 rounded-xl transition flex items-center gap-1.5"
                id="btn-inspect-nurse-map"
              >
                <Eye className="h-3.5 w-3.5" />
                <span>Ver Perfil</span>
              </button>
            </div>
          );
        })}
      </div>

      <div className="p-3 bg-slate-50 border-t border-slate-100 grid grid-cols-2 sm:grid-cols-3 gap-2 text-[10px] text-slate-500 text-center font-medium">
        <div className="flex items-center justify-center gap-1.5 bg-white py-1 px-2 rounded-lg border border-slate-200">
          <div className="h-2.5 w-2.5 rounded-full bg-indigo-500" />
          <span>Enfermera en Rango</span>
        </div>
        <div className="flex items-center justify-center gap-1.5 bg-white py-1 px-2 rounded-lg border border-slate-200">
          <div className="h-2.5 w-2.5 rounded-full bg-slate-400" />
          <span>Fuera de Cobertura</span>
        </div>
        <div className="flex items-center justify-center gap-1.5 bg-white py-1 px-2 rounded-lg border border-slate-200">
          <div className="h-2 w-2 rounded-full bg-indigo-600" />
          <span>Tu Ubicacion</span>
        </div>
      </div>
    </div>
  );
};
