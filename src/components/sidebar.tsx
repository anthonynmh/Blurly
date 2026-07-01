import { NavLink } from 'react-router-dom';
import { BarChart3, Eye, History, KeyRound, Layers, MessageSquare, Settings, Sparkles, Target } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { getVersion } from '@tauri-apps/api/app';
import { cn } from '@/lib/utils';

const NAV_GROUPS = [
  {
    label: 'Dashboard',
    items: [
      { to: '/', label: 'Dashboard', icon: BarChart3, end: true },
      { to: '/holdings', label: 'Holdings', icon: Layers, end: false },
      { to: '/watchlist', label: 'Watchlist', icon: Eye, end: false },
    ],
  },
  {
    label: 'Analyst',
    items: [
      { to: '/analyst', label: 'Analyst', icon: Sparkles, end: true },
      { to: '/analyst/ask', label: 'Ask Analyst', icon: MessageSquare, end: false },
      { to: '/analysis-history', label: 'Analysis History', icon: History, end: false },
    ],
  },
  {
    label: 'Strategy',
    items: [
      { to: '/strategy', label: 'Strategy', icon: Target, end: false },
    ],
  },
  {
    label: 'User Settings',
    items: [
      { to: '/keys', label: 'Keys', icon: KeyRound, end: false },
      { to: '/settings', label: 'Settings', icon: Settings, end: false },
    ],
  },
] as const;

export function Sidebar() {
  const { data: version } = useQuery({
    queryKey: ['app-version'],
    queryFn: getVersion,
    staleTime: Infinity,
    // Gracefully ignore errors — don't crash the sidebar over a missing version.
    retry: false,
  });

  return (
    <nav className="flex w-56 flex-col border-r bg-muted/10 px-3 py-4">
      <div className="mb-6 px-3">
        <h1 className="text-lg font-bold tracking-tight">Blurly</h1>
        <p className="text-xs text-muted-foreground">Portfolio Tracker</p>
      </div>

      <div className="flex flex-1 flex-col gap-4">
        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
              {group.label}
            </p>
            <ul className="flex flex-col gap-0.5">
              {group.items.map(({ to, label, icon: Icon, end }) => (
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
          </div>
        ))}
      </div>

      {/* Version footnote */}
      {version && (
        <p className="mt-4 px-3 text-[10px] text-muted-foreground/50">
          v{version}
        </p>
      )}
    </nav>
  );
}
