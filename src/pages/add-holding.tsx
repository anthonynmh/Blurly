import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { HoldingForm, type HoldingFormValues } from '@/components/holding-form';
import { holdingService } from '@/services/holding-service';
import type { NewHolding } from '@/lib/types';

export default function AddHoldingPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (input: NewHolding) => holdingService.create(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['holdings', 'default'] });
      toast.success('Holding added');
      navigate('/holdings');
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  async function handleSubmit(values: HoldingFormValues) {
    const input: NewHolding = {
      portfolioId: 'default',
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
        <h2 className="text-2xl font-bold">Add Holding</h2>
      </div>

      <HoldingForm
        onSubmit={handleSubmit}
        isSubmitting={mutation.isPending}
        submitLabel="Add Holding"
      />
    </div>
  );
}
