import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, Plus, Save, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { strategyService } from '@/services/strategy-service';
import { describeMilestoneCountdown } from '@/lib/analysis';
import { formatCurrency, formatDate, todayIso } from '@/lib/formatters';
import type { InvestorPersonality, StrategyMilestone } from '@/lib/types';
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

export default function StrategyPage() {
  const queryClient = useQueryClient();
  const [notes, setNotes] = useState('');
  const [newMilestone, setNewMilestone] = useState({
    label: '',
    description: '',
    targetDate: todayIso(),
    targetAmount: '',
    targetCurrency: 'USD',
  });

  const { data: strategy, isLoading: strategyLoading } = useQuery({
    queryKey: ['investment-strategy'],
    queryFn: () => strategyService.get(),
  });
  const { data: milestones, isLoading: milestonesLoading } = useQuery({
    queryKey: ['strategy-milestones'],
    queryFn: () => strategyService.listMilestones(),
  });

  useEffect(() => {
    if (strategy) {
      setNotes(strategy.notes ?? '');
    }
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
      setNewMilestone({
        label: '',
        description: '',
        targetDate: todayIso(),
        targetAmount: '',
        targetCurrency: 'USD',
      });
      void queryClient.invalidateQueries({ queryKey: ['strategy-milestones'] });
      toast.success('Milestone added');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const updateMilestone = useMutation({
    mutationFn: ({ id, input }: { id: string; input: Parameters<typeof strategyService.updateMilestone>[1] }) =>
      strategyService.updateMilestone(id, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['strategy-milestones'] });
      toast.success('Milestone saved');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMilestone = useMutation({
    mutationFn: strategyService.deleteMilestone,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['strategy-milestones'] });
      toast.success('Milestone deleted');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const isLoading = strategyLoading || milestonesLoading;
  const selectedPersonality = strategy?.investorPersonality ?? 'hybrid';

  function saveNotes() {
    updateStrategy.mutate({ notes: notes.trim() ? notes.trim() : null });
  }

  function addMilestone() {
    if (!newMilestone.label.trim()) {
      toast.error('Milestone label is required');
      return;
    }
    createMilestone.mutate({
      label: newMilestone.label.trim(),
      description: newMilestone.description.trim() || undefined,
      targetDate: newMilestone.targetDate,
      targetAmount: newMilestone.targetAmount ? Number(newMilestone.targetAmount) : undefined,
      targetCurrency: newMilestone.targetAmount ? newMilestone.targetCurrency : undefined,
      sortOrder: milestones?.length ?? 0,
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Strategy</h1>
        <p className="text-sm text-muted-foreground">
          Investor personality, time horizon, and milestones used by the analyst.
        </p>
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
                        active ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted',
                      )}
                    >
                      <span className="block text-sm font-semibold">{personality.label}</span>
                      <span className={cn('mt-1 block text-xs', active ? 'opacity-85' : 'text-muted-foreground')}>
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
            <CardHeader>
              <CardTitle>Milestones</CardTitle>
              <CardDescription>Target dates give the analyst a concrete time horizon.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid grid-cols-1 gap-3 rounded-md border bg-muted/20 p-3 md:grid-cols-6">
                <div className="space-y-1 md:col-span-2">
                  <Label htmlFor="new-milestone-label">Label</Label>
                  <Input
                    id="new-milestone-label"
                    value={newMilestone.label}
                    onChange={(e) => setNewMilestone((m) => ({ ...m, label: e.target.value }))}
                    placeholder="House deposit"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="new-milestone-date">Target date</Label>
                  <Input
                    id="new-milestone-date"
                    type="date"
                    value={newMilestone.targetDate}
                    onChange={(e) => setNewMilestone((m) => ({ ...m, targetDate: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="new-milestone-amount">Amount</Label>
                  <Input
                    id="new-milestone-amount"
                    type="number"
                    min="0"
                    step="any"
                    value={newMilestone.targetAmount}
                    onChange={(e) => setNewMilestone((m) => ({ ...m, targetAmount: e.target.value }))}
                    placeholder="50000"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="new-milestone-currency">Currency</Label>
                  <Input
                    id="new-milestone-currency"
                    value={newMilestone.targetCurrency}
                    onChange={(e) => setNewMilestone((m) => ({ ...m, targetCurrency: e.target.value.toUpperCase() }))}
                    maxLength={3}
                  />
                </div>
                <div className="flex items-end">
                  <Button className="w-full" onClick={addMilestone} disabled={createMilestone.isPending}>
                    <Plus className="h-4 w-4" />
                    Add
                  </Button>
                </div>
                <div className="space-y-1 md:col-span-6">
                  <Label htmlFor="new-milestone-description">Description</Label>
                  <Input
                    id="new-milestone-description"
                    value={newMilestone.description}
                    onChange={(e) => setNewMilestone((m) => ({ ...m, description: e.target.value }))}
                    placeholder="Optional context for the analyst"
                  />
                </div>
              </div>

              {milestones && milestones.length > 0 ? (
                <div className="space-y-3">
                  {milestones.map((milestone, index) => (
                    <MilestoneRow
                      key={milestone.id}
                      milestone={milestone}
                      index={index}
                      onSave={(input) => updateMilestone.mutate({ id: milestone.id, input })}
                      onDelete={() => deleteMilestone.mutate(milestone.id)}
                      isSaving={updateMilestone.isPending}
                      isDeleting={deleteMilestone.isPending}
                    />
                  ))}
                </div>
              ) : (
                <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                  No milestones yet.
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function MilestoneRow({
  milestone,
  index,
  onSave,
  onDelete,
  isSaving,
  isDeleting,
}: {
  milestone: StrategyMilestone;
  index: number;
  onSave: (input: Parameters<typeof strategyService.updateMilestone>[1]) => void;
  onDelete: () => void;
  isSaving: boolean;
  isDeleting: boolean;
}) {
  const [label, setLabel] = useState(milestone.label);
  const [description, setDescription] = useState(milestone.description ?? '');
  const [targetDate, setTargetDate] = useState(milestone.targetDate);
  const [targetAmount, setTargetAmount] = useState(
    milestone.targetAmount != null ? String(milestone.targetAmount) : '',
  );
  const [targetCurrency, setTargetCurrency] = useState(milestone.targetCurrency ?? 'USD');
  const countdown = describeMilestoneCountdown(milestone.targetDate);
  const overdue = countdown.startsWith('overdue');

  return (
    <div className="grid grid-cols-1 gap-3 rounded-md border p-3 md:grid-cols-[2rem_1.5fr_1fr_1fr_auto]">
      <div className="flex items-start justify-center pt-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-xs font-semibold">
          {index + 1}
        </span>
      </div>
      <div className="space-y-2">
        <Input value={label} onChange={(e) => setLabel(e.target.value)} />
        <Input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Optional description"
        />
      </div>
      <div className="space-y-2">
        <Input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
        <Badge
          variant="secondary"
          className={cn(
            'gap-1',
            overdue ? 'border-amber-500/30 bg-amber-500/15 text-amber-700 dark:text-amber-400' : '',
          )}
        >
          <CalendarDays className="h-3 w-3" />
          {countdown}
        </Badge>
        <p className="text-xs text-muted-foreground">{formatDate(milestone.targetDate)}</p>
      </div>
      <div className="space-y-2">
        <Input
          type="number"
          min="0"
          step="any"
          value={targetAmount}
          onChange={(e) => setTargetAmount(e.target.value)}
          placeholder="Amount"
        />
        <Input
          value={targetCurrency}
          onChange={(e) => setTargetCurrency(e.target.value.toUpperCase())}
          maxLength={3}
        />
        {milestone.targetAmount != null && milestone.targetCurrency && (
          <p className="text-xs text-muted-foreground">
            {formatCurrency(milestone.targetAmount, milestone.targetCurrency)}
          </p>
        )}
      </div>
      <div className="flex items-start gap-2">
        <Button
          variant="outline"
          size="icon"
          onClick={() =>
            onSave({
              label: label.trim(),
              description: description.trim() || null,
              targetDate,
              targetAmount: targetAmount ? Number(targetAmount) : null,
              targetCurrency: targetAmount ? targetCurrency.trim().toUpperCase() : null,
              sortOrder: index,
            })
          }
          disabled={isSaving || !label.trim()}
          title="Save milestone"
        >
          <Save className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={onDelete}
          disabled={isDeleting}
          title="Delete milestone"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
