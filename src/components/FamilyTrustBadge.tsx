import { type FC } from 'react';
import { Star, ShieldCheck, Phone } from 'lucide-react';
import type { FamilyReview, Profile } from '../types';

interface FamilyTrustBadgeProps {
  familyProfile?: Profile;
  familyReviews: FamilyReview[];
  variant?: 'compact' | 'full';
}

export const FamilyTrustBadge: FC<FamilyTrustBadgeProps> = ({ familyProfile, familyReviews, variant = 'compact' }) => {
  if (!familyProfile) return null;

  const reviews = familyReviews.filter(r => r.user_id === familyProfile.id);
  const reviewCount = reviews.length;
  const avgRating = reviewCount > 0 ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviewCount : 0;
  const hasPhone = !!familyProfile.phone && familyProfile.phone.length >= 8;

  if (variant === 'compact') {
    return (
      <div className="flex items-center gap-1.5 flex-wrap">
        {reviewCount > 0 ? (
          <span className="inline-flex items-center gap-0.5 bg-emerald-50 text-emerald-700 text-[9px] font-bold px-1.5 py-0.5 rounded-full border border-emerald-100">
            <ShieldCheck className="h-2.5 w-2.5" />
            {avgRating.toFixed(1)}★ ({reviewCount})
          </span>
        ) : hasPhone ? (
          <span className="inline-flex items-center gap-0.5 bg-sky-50 text-sky-700 text-[9px] font-bold px-1.5 py-0.5 rounded-full border border-sky-100">
            <Phone className="h-2.5 w-2.5" />
            Verificada
          </span>
        ) : (
          <span className="inline-flex items-center gap-0.5 bg-slate-50 text-slate-500 text-[9px] font-bold px-1.5 py-0.5 rounded-full border border-slate-100">
            Sin verificar
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="bg-slate-50 rounded-xl p-3 space-y-2">
      <div className="flex items-center gap-1.5">
        <ShieldCheck className="h-4 w-4 text-emerald-600" />
        <span className="text-xs font-bold text-slate-700">Confianza de la familia</span>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        {hasPhone ? (
          <span className="inline-flex items-center gap-1 bg-sky-50 text-sky-700 text-[10px] font-bold px-2 py-1 rounded-full border border-sky-100">
            <Phone className="h-3 w-3" />
            Teléfono verificado
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-500 text-[10px] font-bold px-2 py-1 rounded-full">
            Sin teléfono
          </span>
        )}
        {reviewCount > 0 ? (
          <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 text-[10px] font-bold px-2 py-1 rounded-full border border-emerald-100">
            <Star className="h-3 w-3 fill-emerald-500 text-emerald-500" />
            {avgRating.toFixed(1)} · {reviewCount} reseña{reviewCount !== 1 ? 's' : ''}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 text-[10px] font-bold px-2 py-1 rounded-full border border-amber-100">
            Sin reseñas aún
          </span>
        )}
      </div>
      {reviewCount > 0 && reviews.slice(-2).reverse().map((r, i) => (
        <div key={i} className="text-[10px] text-slate-600 italic border-l-2 border-slate-200 pl-2">
          {r.comment ? `"${r.comment}"` : `Calificación: ${r.rating}/5`}
        </div>
      ))}
    </div>
  );
};
