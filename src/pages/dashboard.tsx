import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { TrendingUp, Wallet, PieChart } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { StatCard } from '@/components/stat-card';
import { AssetBreakdown } from '@/components/asset-breakdown';
import { TopHoldingsTable } from '@/components/top-holdings-table';
import { EmptyState } from '@/components/empty-state';
import { holdingService } from '@/services/holding-service';
import { portfolioService } from '@/services/portfolio-service';
import { computePortfolioSummary } from '@/lib/calculations';
import { formatCurrency, formatPercent } from '@/lib/formatters';

export default function DashboardPage() {
  const navigate = useNavigate();
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

  const nonBaseEntries = Object.entries(summary.totalsByCurrency).filter(
    ([ccy]) => ccy !== baseCurrency,
  );

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

      {/* Stat cards */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard
          title={`Total (${baseCurrency})`}
          value={formatCurrency(summary.baseCurrencyTotal, baseCurrency)}
          subtitle={`${summary.holdingCount} holding${summary.holdingCount !== 1 ? 's' : ''}`}
        />
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
    </div>
  );
}
