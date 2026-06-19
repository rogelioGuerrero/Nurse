/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { getCachedCareTip, CareTip } from '../lib/groq';
import { Lightbulb, RefreshCw, AlertCircle, Heart, UtensilsCrossed, Shield, Pill, Users } from 'lucide-react';

const categoryIcons = {
  nutrition: UtensilsCrossed,
  safety: Shield,
  wellness: Heart,
  medication: Pill,
  social: Users
};

const categoryColors = {
  nutrition: 'bg-orange-50 text-orange-700 border-orange-200',
  safety: 'bg-red-50 text-red-700 border-red-200',
  wellness: 'bg-green-50 text-green-700 border-green-200',
  medication: 'bg-blue-50 text-blue-700 border-blue-200',
  social: 'bg-purple-50 text-purple-700 border-purple-200'
};

const categoryLabels = {
  nutrition: 'Nutrición',
  safety: 'Seguridad',
  wellness: 'Bienestar',
  medication: 'Medicación',
  social: 'Social'
};

export default function CareAdvice() {
  const [tip, setTip] = useState<CareTip | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadTip = async (forceRefresh = false) => {
    try {
      if (forceRefresh) {
        // Clear cache to force refresh
        localStorage.removeItem('care_tip_cache');
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);
      const newTip = await getCachedCareTip();
      setTip(newTip);
    } catch (err: any) {
      setError(err.message || 'Error al cargar el consejo');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadTip();
  }, []);

  const CategoryIcon = tip ? categoryIcons[tip.category] : Lightbulb;

  if (loading) {
    return (
      <div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-2xl p-6 border border-indigo-100">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-indigo-100 rounded-xl flex items-center justify-center animate-pulse">
            <Lightbulb className="h-6 w-6 text-indigo-600" />
          </div>
          <div className="flex-1">
            <div className="h-4 bg-indigo-200 rounded animate-pulse w-1/3 mb-2"></div>
            <div className="h-3 bg-indigo-100 rounded animate-pulse w-full"></div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-gradient-to-br from-orange-50 to-amber-50 rounded-2xl p-6 border border-orange-100">
        <div className="flex items-start gap-3">
          <div className="w-12 h-12 bg-orange-100 rounded-xl flex items-center justify-center flex-shrink-0">
            <AlertCircle className="h-6 w-6 text-orange-600" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-orange-900 mb-1">Consejo del día</h3>
            <p className="text-sm text-orange-700 mb-3">
              {error}
            </p>
            <button
              onClick={() => loadTip()}
              className="text-sm font-medium text-orange-600 hover:text-orange-700 flex items-center gap-1"
            >
              <RefreshCw className="h-4 w-4" />
              Reintentar
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!tip) return null;

  return (
    <div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-2xl p-6 border border-indigo-100 hover:shadow-md transition-shadow">
      <div className="flex items-start gap-4">
        <div className="w-14 h-14 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-lg shadow-indigo-200">
          <span className="text-2xl">{tip.icon}</span>
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <span className={`px-2 py-1 rounded-full text-xs font-medium border ${categoryColors[tip.category]}`}>
              {categoryLabels[tip.category]}
            </span>
            <button
              onClick={() => loadTip(true)}
              disabled={refreshing}
              className="p-1 hover:bg-white rounded-lg transition-colors disabled:opacity-50"
              title="Obtener nuevo consejo"
            >
              <RefreshCw className={`h-4 w-4 text-indigo-600 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>
          
          <h3 className="font-bold text-lg text-gray-900 mb-2">{tip.title}</h3>
          <p className="text-sm text-gray-700 leading-relaxed">{tip.content}</p>
        </div>
      </div>
    </div>
  );
}
