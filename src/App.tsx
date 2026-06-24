import { HashRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/sonner';
import { AppShell } from '@/components/app-shell';
import DashboardPage from '@/pages/dashboard';
import HoldingsPage from '@/pages/holdings';
import AddHoldingPage from '@/pages/add-holding';
import EditHoldingPage from '@/pages/edit-holding';
import SettingsPage from '@/pages/settings';
import SnapshotsPage from '@/pages/snapshots';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 1000 * 30, // 30 seconds
    },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <HashRouter>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<DashboardPage />} />
            <Route path="holdings" element={<HoldingsPage />} />
            <Route path="holdings/add" element={<AddHoldingPage />} />
            <Route path="holdings/:id/edit" element={<EditHoldingPage />} />
            <Route path="snapshots" element={<SnapshotsPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
        </Routes>
      </HashRouter>
      <Toaster />
    </QueryClientProvider>
  );
}
