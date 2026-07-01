import { Outlet } from 'react-router-dom';
import { Sidebar } from '@/components/sidebar';

export function AppShell() {
  return (
    <div className="flex h-screen min-h-0 overflow-hidden">
      <Sidebar />
      <main className="min-h-0 min-w-0 flex-1 overflow-auto p-6">
        <Outlet />
      </main>
    </div>
  );
}
