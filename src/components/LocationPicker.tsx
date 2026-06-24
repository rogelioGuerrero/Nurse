/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, type FC } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Crosshair, Loader2, MapPin, CheckCircle2 } from 'lucide-react';

// Fix default marker icon for Leaflet in bundlers
delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

interface LocationPickerProps {
  initialLat?: number;
  initialLng?: number;
  initialAddress?: string;
  onLocationChange: (lat: number, lng: number, address: string) => void;
}

// Component to recenter map when coords change
const Recenter: FC<{ lat: number; lng: number }> = ({ lat, lng }) => {
  const map = useMap();
  useEffect(() => {
    map.setView([lat, lng], 16);
  }, [lat, lng, map]);
  return null;
};

// Component to handle map clicks
const ClickHandler: FC<{ onPick: (lat: number, lng: number) => void }> = ({ onPick }) => {
  useMapEvents({
    click(e) {
      onPick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
};

export const LocationPicker: FC<LocationPickerProps> = ({
  initialLat,
  initialLng,
  initialAddress,
  onLocationChange,
}) => {
  const [lat, setLat] = useState(initialLat ?? 13.6762);
  const [lng, setLng] = useState(initialLng ?? -89.2356);
  const [address, setAddress] = useState(initialAddress || '');
  const [locating, setLocating] = useState(false);
  const [hasPin, setHasPin] = useState(!!initialLat && !!initialLng);

  const reverseGeocode = async (latitude: number, longitude: number) => {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=16&addressdetails=1`,
        { headers: { 'Accept-Language': 'es' } }
      );
      const data = await res.json();
      const addr = data.address || {};
      const parts = [
        addr.road || addr.neighbourhood,
        addr.suburb || addr.city_district,
        addr.city || addr.town || addr.village || addr.municipality,
      ].filter(Boolean);
      return parts.join(', ') || data.display_name?.split(',').slice(0, 3).join(',') || `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
    } catch {
      return `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
    }
  };

  const updateLocation = async (latitude: number, longitude: number) => {
    setLat(latitude);
    setLng(longitude);
    setHasPin(true);
    setLocating(true);
    const name = await reverseGeocode(latitude, longitude);
    setAddress(name);
    setLocating(false);
    onLocationChange(latitude, longitude, name);
  };

  const handleGps = () => {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => updateLocation(pos.coords.latitude, pos.coords.longitude),
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleMapClick = (clickedLat: number, clickedLng: number) => {
    updateLocation(clickedLat, clickedLng);
  };

  const handleDragEnd = (e: L.DragEndEvent) => {
    const marker = e.target as L.Marker;
    const pos = marker.getLatLng();
    updateLocation(pos.lat, pos.lng);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <button
          onClick={handleGps}
          disabled={locating}
          className="flex-shrink-0 px-3 py-2.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 rounded-xl transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
        >
          {locating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Crosshair className="h-4 w-4" />}
          <span className="text-xs font-bold">Usar mi ubicación</span>
        </button>
        {hasPin && !locating && (
          <span className="text-[10px] text-emerald-600 font-bold flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3" />
            Ubicación confirmada
          </span>
        )}
      </div>

      <div className="relative rounded-xl overflow-hidden border border-slate-200" style={{ height: 280 }}>
        <MapContainer
          center={[lat, lng]}
          zoom={16}
          style={{ height: '100%', width: '100%' }}
          scrollWheelZoom={false}
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; OpenStreetMap'
          />
          {hasPin && (
            <Marker
              position={[lat, lng]}
              draggable
              eventHandlers={{ dragend: handleDragEnd }}
            />
          )}
          <ClickHandler onPick={handleMapClick} />
          <Recenter lat={lat} lng={lng} />
        </MapContainer>
        {!hasPin && (
          <div className="absolute inset-0 bg-white/70 flex items-center justify-center pointer-events-none">
            <div className="text-center px-4">
              <MapPin className="h-8 w-8 text-slate-400 mx-auto mb-2" />
              <p className="text-xs font-semibold text-slate-600">Toca el mapa o usa GPS para colocar el pin</p>
            </div>
          </div>
        )}
      </div>

      {address && (
        <div className="flex items-start gap-1.5 text-xs text-slate-600 bg-slate-50 rounded-lg p-2.5">
          <MapPin className="h-3.5 w-3.5 text-indigo-500 flex-shrink-0 mt-0.5" />
          <span className="font-medium">{address}</span>
        </div>
      )}

      <p className="text-[10px] text-slate-400">
        Arrastra el pin o toca el mapa para ajustar la posición exacta.
      </p>
    </div>
  );
};
