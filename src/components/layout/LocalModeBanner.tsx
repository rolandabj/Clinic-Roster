import React, { useState } from 'react';
import { Database, ArrowRight, X } from 'lucide-react';

interface LocalModeBannerProps {
  onNavigateToSettings: () => void;
}

export const LocalModeBanner: React.FC<LocalModeBannerProps> = ({ onNavigateToSettings }) => {
  const [isDismissed, setIsDismissed] = useState<boolean>(() => {
    return localStorage.getItem('clinic_roster_dismiss_local_banner') === 'true';
  });

  if (isDismissed) return null;

  const handleDismiss = () => {
    setIsDismissed(true);
    localStorage.setItem('clinic_roster_dismiss_local_banner', 'true');
  };

  return (
    <div className="bg-slate-900 text-slate-100 text-xs py-2 px-4 flex items-center justify-between border-b border-slate-800 transition-colors">
      <div className="flex items-center gap-2.5">
        <span className="flex h-2 w-2 rounded-full bg-emerald-400 ring-2 ring-emerald-400/30" />
        <span className="text-slate-300">
          <strong className="text-white font-medium">Local mode</strong> — add Firebase config in Settings → Integrations to enable Google login, sharing &amp; email. All roster building &amp; engine features work locally.
        </span>
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={onNavigateToSettings}
          className="inline-flex items-center gap-1 font-medium text-indigo-400 hover:text-indigo-300 transition-colors text-xs cursor-pointer"
        >
          <span>Open Integrations</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={handleDismiss}
          title="Dismiss banner"
          className="text-slate-400 hover:text-slate-200 transition-colors p-1 rounded hover:bg-slate-800 cursor-pointer"
          aria-label="Dismiss banner"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
