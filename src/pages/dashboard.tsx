import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, PieChart, TrendingUp, Wallet, X } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { StatCard } from '@/components/stat-card';
import { AssetBreakdown } from '@/components/asset-breakdown';
import { TopHoldingsTable } from '@/components/top-holdings-table';
import { EmptyState } from '@/components/empty-state';
import { UpdatePricesDialog } from '@/components/update-prices-dialog';
import { holdingService } from '@/services/holding-service';
import { portfolioService } from '@/services/portfolio-service';
import { settingsService } from '@/services/settings-service';
import {
  computePortfolioSummary,
  computeHoldingsWithValues,
  convertSummaryToDisplayCurrency,
  daysSince,
} from '@/lib/calculations';
import { formatCurrency, formatPercent } from '@/lib/formatters';
import { cn } from '@/lib/utils';

const STALE_DISMISS_KEY = 'dashboard-stale-dismissed-count';
const COST_DISMISS_KEY = 'dashboard-missing-cost-dismissed-count';
const DISPLAY_CCY_KEY = 'blurly:dashboard-display-currency';

function readDismissed(key: string): number {
  return parseInt(localStorage.getItem(key) ?? '0', 10);
}

function readDisplayCcy(): 'USD' | 'SGD' | null {
  const v = localStorage.getItem(DISPLAY_CCY_KEY);
  return v === 'USD' || v === 'SGD' ? v : null;
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const [updatePricesOpen, setUpdatePricesOpen] = useState(false);

  // Track dismissed banner counts in state so the UI re-renders when dismissed.
  const [staleDismissed, setStaleDismissed] = useState(() => readDismissed(STALE_DISMISS_KEY));
  const [costDismissed, setCostDismissed] = useState(() => readDismissed(COST_DISMISS_KEY));

  // Display currency toggle: persisted in localStorage; defaults to baseCurrency on first visit.
  const [displayCcy, setDisplayCcy] = useState<'USD' | 'SGD' | null>(readDisplayCcy);

  const { data: portfolio } = useQuery({
    queryKey: ['portfolio', 'default'],
    queryFn: () => portfolioService.getDefault(),
  });

  const { data: rawHoldings, isLoading } = useQuery({
    queryKey: ['holdings', 'default'],
    queryFn: () => holdingService.list('default'),
    enabled: !!portfolio,
  });

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => settingsService.get(),
  });

  const baseCurrency = portfolio?.baseCurrency ?? 'USD';
  const stalenessThreshold = settings?.stalenessThresholdDays ?? 7;
  const fxRate = settings?.fxUsdSgdRate ?? null;
  const fxAsOf = settings?.fxUsdSgdAsOf ?? null;

  // Resolve the active display currency: saved value or fall back to baseCurrency.
  const activeCcy: 'USD' | 'SGD' = displayCcy ?? (baseCurrency as 'USD' | 'SGD') ?? 'USD';

  const holdings = rawHoldings ?? [];
  const summary = computePortfolioSummary(holdings, baseCurrency, stalenessThreshold);
  const holdingsWithValues = computeHoldingsWithValues(holdings, baseCurrency, stalenessThreshold);

  // Convert summary when toggled to a different currency and rate is available.
  const needsConversion = activeCcy !== baseCurrency && fxRate != null;
  const displaySummary = needsConversion
    ? convertSummaryToDisplayCurrency(summary, holdings, activeCcy, { 'USD->SGD': fxRate })
    : summary;
  // When showing a converted summary, tell TopHoldingsTable the "base" is displayCcy so weights show.
  const displayBaseCurrency = needsConversion ? activeCcy : baseCurrency;

  const nonBaseEntries = Object.entries(summary.totalsByCurrency).filter(
    ([ccy]) => ccy !== baseCurrency,
  );

  // Banner visibility: show when count > 0 and count > last-dismissed count
  const showStaleBanner = summary.staleHoldingsCount > 0 && summary.staleHoldingsCount > staleDismissed;
  const showCostBanner = summary.missingCostBasisCount > 0 && summary.missingCostBasisCount > costDismissed;

  // FX rate stale warning: show amber badge if as-of date is more than 30 days old.
  const fxDaysOld = fxAsOf ? daysSince(fxAsOf) : 0;
  const fxRateIsStale = fxDaysOld > 30;

  function dismissStaleBanner() {
    localStorage.setItem(STALE_DISMISS_KEY, String(summary.staleHoldingsCount));
    setStaleDismissed(summary.staleHoldingsCount);
  }

  function dismissCostBanner() {
    localStorage.setItem(COST_DISMISS_KEY, String(summary.missingCostBasisCount));
    setCostDismissed(summary.missingCostBasisCount);
  }

  function handleSetDisplayCcy(ccy: 'USD' | 'SGD') {
    setDisplayCcy(ccy);
    localStorage.setItem(DISPLAY_CCY_KEY, ccy);
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
    <TooltipProvider>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold">Dashboard</h2>

          <div className="flex items-center gap-3">
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

            {/* USD↔SGD currency toggle */}
            {fxRate != null ? (
              <div className="flex items-center gap-1">
                <Button
                  variant={activeCcy === 'USD' ? 'secondary' : 'outline'}
                  size="sm"
                  className="h-7 px-3 text-xs"
                  onClick={() => handleSetDisplayCcy('USD')}
                >
                  USD
                </Button>
                <Button
                  variant={activeCcy === 'SGD' ? 'secondary' : 'outline'}
                  size="sm"
                  className="h-7 px-3 text-xs"
                  onClick={() => handleSetDisplayCcy('SGD')}
                >
                  SGD
                </Button>
                {/* Amber warning when FX rate as-of date is more than 30 days old */}
                {fxRateIsStale && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Badge
                        variant="secondary"
                        className="ml-1 cursor-default gap-1 border-amber-500/30 bg-amber-500/15 text-amber-700 dark:text-amber-400"
                      >
                        <AlertTriangle className="h-3 w-3" />
                        {fxDaysOld}d
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent>
                      FX rate is {fxDaysOld} days old
                    </TooltipContent>
                  </Tooltip>
                )}
              </div>
            ) : (
              /* When no FX rate is set, show disabled toggle with tooltip */
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex cursor-not-allowed items-center gap-1 opacity-50">
                    <Button
                      variant="outline"
                      size="sm"
                      className="pointer-events-none h-7 px-3 text-xs"
                      tabIndex={-1}
                    >
                      USD
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="pointer-events-none h-7 px-3 text-xs"
                      tabIndex={-1}
                    >
                      SGD
                    </Button>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  Set USD↔SGD rate in Settings to enable conversion
                </TooltipContent>
              </Tooltip>
            )}
          </div>
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
                    Prices haven&apos;t been updated in over {stalenessThreshold} days.
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

        {/* Stat cards — rendered from displaySummary so conversion is reflected */}
        <div className="grid grid-cols-3 gap-4">
          <StatCard
            title={`Total (${activeCcy})`}
            value={formatCurrency(displaySummary.baseCurrencyTotal, activeCcy)}
            subtitle={`${displaySummary.holdingCount} holding${displaySummary.holdingCount !== 1 ? 's' : ''}`}
          />
          <StatCard
            title="Total Cost Basis"
            value={displaySummary.totalCostBasis > 0
              ? formatCurrency(displaySummary.totalCostBasis, activeCcy)
              : '—'}
            subtitle={displaySummary.totalCostBasis > 0 ? `${activeCcy} invested` : 'Set avg cost to see'}
          />
          <StatCard
            title="Unrealized P/L"
            value={displaySummary.totalCostBasis > 0
              ? formatCurrency(displaySummary.totalUnrealizedPL, activeCcy)
              : '—'}
            subtitle={
              displaySummary.totalCostBasis > 0 && displaySummary.totalUnrealizedPLPercent != null
                ? formatPercent(displaySummary.totalUnrealizedPLPercent)
                : undefined
            }
            className={displaySummary.totalCostBasis > 0 ? cn(
              displaySummary.totalUnrealizedPL >= 0 ? '[&_.text-2xl]:text-green-600' : '[&_.text-2xl]:text-red-600',
            ) : undefined}
          />
        </div>

        {/* Second row of stat cards */}
        <div className="grid grid-cols-3 gap-4">
          <StatCard
            title="Cash &amp; Money Market"
            value={formatCurrency(displaySummary.cashAndMoneyMarketValue, activeCcy)}
            subtitle={
              displaySummary.baseCurrencyTotal > 0
                ? formatPercent(displaySummary.cashAndMoneyMarketValue / displaySummary.baseCurrencyTotal)
                : '—'
            }
          />
          <StatCard
            title="Largest Position"
            value={displaySummary.largestHolding
              ? formatCurrency(displaySummary.largestHolding.marketValue, displaySummary.largestHolding.currency)
              : '—'}
            subtitle={displaySummary.largestHolding
              ? `${displaySummary.largestHolding.symbol} · ${
                  displaySummary.largestHolding.currency === displayBaseCurrency
                    ? formatPercent(displaySummary.largestHolding.weight)
                    : 'non-base'
                }`
              : undefined}
          />
          <StatCard
            title="Stale Prices"
            value={summary.staleHoldingsCount > 0 ? `${summary.staleHoldingsCount}` : '—'}
            subtitle={summary.staleHoldingsCount > 0
              ? 'holding' + (summary.staleHoldingsCount !== 1 ? 's need updating' : ' needs updating')
              : 'All prices current'}
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
                data={displaySummary.assetClassBreakdown}
                currency={activeCcy}
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
              <TopHoldingsTable
                holdings={displaySummary.topHoldings}
                baseCurrency={displayBaseCurrency}
              />
            </CardContent>
          </Card>
        </div>

        <UpdatePricesDialog
          open={updatePricesOpen}
          onOpenChange={setUpdatePricesOpen}
          holdings={holdingsWithValues}
        />
      </div>
    </TooltipProvider>
  );
}
