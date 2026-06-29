import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Plus, RefreshCw } from 'lucide-react';
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
  const [updatePricesOpen, setUpdatePricesOpen] = useState(false);
  const [webRefreshOpen, setWebRefreshOpen] = useState(false);
  const [selectedHoldingId, setSelectedHoldingId] = useState<string | null>(null);

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
  const holdingsWithValues = computeHoldingsWithValues(rawHoldings ?? [], baseCurrency);

  function openUpdatePrices(holding?: HoldingWithComputedValues) {
    setSelectedHoldingId(holding?.id ?? null);
    setUpdatePricesOpen(true);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Holdings</h2>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => openUpdatePrices()} disabled={holdingsWithValues.length === 0}>
            <RefreshCw className="h-4 w-4" />
            Update Prices
          </Button>
          <Button variant="outline" onClick={() => setWebRefreshOpen(true)} disabled={holdingsWithValues.length === 0}>
            <RefreshCw className="h-4 w-4" />
            Refresh from Web
          </Button>
          <Button onClick={() => navigate('/holdings/add')}>
            <Plus className="h-4 w-4" />
            Add Holding
          </Button>
        </div>
      </div>

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
