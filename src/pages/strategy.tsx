import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MapPin, Plus, Save } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { EmptyState } from '@/components/empty-state';
import { MilestoneTimeline } from '@/components/strategy/milestone-timeline';
import { MilestoneDialog } from '@/components/strategy/milestone-dialog';
import { UntouchablesPanel } from '@/components/strategy/untouchables-panel';
import { ReservationDialog } from '@/components/strategy/reservation-dialog';
import { holdingService } from '@/services/holding-service';
import { settingsService } from '@/services/settings-service';
import { strategyService } from '@/services/strategy-service';
import { strategyReservationsService } from '@/services/strategy-reservations-service';
import {
  computeCashReservationSplit,
  computeMilestoneReservations,
} from '@/lib/calculations';
import type {
  InvestorPersonality,
  StrategyCashReservation,
  StrategyMilestone,
} from '@/lib/types';
import { cn } from '@/lib/utils';

const PERSONALITIES: {
  value: InvestorPersonality;
  label: string;
  description: string;
}[] = [
  { value: 'passive', label: 'Passive', description: 'Long-term allocation, low turnover.' },
  { value: 'hybrid', label: 'Hybrid', description: 'Core allocation with selected active choices.' },
  { value: 'active', label: 'Active', description: 'Higher-touch monitoring and tactical changes.' },
];

type MilestoneDialogMode =
  | { kind: 'create' }
  | { kind: 'edit'; milestone: StrategyMilestone }
  | null;

type ReservationDialogMode =
  | { kind: 'create'; holdingId?: string; milestoneId?: string }
  | { kind: 'edit'; reservation: StrategyCashReservation }
  | null;

export default function StrategyPage() {
  const queryClient = useQueryClient();
  const [notes, setNotes] = useState('');
  const [milestoneDialog, setMilestoneDialog] = useState<MilestoneDialogMode>(null);
  const [reservationDialog, setReservationDialog] = useState<ReservationDialogMode>(null);

  const { data: strategy, isLoading: strategyLoading } = useQuery({
    queryKey: ['investment-strategy'],
    queryFn: () => strategyService.get(),
  });
  const { data: milestones, isLoading: milestonesLoading } = useQuery({
    queryKey: ['strategy-milestones'],
    queryFn: () => strategyService.listMilestones(),
  });
  const { data: reservations } = useQuery({
    queryKey: ['strategy-cash-reservations'],
    queryFn: () => strategyReservationsService.list(),
  });
  const { data: holdings } = useQuery({
    queryKey: ['holdings', 'default'],
    queryFn: () => holdingService.list('default'),
  });
  const { data: appSettings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => settingsService.get(),
  });

  useEffect(() => {
    if (strategy) setNotes(strategy.notes ?? '');
  }, [strategy]);

  const updateStrategy = useMutation({
    mutationFn: strategyService.update,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['investment-strategy'] });
      toast.success('Strategy saved');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const createMilestone = useMutation({
    mutationFn: strategyService.createMilestone,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['strategy-milestones'] });
      setMilestoneDialog(null);
      toast.success('Milestone added');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const updateMilestone = useMutation({
    mutationFn: ({ id, input }: { id: string; input: Parameters<typeof strategyService.updateMilestone>[1] }) =>
      strategyService.updateMilestone(id, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['strategy-milestones'] });
      setMilestoneDialog(null);
      toast.success('Milestone saved');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMilestone = useMutation({
    mutationFn: strategyService.deleteMilestone,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['strategy-milestones'] });
      void queryClient.invalidateQueries({ queryKey: ['strategy-cash-reservations'] });
      setMilestoneDialog(null);
      toast.success('Milestone deleted');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const createReservation = useMutation({
    mutationFn: strategyReservationsService.create,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['strategy-cash-reservations'] });
      setReservationDialog(null);
      toast.success('Reservation linked');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const updateReservation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: Parameters<typeof strategyReservationsService.update>[1] }) =>
      strategyReservationsService.update(id, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['strategy-cash-reservations'] });
      setReservationDialog(null);
      toast.success('Reservation updated');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteReservation = useMutation({
    mutationFn: strategyReservationsService.delete,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['strategy-cash-reservations'] });
      setReservationDialog(null);
      toast.success('Reservation removed');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const isLoading = strategyLoading || milestonesLoading;
  const selectedPersonality = strategy?.investorPersonality ?? 'hybrid';
  const activePersonalityMeta = PERSONALITIES.find((p) => p.value === selectedPersonality);
  const fxRate = appSettings?.fxUsdSgdRate;

  const sortedMilestones = useMemo(() => {
    const list = [...(milestones ?? [])];
    // Timeline reads best in chronological order regardless of sort_order.
    return list.sort((a, b) => a.targetDate.localeCompare(b.targetDate));
  }, [milestones]);

  const cashHoldings = useMemo(
    () =>
      (holdings ?? []).filter(
        (h) => h.assetClass === 'Cash' || h.assetClass === 'MoneyMarket',
      ),
    [holdings],
  );

  const reservationSplit = useMemo(
    () =>
      computeCashReservationSplit(
        holdings ?? [],
        reservations ?? [],
        appSettings?.baseCurrency ?? 'USD',
        fxRate,
      ),
    [holdings, reservations, appSettings, fxRate],
  );

  const milestoneReservationSummaries = useMemo(
    () => computeMilestoneReservations(milestones ?? [], reservations ?? [], fxRate),
    [milestones, reservations, fxRate],
  );

  function saveNotes() {
    updateStrategy.mutate({ notes: notes.trim() ? notes.trim() : null });
  }

  const totalMilestones = milestones?.length ?? 0;
  const totalReservationsCount = reservations?.length ?? 0;

  return (
    <div className="space-y-6">
      <div className="rounded-lg border bg-gradient-to-br from-primary/5 to-transparent p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Strategy</h1>
            <p className="text-sm text-muted-foreground">
              Investor personality, time horizon, and milestones the analyst uses to reason about your portfolio.
            </p>
          </div>
          <div className="text-right text-xs text-muted-foreground">
            <div>
              <span className="font-medium text-foreground capitalize">{selectedPersonality}</span> tilt
              {' · '}
              {totalMilestones} milestone{totalMilestones === 1 ? '' : 's'}
              {totalReservationsCount > 0 && ' · '}
              {totalReservationsCount > 0 && `${totalReservationsCount} reserved`}
            </div>
            {activePersonalityMeta && (
              <div className="mt-0.5 max-w-xs">{activePersonalityMeta.description}</div>
            )}
          </div>
        </div>
      </div>

      {isLoading ? (
        <Skeleton className="h-64" />
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Investor personality</CardTitle>
              <CardDescription>Sets the strategy lens for portfolio reviews.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-2 md:grid-cols-3" role="radiogroup">
                {PERSONALITIES.map((personality) => {
                  const active = selectedPersonality === personality.value;
                  return (
                    <button
                      key={personality.value}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => updateStrategy.mutate({ investorPersonality: personality.value })}
                      className={cn(
                        'rounded-md border p-3 text-left transition-colors',
                        active
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'hover:bg-muted',
                      )}
                    >
                      <span className="block text-sm font-semibold">{personality.label}</span>
                      <span
                        className={cn(
                          'mt-1 block text-xs',
                          active ? 'opacity-85' : 'text-muted-foreground',
                        )}
                      >
                        {personality.description}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="space-y-2">
                <Label htmlFor="strategy-notes">Strategy notes</Label>
                <Textarea
                  id="strategy-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Target allocation, constraints, income needs, tax notes..."
                  rows={4}
                />
                <Button onClick={saveNotes} disabled={updateStrategy.isPending}>
                  <Save className="h-4 w-4" />
                  Save notes
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-3">
              <div>
                <CardTitle>Milestones</CardTitle>
                <CardDescription>Target dates give the analyst a concrete time horizon.</CardDescription>
              </div>
              <Button onClick={() => setMilestoneDialog({ kind: 'create' })}>
                <Plus className="h-4 w-4" />
                Add milestone
              </Button>
            </CardHeader>
            <CardContent>
              {sortedMilestones.length > 0 ? (
                <MilestoneTimeline
                  milestones={sortedMilestones}
                  reservationSummaries={milestoneReservationSummaries}
                  onEdit={(m) => setMilestoneDialog({ kind: 'edit', milestone: m })}
                />
              ) : (
                <EmptyState
                  icon={MapPin}
                  title="Plot your first milestone"
                  description="Add a target date (house, wedding, career break) so the analyst can size time horizon and required funding."
                  actionLabel="Add your first milestone"
                  onAction={() => setMilestoneDialog({ kind: 'create' })}
                />
              )}
            </CardContent>
          </Card>

          <UntouchablesPanel
            cashHoldings={cashHoldings}
            reservations={reservations ?? []}
            milestones={milestones ?? []}
            perHolding={reservationSplit.perHolding}
            onAdd={(holdingId) => setReservationDialog({ kind: 'create', holdingId })}
            onEdit={(r) => setReservationDialog({ kind: 'edit', reservation: r })}
          />
        </>
      )}

      {milestoneDialog && (
        <MilestoneDialog
          open={!!milestoneDialog}
          onOpenChange={(open) => !open && setMilestoneDialog(null)}
          mode={milestoneDialog}
          defaultSortOrder={milestones?.length ?? 0}
          onCreate={(input) => createMilestone.mutate(input)}
          onUpdate={(id, input) => updateMilestone.mutate({ id, input })}
          onDelete={(id) => deleteMilestone.mutate(id)}
          isSaving={createMilestone.isPending || updateMilestone.isPending}
          isDeleting={deleteMilestone.isPending}
        />
      )}

      {reservationDialog && (
        <ReservationDialog
          open={!!reservationDialog}
          onOpenChange={(open) => !open && setReservationDialog(null)}
          mode={reservationDialog}
          cashHoldings={cashHoldings}
          milestones={milestones ?? []}
          onCreate={(input) => createReservation.mutate(input)}
          onUpdate={(id, input) => updateReservation.mutate({ id, input })}
          onDelete={(id) => deleteReservation.mutate(id)}
          isSaving={createReservation.isPending || updateReservation.isPending}
          isDeleting={deleteReservation.isPending}
        />
      )}
    </div>
  );
}
