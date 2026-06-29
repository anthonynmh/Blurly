import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { AlertCircle, CheckCircle2, ExternalLink } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { holdingService } from '@/services/holding-service';
import type { PriceRefreshRunResult, TwelveDataUsage } from '@/lib/types';
import { formatNumber } from '@/lib/formatters';

interface TwelveDataRefreshDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  portfolioId: string;
}

export function TwelveDataRefreshDialog({
  open,
  onOpenChange,
  portfolioId,
}: TwelveDataRefreshDialogProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [limit, setLimit] = useState(0);
  const [lastRun, setLastRun] = useState<PriceRefreshRunResult | null>(null);

  const previewQuery = useQuery({
    queryKey: ['twelve-data-refresh-preview', portfolioId],
    queryFn: () => holdingService.getTwelveDataRefreshPreview(portfolioId),
    enabled: open,
    retry: false,
  });

  useEffect(() => {
    if (open) {
      setLastRun(null);
    }
  }, [open]);

  useEffect(() => {
    if (previewQuery.data) {
      setLimit(previewQuery.data.recommendedCount);
    }
  }, [previewQuery.data]);

  const refreshMutation = useMutation({
    mutationFn: () => holdingService.refreshPricesFromTwelveData({ portfolioId, limit }),
    onSuccess: (result) => {
      setLastRun(result);
      void queryClient.invalidateQueries({ queryKey: ['holdings', portfolioId] });
      void queryClient.invalidateQueries({ queryKey: ['twelve-data-refresh-preview', portfolioId] });
      toast.success(`Updated ${result.updated} price${result.updated !== 1 ? 's' : ''}`);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const preview = previewQuery.data;
  const maxCount = preview?.maxCount ?? 0;
  const clampedLimit = Math.max(0, Math.min(limit, maxCount));
  const canRefresh = !!preview?.hasKey && clampedLimit > 0 && !refreshMutation.isPending;

  function handleLimitChange(value: string) {
    const parsed = parseInt(value, 10);
    if (Number.isNaN(parsed)) {
      setLimit(0);
      return;
    }
    setLimit(Math.max(0, Math.min(parsed, maxCount)));
  }

  function goToSettings() {
    onOpenChange(false);
    navigate('/settings');
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Refresh from Twelve Data</DialogTitle>
          <DialogDescription>
            Uses your saved Twelve Data key. Each eligible holding uses about one API credit.
          </DialogDescription>
        </DialogHeader>

        {previewQuery.isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-20" />
            <Skeleton className="h-28" />
          </div>
        ) : previewQuery.error ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Could not load refresh limits</AlertTitle>
            <AlertDescription>{(previewQuery.error as Error).message}</AlertDescription>
          </Alert>
        ) : preview ? (
          <div className="space-y-4">
            {!preview.hasKey && (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>No Twelve Data key saved</AlertTitle>
                <AlertDescription>
                  Save your own Twelve Data API key before refreshing prices from the web.
                </AlertDescription>
              </Alert>
            )}

            {preview.message && preview.hasKey && (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Using conservative limits</AlertTitle>
                <AlertDescription>{preview.message}</AlertDescription>
              </Alert>
            )}

            <div className="grid gap-3 sm:grid-cols-3">
              <LimitStat label="Eligible" value={preview.eligibleCount} />
              <LimitStat label="Recommended" value={preview.recommendedCount} />
              <LimitStat label="Maximum now" value={preview.maxCount} />
            </div>

            <UsagePanel usage={preview.usage} />

            <div className="rounded-md border p-3">
              <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-1">
                  <label htmlFor="refresh-limit" className="text-sm font-medium">
                    Holdings to refresh this run
                  </label>
                  <Input
                    id="refresh-limit"
                    type="number"
                    min="0"
                    max={maxCount}
                    step="1"
                    className="w-32"
                    value={clampedLimit}
                    onChange={(e) => handleLimitChange(e.target.value)}
                    disabled={!preview.hasKey || maxCount === 0 || refreshMutation.isPending}
                  />
                </div>
                <div className="pb-2 text-xs text-muted-foreground">
                  Recommendation is soft. Use fewer to ration daily credits, or up to the known maximum.
                </div>
              </div>
            </div>

            {lastRun && <RunSummary result={lastRun} />}
          </div>
        ) : null}

        <DialogFooter className="gap-2 sm:gap-0">
          {preview && !preview.hasKey ? (
            <Button onClick={goToSettings}>
              <ExternalLink className="h-4 w-4" />
              Open Settings
            </Button>
          ) : (
            <Button
              onClick={() => refreshMutation.mutate()}
              disabled={!canRefresh}
            >
              {refreshMutation.isPending ? 'Refreshing...' : `Refresh ${clampedLimit} holding${clampedLimit !== 1 ? 's' : ''}`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LimitStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold tabular-nums">{formatNumber(value, 0)}</p>
    </div>
  );
}

function UsagePanel({ usage }: { usage?: TwelveDataUsage }) {
  if (!usage) {
    return (
      <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
        Twelve Data usage was unavailable. Blurly will refresh conservatively.
      </div>
    );
  }

  const minuteRemaining =
    usage.planLimit != null ? Math.max(usage.planLimit - (usage.currentUsage ?? 0), 0) : null;
  const dailyRemaining =
    usage.planDailyLimit != null ? Math.max(usage.planDailyLimit - (usage.dailyUsage ?? 0), 0) : null;

  return (
    <div className="rounded-md border p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-sm font-medium">Twelve Data limits</p>
        {usage.planCategory && <Badge variant="outline">{usage.planCategory}</Badge>}
      </div>
      <div className="grid gap-3 text-sm sm:grid-cols-2">
        <QuotaLine
          label="This minute"
          used={usage.currentUsage}
          limit={usage.planLimit}
          remaining={minuteRemaining}
        />
        <QuotaLine
          label="Today"
          used={usage.dailyUsage}
          limit={usage.planDailyLimit}
          remaining={dailyRemaining}
        />
      </div>
    </div>
  );
}

function QuotaLine({
  label,
  used,
  limit,
  remaining,
}: {
  label: string;
  used?: number;
  limit?: number;
  remaining: number | null;
}) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="tabular-nums">
        {used != null && limit != null
          ? `${formatNumber(used, 0)} / ${formatNumber(limit, 0)}`
          : 'Not reported'}
      </p>
      {remaining != null && (
        <p className="text-xs text-muted-foreground">
          {formatNumber(remaining, 0)} remaining
        </p>
      )}
    </div>
  );
}

function RunSummary({ result }: { result: PriceRefreshRunResult }) {
  const failures = result.results.filter((r) => r.status === 'failed');

  return (
    <div className="space-y-3 rounded-md border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <CheckCircle2 className="h-4 w-4 text-green-600" />
        <p className="text-sm font-medium">
          Updated {result.updated} of {result.attempted} attempted
        </p>
        <Badge variant="outline">
          ~{result.estimatedCreditsUsed} credit{result.estimatedCreditsUsed !== 1 ? 's' : ''}
        </Badge>
      </div>
      {failures.length > 0 && (
        <div className="max-h-28 overflow-y-auto rounded border bg-muted/30 p-2">
          {failures.map((failure) => (
            <p key={failure.id} className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{failure.symbol}</span>: {failure.message}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
