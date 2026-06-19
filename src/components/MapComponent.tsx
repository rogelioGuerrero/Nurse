/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { Nurse, Profile } from '../types';
import { useApp } from '../context/AppContext';
import { MapPin, Navigation, Eye, ZoomIn, ZoomOut, Compass, DollarSign, Calendar } from 'lucide-react';

interface MapComponentProps {
  filteredNurses: Nurse[];
  maxRate: number;
  selectedSpecialization: string;
}

export const MapComponent: React.FC<MapComponentProps> = ({ 
  filteredNurses, 
  maxRate, 
  selectedSpecialization 
}) => {
  const { profiles, selectedNurseId, setSelectedNurseId, setSelectedNurseId: appSelectNurse, setActiveTab } = useApp();
  const [filterRadius, setFilterRadius] = useState<number>(10); // user filter radius in km
  const [mapCenter, setMapCenter] = useState({ lat: 13.7942, lng: -88.8965 }); // El Salvador center

  // Min and Max bounds of operational zone
  const bounds = {
    minLat: 13.0000,
    maxLat: 14.5000,
    minLng: -90.0000,
    maxLng: -87.5000,
  };

  // Convert real geographic Latitude and Longitude to SVG space dimensions (w:800, h:600)
  const coordsToSvg = (lat: number, lng: number) => {
    const latSpan = bounds.maxLat - bounds.minLat;
    const lngSpan = bounds.maxLng - bounds.minLng;

    // Normalize (0 to 1)
    const yRatio = (lat - bounds.minLat) / latSpan;
    const xRatio = (lng - bounds.minLng) / lngSpan;

    // Map to width=700 (with 50px margins) and height=500 (with 50px margins)
    const x = 50 + xRatio * 700;
    const y = 550 - yRatio * 500; // invert Y since 0 is top in SVG

    return { x, y };
  };

  // User location pin (center of family query)
  const userCoords = { lat: 19.4100, lng: -99.1800 }; // Condesa area
  const userSvg = coordsToSvg(userCoords.lat, userCoords.lng);

  // Calculate distance between coordinates in KM (Haversine formula representation)
  const getDistanceKm = (lat1: number, lng1: number, lat2: number, lng2: number) => {
    const R = 6371; // Earth Radius
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
      Math.sin(dLng/2) * Math.sin(dLng/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  };

  // Map each nurse with coordinates, profiles and relative distance to user coords
  const mapItems = useMemo(() => {
    return filteredNurses.map(nurse => {
      const profile = profiles.find(p => p.id === nurse.user_id);
      const svg = coordsToSvg(nurse.lat, nurse.lng);
      const distance = getDistanceKm(userCoords.lat, userCoords.lng, nurse.lat, nurse.lng);
      const isWithinRadius = distance <= filterRadius;

      return {
        nurse,
        profile,
        svg,
        distance: parseFloat(distance.toFixed(1)),
        isWithinRadius
      };
    });
  }, [filteredNurses, profiles, filterRadius]);

  const handleNurseSelect = (nurseId: string) => {
    setSelectedNurseId(nurseId);
  };

  const handleInspectNurse = (nurseId: string) => {
    setSelectedNurseId(nurseId);
    setActiveTab('nurse-detail');
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden flex flex-col h-full" id="map-component-root">
      
      {/* Dynamic Controls Header */}
      <div className="p-4 bg-slate-50 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="font-semibold text-slate-800 text-sm flex items-center gap-2">
            <Compass className="h-4 w-4 text-indigo-600 animate-spin-slow" />
            Radio de Cobertura y Distancias
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Ajusta el radio para identificar enfermeras dentro de tu cobertura de servicio.
          </p>
        </div>

        {/* Radius Slider Control */}
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold text-slate-600 shrink-0">Filtro de Radio:</span>
          <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border border-slate-200">
            <input 
              type="range" 
              min="2" 
              max="15" 
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

      {/* Main Map Box */}
      <div className="relative flex-1 bg-slate-900 overflow-hidden min-h-[380px] md:min-h-[460px] select-none">
        
        {/* Decorative Grid and Landscapes using SVG */}
        <svg 
          viewBox="0 0 800 600" 
          className="absolute inset-0 w-full h-full object-cover"
          xmlns="http://www.w3.org/2000/svg"
          id="svg-map-canvas"
        >
          {/* Subtle Grid Network */}
          <defs>
            <pattern id="city-grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(255, 255, 255, 0.04)" strokeWidth="1" />
            </pattern>
          </defs>
          <rect width="800" height="600" fill="#0f172a" />
          <rect width="800" height="600" fill="url(#city-grid)" />

          {/* Environmental Geometries (Simulated Landmarks) */}
          {/* Paseo de la Reforma Avenue */}
          <path 
            d="M 50 180 L 350 280 L 550 350 L 750 420" 
            fill="none" 
            stroke="rgba(255, 255, 255, 0.08)" 
            strokeWidth="24" 
            strokeLinecap="round"
          />
          <path 
            d="M 50 180 L 350 280 L 550 350 L 750 420" 
            fill="none" 
            stroke="#1e293b" 
            strokeWidth="8" 
            strokeLinecap="round"
          />

          {/* Avenida Insurgentes Avenue */}
          <path 
            d="M 450 50 L 410 250 L 380 400 L 320 550" 
            fill="none" 
            stroke="rgba(255, 255, 255, 0.08)" 
            strokeWidth="22" 
            strokeLinecap="round"
          />
          <path 
            d="M 450 50 L 410 250 L 380 400 L 320 550" 
            fill="none" 
            stroke="#1e293b" 
            strokeWidth="6" 
            strokeLinecap="round"
          />

          {/* Chapultepec Green Forest Zone (Polanco Side) */}
          <path 
            d="M 120 220 Q 180 200 220 260 T 160 380 Z" 
            fill="rgba(16, 185, 129, 0.07)" 
            stroke="rgba(16, 185, 129, 0.15)" 
            strokeWidth="2"
          />
          <text x="140" y="290" fill="rgba(16, 185, 129, 0.4)" className="text-[10px] font-semibold tracking-wider italic fill-emerald-500">
            Bosque Chapultepec
          </text>

          {/* Coyoacán Historic Green Hub */}
          <circle 
            cx="390" 
            cy="460" 
            r="45" 
            fill="rgba(16, 185, 129, 0.05)" 
            stroke="rgba(16, 185, 129, 0.12)" 
            strokeWidth="1.5"
          />
          <text x="360" y="465" fill="rgba(16, 185, 129, 0.4)" className="text-[10px] font-semibold tracking-wider italic fill-emerald-500">
            Coyoacán Centro
          </text>

          {/* Area Labels */}
          <text x="180" y="150" fill="rgba(255, 255, 255, 0.15)" className="text-[11px] font-bold tracking-widest uppercase">POLANCO</text>
          <text x="320" y="210" fill="rgba(255, 255, 255, 0.15)" className="text-[11px] font-bold tracking-widest uppercase">CONDESA</text>
          <text x="480" y="270" fill="rgba(255, 255, 255, 0.15)" className="text-[11px] font-bold tracking-widest uppercase">ROMA NORTE</text>
          <text x="490" y="380" fill="rgba(255, 255, 255, 0.15)" className="text-[11px] font-bold tracking-widest uppercase">DEL VALLE</text>

          {/* USER COVERAGE RADAR CIRCLE */}
          {/* Converts the selected KM value to proportional SVG radius pixels (1 Km = approx 16px) */}
          <circle 
            cx={userSvg.x} 
            cy={userSvg.y} 
            r={filterRadius * 16} 
            fill="rgba(99, 102, 241, 0.04)" 
            stroke="rgba(99, 102, 241, 0.35)" 
            strokeWidth="1.5" 
            strokeDasharray="4 3"
            className="transition-all duration-300"
          />
          <circle 
            cx={userSvg.x} 
            cy={userSvg.y} 
            r="12" 
            fill="rgba(99, 102, 241, 0.2)" 
          />
          <circle 
            cx={userSvg.x} 
            cy={userSvg.y} 
            r="4" 
            fill="#6366f1" 
          />

          {/* Dynamic Lines linking User to Highlighted Nurse */}
          {mapItems.map(item => {
            const isSelected = selectedNurseId === item.nurse.id;
            if (!isSelected) return null;
            return (
              <g key={`line-${item.nurse.id}`}>
                <line 
                  x1={userSvg.x} 
                  y1={userSvg.y} 
                  x2={item.svg.x} 
                  y2={item.svg.y} 
                  stroke={item.isWithinRadius ? "#10b981" : "#ef4444"} 
                  strokeWidth="1.5" 
                  strokeDasharray="2 3"
                  className="animate-pulse"
                />
                <circle 
                  cx={item.svg.x} 
                  cy={item.svg.y} 
                  r={item.nurse.coverage_radius * 16} 
                  fill="rgba(16, 185, 129, 0.01)" 
                  stroke="rgba(16, 185, 129, 0.15)" 
                  strokeWidth="1"
                />
              </g>
            );
          })}

          {/* NURSE PINS LAYER */}
          {mapItems.map(item => {
            const isSelected = selectedNurseId === item.nurse.id;
            const pinColor = item.isWithinRadius ? 'fill-indigo-500' : 'fill-slate-500';
            const ringColor = item.isWithinRadius ? 'stroke-indigo-400' : 'stroke-slate-400';

            return (
              <g 
                key={item.nurse.id} 
                className="cursor-pointer group"
                onClick={() => handleNurseSelect(item.nurse.id)}
              >
                {/* Active selection wave animation */}
                {isSelected && (
                  <>
                    <circle 
                      cx={item.svg.x} 
                      cy={item.svg.y} 
                      r="22" 
                      fill="none" 
                      stroke="#818cf8" 
                      strokeWidth="2" 
                      className="animate-ping origin-center"
                    />
                    <circle 
                      cx={item.svg.x} 
                      cy={item.svg.y} 
                      r="12" 
                      fill="rgba(99, 102, 241, 0.25)" 
                    />
                  </>
                )}

                {/* Pin hover ring scale effect */}
                <circle 
                  cx={item.svg.x} 
                  cy={item.svg.y} 
                  r="14" 
                  fill="none" 
                  stroke="transparent" 
                  className="group-hover:stroke-white/30 group-hover:r-[16px] transition-all duration-200" 
                  strokeWidth="2"
                />

                {/* Pin Head */}
                <path 
                  d={`M ${item.svg.x} ${item.svg.y} m 0 -13 
                      c -5 0 -9 4 -9 9 
                      c 0 5.5 9 14 9 14 
                      s 9 -8.5 9 -14 
                      c 0 -5 -4 -9 -9 -9 z`} 
                  className={`${pinColor} transition-all duration-300 transform group-hover:scale-110 origin-bottom`}
                />
                
                {/* Visual Pin Center Spot */}
                <circle 
                  cx={item.svg.x} 
                  cy={item.svg.y - 4} 
                  r="3" 
                  fill="#ffffff" 
                />
              </g>
            );
          })}
        </svg>

        {/* Home target label badge */}
        <div className="absolute top-4 left-4 bg-slate-900/90 backdrop-blur-md px-3.5 py-1.5 rounded-xl border border-slate-700/60 shadow-lg text-white flex items-center gap-2 text-xs">
          <div className="h-2 w-2 rounded-full bg-indigo-500 animate-pulse" />
          <span className="font-semibold text-slate-200">Tu Ubicación (Condesa)</span>
        </div>

        {/* Small Compass Indicator */}
        <div className="absolute right-4 top-4 bg-slate-900/80 p-2 border border-slate-700/50 rounded-xl text-slate-400">
          <Navigation className="h-5 w-5 transform rotate-45 select-none" />
        </div>

        {/* Active Nurse Popup Overlay (when selected) */}
        {mapItems.map(item => {
          if (selectedNurseId !== item.nurse.id || !item.profile) return null;
          return (
            <div 
              key={`overlay-${item.nurse.id}`}
              className="absolute bottom-4 left-4 right-4 bg-white/95 backdrop-blur-md rounded-2xl p-4 border border-slate-200/90 shadow-xl flex gap-3.5 items-center justify-between text-slate-900 transition-all duration-300 animate-fade-in"
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
                    US$ {item.nurse.hourly_rate}/Hr <span className="text-slate-400 font-normal">| {item.distance} km de distancia</span>
                  </p>
                </div>
              </div>

              {/* Action Triggers */}
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

      {/* Map Legend Footer */}
      <div className="p-3 bg-slate-50 border-t border-slate-100 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px] text-slate-500 text-center font-medium">
        <div className="flex items-center justify-center gap-1.5 bg-white py-1 px-2 rounded-lg border border-slate-200">
          <div className="h-2.5 w-2.5 rounded-full bg-indigo-500" />
          <span>Enfermera en Rango</span>
        </div>
        <div className="flex items-center justify-center gap-1.5 bg-white py-1 px-2 rounded-lg border border-slate-200">
          <div className="h-2.5 w-2.5 rounded-full bg-slate-500" />
          <span>Fuera de Cobertura</span>
        </div>
        <div className="flex items-center justify-center gap-1.5 bg-white py-1 px-2 rounded-lg border border-slate-200">
          <div className="h-2 w-2 rounded-full bg-indigo-600" />
          <span>Tu Ubicación (Centro)</span>
        </div>
        <div className="flex items-center justify-center gap-1.5 bg-white py-1 px-2 rounded-lg border border-slate-200">
          <div className="h-1.5 w-4 bg-indigo-500/20 border-t border-b border-indigo-400" />
          <span>Tu Radio de Alerta</span>
        </div>
      </div>
    </div>
  );
};
