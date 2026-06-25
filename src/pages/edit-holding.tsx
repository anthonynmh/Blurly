import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { HoldingForm, holdingToFormValues, type HoldingFormValues } from '@/components/holding-form';
import { holdingService } from '@/services/holding-service';
import type { UpdateHolding } from '@/lib/types';

export default function EditHoldingPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: holding, isLoading } = useQuery({
    queryKey: ['holding', id],
    queryFn: () => holdingService.get(id!),
    enabled: !!id,
  });

  const mutation = useMutation({
    mutationFn: (input: UpdateHolding) => holdingService.update(id!, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['holdings', 'default'] });
      void queryClient.invalidateQueries({ queryKey: ['holding', id] });
      toast.success('Holding updated');
      navigate('/holdings');
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  async function handleSubmit(values: HoldingFormValues) {
    const input: UpdateHolding = {
      symbol: values.symbol,
      name: values.name || undefined,
      assetClass: values.assetClass,
      quantity: values.quantity,
      averagePrice: values.averagePrice,
      currentPrice: values.currentPrice,
      currency: values.currency,
      sector: values.sector || undefined,
      region: values.region || undefined,
      broker: values.broker || undefined,
      asOfDate: values.asOfDate,
      notes: values.notes || undefined,
    };
    await mutation.mutateAsync(input);
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h2 className="text-2xl font-bold">Edit Holding</h2>
      </div>

      {isLoading ? (
        <Skeleton className="h-96" />
      ) : holding ? (
        <HoldingForm
          defaultValues={holdingToFormValues(holding)}
          onSubmit={handleSubmit}
          isSubmitting={mutation.isPending}
          submitLabel="Update Holding"
        />
      ) : (
        <p className="text-sm text-muted-foreground">Holding not found.</p>
      )}
    </div>
  );
}
