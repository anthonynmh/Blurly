import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { HoldingsTable } from '@/components/holdings-table';
import { EmptyState } from '@/components/empty-state';
import { holdingService } from '@/services/holding-service';
import { portfolioService } from '@/services/portfolio-service';
import { computeHoldingsWithValues } from '@/lib/calculations';

export default function HoldingsPage() {
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
  const holdingsWithValues = computeHoldingsWithValues(rawHoldings ?? [], baseCurrency);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Holdings</h2>
        <Button onClick={() => navigate('/holdings/add')}>
          <Plus className="h-4 w-4" />
          Add Holding
        </Button>
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
        />
      )}
    </div>
  );
}
