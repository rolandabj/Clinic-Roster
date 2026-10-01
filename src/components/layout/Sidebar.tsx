import React, { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  CalendarRange,
  CalendarCheck2,
  Users,
  Stethoscope,
  History,
  Send,
  BarChart3,
  Settings,
  Activity,
  ShieldCheck,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import { AppRoute, NavItem } from '../../types/navigation';
import { i18n, t, Language } from '../../services/i18n';

interface SidebarProps {
  currentRoute: AppRoute;
  onNavigate: (route: AppRoute) => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export const NAV_ITEMS: { id: AppRoute; labelKey: string; defaultLabel: string; icon: React.ElementType; badge?: string }[] = [
  { id: 'dashboard', labelKey: 'nav.dashboard', defaultLabel: 'Dashboard', icon: LayoutDashboard },
  { id: 'schedules', labelKey: 'nav.schedules', defaultLabel: 'Schedules', icon: CalendarRange, badge: 'Grid' },
  { id: 'availability', labelKey: 'nav.availability', defaultLabel: 'Availability', icon: CalendarCheck2 },
  { id: 'nurses', labelKey: 'nav.nurses', defaultLabel: 'Nurses', icon: Users },
  { id: 'doctors', labelKey: 'nav.doctors', defaultLabel: 'Doctors', icon: Stethoscope },
  { id: 'history', labelKey: 'nav.history', defaultLabel: 'History', icon: History },
  { id: 'publish', labelKey: 'nav.publish', defaultLabel: 'Publish', icon: Send },
  { id: 'reports', labelKey: 'nav.reports', defaultLabel: 'Reports', icon: BarChart3 },
  { id: 'audit', labelKey: 'nav.audit', defaultLabel: 'Audit Trail', icon: ShieldCheck },
  { id: 'settings', labelKey: 'nav.settings', defaultLabel: 'Settings', icon: Settings },
];

export const Sidebar: React.FC<SidebarProps> = ({
  currentRoute,
  onNavigate,
  isCollapsed = false,
  onToggleCollapse,
}) => {
  const [, setLang] = useState<Language>(i18n.getLanguage());

  useEffect(() => {
    return i18n.subscribe((newLang) => setLang(newLang));
  }, []);

  return (
    <aside
      className={`${
        isCollapsed ? 'w-16' : 'w-56'
      } bg-slate-900 text-slate-300 flex flex-col shrink-0 select-none border-r border-slate-800 transition-all duration-200`}
    >
      {/* App Branding & Collapse Toggle */}
      <div className={`h-14 ${isCollapsed ? 'px-2' : 'px-3'} flex items-center justify-between border-b border-slate-800`}>
        <div className="flex items-center gap-2.5 overflow-hidden">
          <div
            className="w-7 h-7 rounded bg-indigo-600 flex items-center justify-center text-white shrink-0 cursor-pointer"
            onClick={onToggleCollapse}
            title={isCollapsed ? 'Expand sidebar' : 'ClinicRoster'}
          >
            <Activity className="w-4 h-4" />
          </div>
          {!isCollapsed && (
            <div className="flex flex-col min-w-0">
              <span className="font-semibold text-white text-sm tracking-tight leading-tight truncate">
                ClinicRoster
              </span>
              <span className="text-[10px] text-slate-400 font-mono tracking-wide leading-tight truncate">
                NURSING SCHEDULER
              </span>
            </div>
          )}
        </div>

        {onToggleCollapse && (
          <button
            onClick={onToggleCollapse}
            className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            title={isCollapsed ? 'Expand sidebar (Ctrl+\\)' : 'Collapse sidebar to expand view (Ctrl+\\)'}
            aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {isCollapsed ? (
              <PanelLeftOpen className="w-4 h-4" />
            ) : (
              <PanelLeftClose className="w-4 h-4" />
            )}
          </button>
        )}
      </div>

      {/* Nav List */}
      <nav className={`flex-1 ${isCollapsed ? 'px-1.5' : 'px-2'} py-3 space-y-1 overflow-y-auto`}>
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = currentRoute === item.id;
          const label = t(item.labelKey, item.defaultLabel);
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              title={isCollapsed ? `${label}${item.badge ? ` (${item.badge})` : ''}` : undefined}
              className={`w-full flex items-center ${
                isCollapsed ? 'justify-center p-2' : 'justify-between px-3 py-2'
              } rounded text-xs font-medium transition-colors cursor-pointer text-left ${
                isActive
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                {!isCollapsed && <span className="truncate">{label}</span>}
              </div>
              {!isCollapsed && item.badge && (
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded font-mono ${
                    isActive
                      ? 'bg-indigo-700/60 text-indigo-100'
                      : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Bottom Footer Info */}
      <div className={`${isCollapsed ? 'p-2 text-center' : 'p-3'} border-t border-slate-800 text-[11px] text-slate-400`}>
        {isCollapsed ? (
          <div className="w-2 h-2 rounded-full bg-emerald-400 mx-auto" title="Deterministic Engine: Ready" />
        ) : (
          <>
            <div className="flex items-center justify-between">
              <span className="font-medium text-slate-300">Deterministic Engine</span>
              <span className="font-mono text-[10px] text-emerald-400">Ready</span>
            </div>
            <p className="text-[10px] text-slate-400 mt-1 leading-normal">
              Strict rules · Zero over-target drift
            </p>
          </>
        )}
      </div>
    </aside>
  );
};
