import { NavLink } from 'react-router-dom';
import { BarChart3, Bot, Camera, Eye, History, Layers, Settings, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: BarChart3, end: true },
  { to: '/holdings', label: 'Holdings', icon: Layers, end: false },
  { to: '/snapshots', label: 'Snapshots', icon: Camera, end: false },
  { to: '/analyst', label: 'Analyst', icon: Sparkles, end: false },
  { to: '/analysis-history', label: 'Analysis History', icon: History, end: false },
  { to: '/watchlist', label: 'Watchlist', icon: Eye, end: false },
  { to: '/ai-settings', label: 'AI Settings', icon: Bot, end: false },
  { to: '/settings', label: 'Settings', icon: Settings, end: false },
];

export function Sidebar() {
  return (
    <nav className="flex w-56 flex-col border-r bg-muted/10 px-3 py-4">
      <div className="mb-6 px-3">
        <h1 className="text-lg font-bold tracking-tight">Blurly</h1>
        <p className="text-xs text-muted-foreground">Portfolio Tracker</p>
      </div>

      <ul className="flex flex-col gap-1">
        {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
          <li key={to}>
            <NavLink
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )
              }
            >
              <Icon className="h-4 w-4" />
              {label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
