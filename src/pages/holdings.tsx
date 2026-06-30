import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Cloud, Pencil, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { HoldingsTable } from '@/components/holdings-table';
import { UpdatePricesDialog } from '@/components/update-prices-dialog';
import { TwelveDataRefreshDialog } from '@/components/twelve-data-refresh-dialog';
import { EmptyState } from '@/components/empty-state';
import { holdingService } from '@/services/holding-service';
import { portfolioService } from '@/services/portfolio-service';
import { computeHoldingsWithValues } from '@/lib/calculations';
import type { HoldingWithComputedValues } from '@/lib/types';

export default function HoldingsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [updatePricesOpen, setUpdatePricesOpen] = useState(false);
  const [webRefreshOpen, setWebRefreshOpen] = useState(false);
  const [selectedHoldingId, setSelectedHoldingId] = useState<string | null>(null);
  const lastActiveIdRef = useRef<string | null>(null);

  const { data: portfolio } = useQuery({
    queryKey: ['portfolio', 'default'],
    queryFn: () => portfolioService.getDefault(),
  });

  const { data: rawHoldings, isLoading } = useQuery({
    queryKey: ['holdings', 'default'],
    queryFn: () => holdingService.list('default'),
    enabled: !!portfolio,
  });

  const { data: activeRefresh } = useQuery({
    queryKey: ['active-price-refresh', 'default'],
    queryFn: () => holdingService.getActivePriceRefreshRun('default'),
    refetchInterval: (query) => (query.state.data ? 1500 : false),
    enabled: !!portfolio,
  });

  // When the active refresh transitions from "running" to "no longer running",
  // fetch the final row, toast the result, and invalidate the holdings query.
  useEffect(() => {
    if (activeRefresh?.id) {
      lastActiveIdRef.current = activeRefresh.id;
      return;
    }
    const finishedId = lastActiveIdRef.current;
    if (!finishedId) return;
    lastActiveIdRef.current = null;
    void holdingService.getLatestPriceRefreshRun('default').then((latest) => {
      if (!latest || latest.id !== finishedId) return;
      const msg = `Refresh complete: ${latest.succeededCount} updated, ${latest.failedCount} failed`;
      if (latest.status === 'failed') {
        toast.error(msg);
      } else {
        toast.success(msg);
      }
      void queryClient.invalidateQueries({ queryKey: ['holdings', 'default'] });
      void queryClient.invalidateQueries({
        queryKey: ['twelve-data-refresh-preview', 'default'],
      });
    });
  }, [activeRefresh, queryClient]);

  const baseCurrency = portfolio?.baseCurrency ?? 'USD';
  const holdingsWithValues = computeHoldingsWithValues(rawHoldings ?? [], baseCurrency);

  function openUpdatePrices(holding?: HoldingWithComputedValues) {
    setSelectedHoldingId(holding?.id ?? null);
    setUpdatePricesOpen(true);
  }

  const refreshInProgress = !!activeRefresh;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-2xl font-bold">Holdings</h2>
        <div className="flex items-center gap-6">
          <div
            className="flex items-center gap-2 rounded-md border bg-muted/30 px-2 py-1"
            aria-label="Update prices"
          >
            <span className="hidden text-xs uppercase tracking-wide text-muted-foreground sm:inline">
              Prices
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => openUpdatePrices()}
              disabled={holdingsWithValues.length === 0}
              title="Type in prices yourself for each holding."
            >
              <Pencil className="h-4 w-4" />
              Update Manually
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setWebRefreshOpen(true)}
              disabled={holdingsWithValues.length === 0 || refreshInProgress}
              title="Pull the latest prices from Twelve Data. Uses your daily API credits."
            >
              <Cloud className="h-4 w-4" />
              Auto-Refresh (Twelve Data)
            </Button>
          </div>
          <Button onClick={() => navigate('/holdings/add')}>
            <Plus className="h-4 w-4" />
            Add Holding
          </Button>
        </div>
      </div>

      {activeRefresh && <PriceRefreshProgressBanner run={activeRefresh} />}

      {isLoading ? (
        <Skeleton className="h-48" />
      ) : holdingsWithValues.length === 0 ? (
        <EmptyState
          title="No holdings"
          description="Add your first holding to get started."
          actionLabel="Add Holding"
          onAction={() => navigate('/holdings/add')}
        />
      ) : (
        <HoldingsTable
          holdings={holdingsWithValues}
          baseCurrency={baseCurrency}
          portfolioId="default"
          onUpdatePrice={openUpdatePrices}
        />
      )}

      <UpdatePricesDialog
        open={updatePricesOpen}
        onOpenChange={(open) => {
          setUpdatePricesOpen(open);
          if (!open) setSelectedHoldingId(null);
        }}
        holdings={holdingsWithValues}
        initialHoldingId={selectedHoldingId}
      />
      <TwelveDataRefreshDialog
        open={webRefreshOpen}
        onOpenChange={setWebRefreshOpen}
        portfolioId="default"
      />
    </div>
  );
}

interface PriceRefreshProgressBannerProps {
  run: NonNullable<Awaited<ReturnType<typeof holdingService.getActivePriceRefreshRun>>>;
}

function PriceRefreshProgressBanner({ run }: PriceRefreshProgressBannerProps) {
  const pct =
    run.totalCount > 0
      ? Math.min(100, Math.round((run.processedCount / run.totalCount) * 100))
      : 0;
  const remaining = Math.max(0, run.totalCount - run.processedCount);

  return (
    <div className="rounded-md border bg-muted/40 p-3" role="status" aria-live="polite">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <p className="font-medium">
          Auto-refresh in progress — {run.processedCount} of {run.totalCount} processed
          {run.currentSymbol && (
            <>
              {' '}
              <span className="font-normal text-muted-foreground">
                (current: <code>{run.currentSymbol}</code>)
              </span>
            </>
          )}
        </p>
        <p className="text-xs text-muted-foreground tabular-nums">
          {remaining > 0 ? `${remaining} remaining` : 'Finishing up…'} ·{' '}
          {run.succeededCount} ok · {run.failedCount} failed
        </p>
      </div>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-background">
        <div
          className="h-full bg-primary transition-all"
          style={{ width: `${pct}%` }}
          aria-label={`${pct}% complete`}
        />
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        You can leave this page; the refresh keeps running in the background.
      </p>
    </div>
  );
}
