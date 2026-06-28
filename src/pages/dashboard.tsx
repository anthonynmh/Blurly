import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, PieChart, TrendingUp, Wallet, X } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { StatCard } from '@/components/stat-card';
import { AssetBreakdown } from '@/components/asset-breakdown';
import { TopHoldingsTable } from '@/components/top-holdings-table';
import { EmptyState } from '@/components/empty-state';
import { UpdatePricesDialog } from '@/components/update-prices-dialog';
import { holdingService } from '@/services/holding-service';
import { portfolioService } from '@/services/portfolio-service';
import { computePortfolioSummary, computeHoldingsWithValues } from '@/lib/calculations';
import { formatCurrency, formatPercent } from '@/lib/formatters';
import { cn } from '@/lib/utils';

const STALE_DISMISS_KEY = 'dashboard-stale-dismissed-count';
const COST_DISMISS_KEY = 'dashboard-missing-cost-dismissed-count';

function readDismissed(key: string): number {
  return parseInt(localStorage.getItem(key) ?? '0', 10);
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const [updatePricesOpen, setUpdatePricesOpen] = useState(false);

  // Track dismissed banner counts in state so the UI re-renders when dismissed.
  const [staleDismissed, setStaleDismissed] = useState(() => readDismissed(STALE_DISMISS_KEY));
  const [costDismissed, setCostDismissed] = useState(() => readDismissed(COST_DISMISS_KEY));

  const { data: portfolio } = useQuery({
    queryKey: ['portfolio', 'default'],
    queryFn: () => portfolioService.getDefault(),
  });

  const { data: rawHoldings, isLoading } = useQuery({
    queryKey: ['holdings', 'default'],
    queryFn: () => holdingService.list('default'),
    enabled: !!portfolio,
  });

  const baseCurrency = portfolio?.baseCurrency ?? 'USD';
  const holdings = rawHoldings ?? [];
  const summary = computePortfolioSummary(holdings, baseCurrency);
  const holdingsWithValues = computeHoldingsWithValues(holdings, baseCurrency);

  const nonBaseEntries = Object.entries(summary.totalsByCurrency).filter(
    ([ccy]) => ccy !== baseCurrency,
  );

  // Banner visibility: show when count > 0 and count > last-dismissed count
  const showStaleBanner = summary.staleHoldingsCount > 0 && summary.staleHoldingsCount > staleDismissed;
  const showCostBanner = summary.missingCostBasisCount > 0 && summary.missingCostBasisCount > costDismissed;

  function dismissStaleBanner() {
    localStorage.setItem(STALE_DISMISS_KEY, String(summary.staleHoldingsCount));
    setStaleDismissed(summary.staleHoldingsCount);
  }

  function dismissCostBanner() {
    localStorage.setItem(COST_DISMISS_KEY, String(summary.missingCostBasisCount));
    setCostDismissed(summary.missingCostBasisCount);
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold">Dashboard</h2>
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      </div>
    );
  }

  if (holdings.length === 0) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold">Dashboard</h2>
        <EmptyState
          icon={TrendingUp}
          title="No holdings yet"
          description="Add your first holding to see your portfolio overview."
          actionLabel="Add Holding"
          onAction={() => navigate('/holdings/add')}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Dashboard</h2>
        {/* Non-base currency chips */}
        {nonBaseEntries.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Also held:</span>
            {nonBaseEntries.map(([ccy, total]) => (
              <Badge key={ccy} variant="outline">
                {ccy} {formatCurrency(total, ccy)}
              </Badge>
            ))}
            <span className="text-xs text-muted-foreground">
              (excluded from base totals &amp; weights)
            </span>
          </div>
        )}
      </div>

      {/* Amber banners */}
      {(showStaleBanner || showCostBanner) && (
        <div className="space-y-2">
          {showStaleBanner && (
            <Alert className="border-amber-500/40 bg-amber-500/10">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <AlertTitle className="text-amber-800 dark:text-amber-300">
                {summary.staleHoldingsCount} holding{summary.staleHoldingsCount !== 1 ? 's have' : ' has'} stale prices
              </AlertTitle>
              <AlertDescription className="flex items-center justify-between">
                <span className="text-amber-700 dark:text-amber-400">
                  Prices haven&apos;t been updated in over 7 days.
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 border-amber-500/40 text-xs text-amber-700 hover:bg-amber-500/10"
                    onClick={() => setUpdatePricesOpen(true)}
                  >
                    Update Prices
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-amber-600 hover:bg-amber-500/10"
                    onClick={dismissStaleBanner}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </AlertDescription>
            </Alert>
          )}

          {showCostBanner && (
            <Alert className="border-amber-500/40 bg-amber-500/10">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <AlertTitle className="text-amber-800 dark:text-amber-300">
                {summary.missingCostBasisCount} holding{summary.missingCostBasisCount !== 1 ? 's are' : ' is'} missing average cost
              </AlertTitle>
              <AlertDescription className="flex items-center justify-between">
                <span className="text-amber-700 dark:text-amber-400">
                  Set average cost to see unrealized P/L.
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 border-amber-500/40 text-xs text-amber-700 hover:bg-amber-500/10"
                    onClick={() => navigate('/holdings')}
                  >
                    Review Holdings
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-amber-600 hover:bg-amber-500/10"
                    onClick={dismissCostBanner}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </AlertDescription>
            </Alert>
          )}
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard
          title={`Total (${baseCurrency})`}
          value={formatCurrency(summary.baseCurrencyTotal, baseCurrency)}
          subtitle={`${summary.holdingCount} holding${summary.holdingCount !== 1 ? 's' : ''}`}
        />
        <StatCard
          title="Total Cost Basis"
          value={summary.totalCostBasis > 0
            ? formatCurrency(summary.totalCostBasis, baseCurrency)
            : '—'}
          subtitle={summary.totalCostBasis > 0 ? `${baseCurrency} invested` : 'Set avg cost to see'}
        />
        <StatCard
          title="Unrealized P/L"
          value={summary.totalCostBasis > 0
            ? formatCurrency(summary.totalUnrealizedPL, baseCurrency)
            : '—'}
          subtitle={
            summary.totalCostBasis > 0 && summary.totalUnrealizedPLPercent != null
              ? formatPercent(summary.totalUnrealizedPLPercent)
              : undefined
          }
          className={summary.totalCostBasis > 0 ? cn(
            summary.totalUnrealizedPL >= 0 ? '[&_.text-2xl]:text-green-600' : '[&_.text-2xl]:text-red-600',
          ) : undefined}
        />
      </div>

      {/* Second row of stat cards */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard
          title="Cash &amp; Money Market"
          value={formatCurrency(summary.cashAndMoneyMarketValue, baseCurrency)}
          subtitle={
            summary.baseCurrencyTotal > 0
              ? formatPercent(summary.cashAndMoneyMarketValue / summary.baseCurrencyTotal)
              : '—'
          }
        />
        <StatCard
          title="Largest Position"
          value={summary.largestHolding ? formatCurrency(summary.largestHolding.marketValue, summary.largestHolding.currency) : '—'}
          subtitle={summary.largestHolding ? `${summary.largestHolding.symbol} · ${summary.largestHolding.currency === baseCurrency ? formatPercent(summary.largestHolding.weight) : 'non-base'}` : undefined}
        />
        <StatCard
          title="Stale Prices"
          value={summary.staleHoldingsCount > 0 ? `${summary.staleHoldingsCount}` : '—'}
          subtitle={summary.staleHoldingsCount > 0 ? 'holding' + (summary.staleHoldingsCount !== 1 ? 's need updating' : ' needs updating') : 'All prices current'}
          className={summary.staleHoldingsCount > 0 ? '[&_.text-2xl]:text-amber-600' : undefined}
        />
      </div>

      {/* Charts + Top Holdings */}
      <div className="grid grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <PieChart className="h-4 w-4" />
              Asset Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent>
            <AssetBreakdown
              data={summary.assetClassBreakdown}
              currency={baseCurrency}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Wallet className="h-4 w-4" />
              Top Holdings
            </CardTitle>
          </CardHeader>
          <CardContent className="px-0">
            <TopHoldingsTable holdings={summary.topHoldings} baseCurrency={baseCurrency} />
          </CardContent>
        </Card>
      </div>

      <UpdatePricesDialog
        open={updatePricesOpen}
        onOpenChange={setUpdatePricesOpen}
        holdings={holdingsWithValues}
      />
    </div>
  );
}
