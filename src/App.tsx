import { HashRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/sonner';
import { AppShell } from '@/components/app-shell';
import DashboardPage from '@/pages/dashboard';
import HoldingsPage from '@/pages/holdings';
import AddHoldingPage from '@/pages/add-holding';
import EditHoldingPage from '@/pages/edit-holding';
import SettingsPage from '@/pages/settings';
import AnalystPage from '@/pages/analyst';
import AnalysisHistoryPage from '@/pages/analysis-history';
import WatchlistPage from '@/pages/watchlist';
import AiSettingsPage from '@/pages/ai-settings';

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
            <Route path="analyst" element={<AnalystPage />} />
            <Route path="analysis-history" element={<AnalysisHistoryPage />} />
            <Route path="analysis-history/:id" element={<AnalysisHistoryPage />} />
            <Route path="watchlist" element={<WatchlistPage />} />
            <Route path="ai-settings" element={<AiSettingsPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
        </Routes>
      </HashRouter>
      <Toaster />
    </QueryClientProvider>
  );
}
