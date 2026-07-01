import { useEffect } from 'react';
import { HashRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/sonner';
import { AppShell } from '@/components/app-shell';
import DashboardPage from '@/pages/dashboard';
import HoldingsPage from '@/pages/holdings';
import AddHoldingPage from '@/pages/add-holding';
import EditHoldingPage from '@/pages/edit-holding';
import SettingsPage from '@/pages/settings';
import AnalystPage from '@/pages/analyst';
import AnalysisHistoryPage from '@/pages/analysis-history';
import AskAnalystPage from '@/pages/ask-analyst';
import StrategyPage from '@/pages/strategy';
import WatchlistPage from '@/pages/watchlist';
import KeysPage from '@/pages/keys';
import { settingsService } from '@/services/settings-service';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 1000 * 30, // 30 seconds
    },
  },
});

let hasAttemptedFxRefresh = false;

function FxRateRefreshOnLaunch() {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (hasAttemptedFxRefresh) {
      return;
    }
    hasAttemptedFxRefresh = true;

    void settingsService.refreshFxRate()
      .then((settings) => {
        queryClient.setQueryData(['settings'], settings);
        void queryClient.invalidateQueries({ queryKey: ['settings'] });
      })
      .catch(() => {
        // Launch should not depend on an external FX provider.
      });
  }, [queryClient]);

  return null;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <FxRateRefreshOnLaunch />
      <HashRouter>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<DashboardPage />} />
            <Route path="holdings" element={<HoldingsPage />} />
            <Route path="holdings/add" element={<AddHoldingPage />} />
            <Route path="holdings/:id/edit" element={<EditHoldingPage />} />
            <Route path="analyst" element={<AnalystPage />} />
            <Route path="analyst/ask" element={<AskAnalystPage />} />
            <Route path="analysis-history" element={<AnalysisHistoryPage />} />
            <Route path="analysis-history/:id" element={<AnalysisHistoryPage />} />
            <Route path="strategy" element={<StrategyPage />} />
            <Route path="watchlist" element={<WatchlistPage />} />
            <Route path="keys" element={<KeysPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
        </Routes>
      </HashRouter>
      <Toaster />
    </QueryClientProvider>
  );
}
