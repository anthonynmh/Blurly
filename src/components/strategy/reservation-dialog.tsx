import { useEffect, useState } from 'react';
import { Save, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import type {
  Holding,
  MilestoneCurrency,
  NewStrategyCashReservation,
  StrategyCashReservation,
  StrategyMilestone,
  UpdateStrategyCashReservation,
} from '@/lib/types';

type Mode =
  | { kind: 'create'; holdingId?: string; milestoneId?: string }
  | { kind: 'edit'; reservation: StrategyCashReservation };

interface ReservationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: Mode;
  cashHoldings: Holding[];
  milestones: StrategyMilestone[];
  onCreate: (input: NewStrategyCashReservation) => void;
  onUpdate: (id: string, input: UpdateStrategyCashReservation) => void;
  onDelete: (id: string) => void;
  isSaving: boolean;
  isDeleting: boolean;
}

interface FormState {
  holdingId: string;
  milestoneId: string;
  amount: string;
  currency: MilestoneCurrency;
  notes: string;
}

function initialState(mode: Mode, cashHoldings: Holding[], milestones: StrategyMilestone[]): FormState {
  if (mode.kind === 'edit') {
    const r = mode.reservation;
    return {
      holdingId: r.holdingId,
      milestoneId: r.milestoneId,
      amount: String(r.amount),
      currency: r.currency,
      notes: r.notes ?? '',
    };
  }
  const holdingId = mode.holdingId ?? cashHoldings[0]?.id ?? '';
  const milestoneId = mode.milestoneId ?? milestones[0]?.id ?? '';
  const holdingCurrency = cashHoldings.find((h) => h.id === holdingId)?.currency;
  const currency: MilestoneCurrency =
    holdingCurrency === 'SGD' || holdingCurrency === 'USD' ? holdingCurrency : 'USD';
  return { holdingId, milestoneId, amount: '', currency, notes: '' };
}

export function ReservationDialog({
  open,
  onOpenChange,
  mode,
  cashHoldings,
  milestones,
  onCreate,
  onUpdate,
  onDelete,
  isSaving,
  isDeleting,
}: ReservationDialogProps) {
  const [state, setState] = useState<FormState>(() => initialState(mode, cashHoldings, milestones));

  useEffect(() => {
    if (open) setState(initialState(mode, cashHoldings, milestones));
  }, [open, mode, cashHoldings, milestones]);

  const isEdit = mode.kind === 'edit';
  const amountNumber = Number(state.amount);
  const canSave =
    state.holdingId !== '' &&
    state.milestoneId !== '' &&
    state.amount !== '' &&
    Number.isFinite(amountNumber) &&
    amountNumber >= 0;

  function handleSave() {
    if (!canSave) return;
    if (isEdit) {
      const r = (mode as Extract<Mode, { kind: 'edit' }>).reservation;
      onUpdate(r.id, {
        holdingId: state.holdingId,
        milestoneId: state.milestoneId,
        amount: amountNumber,
        currency: state.currency,
        notes: state.notes.trim() ? state.notes.trim() : null,
      });
    } else {
      onCreate({
        holdingId: state.holdingId,
        milestoneId: state.milestoneId,
        amount: amountNumber,
        currency: state.currency,
        notes: state.notes.trim() || undefined,
        sortOrder: 0,
      });
    }
  }

  const noHoldings = cashHoldings.length === 0;
  const noMilestones = milestones.length === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit reservation' : 'Link cash to a milestone'}</DialogTitle>
          <DialogDescription>
            Marks part of a cash-equivalent holding as untouchable so the analyst treats it as milestone
            funding rather than cash drag.
          </DialogDescription>
        </DialogHeader>

        {(noHoldings || noMilestones) && (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-300">
            {noHoldings && <p>Add a Cash or MoneyMarket holding first.</p>}
            {noMilestones && <p>Add a milestone first.</p>}
          </div>
        )}

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="reservation-holding">Cash-equivalent holding</Label>
            <Select
              value={state.holdingId}
              onValueChange={(v) => setState((s) => ({ ...s, holdingId: v }))}
              disabled={noHoldings}
            >
              <SelectTrigger id="reservation-holding">
                <SelectValue placeholder="Pick a holding" />
              </SelectTrigger>
              <SelectContent>
                {cashHoldings.map((h) => (
                  <SelectItem key={h.id} value={h.id}>
                    {h.symbol}
                    {h.name ? ` — ${h.name}` : ''} ({h.currency})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="reservation-milestone">Milestone</Label>
            <Select
              value={state.milestoneId}
              onValueChange={(v) => setState((s) => ({ ...s, milestoneId: v }))}
              disabled={noMilestones}
            >
              <SelectTrigger id="reservation-milestone">
                <SelectValue placeholder="Pick a milestone" />
              </SelectTrigger>
              <SelectContent>
                {milestones.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.label} ({m.targetDate})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-[1fr_8rem] gap-3">
            <div className="space-y-2">
              <Label htmlFor="reservation-amount">Amount</Label>
              <Input
                id="reservation-amount"
                type="number"
                min="0"
                step="any"
                value={state.amount}
                onChange={(e) => setState((s) => ({ ...s, amount: e.target.value }))}
                placeholder="20000"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reservation-currency">Currency</Label>
              <Select
                value={state.currency}
                onValueChange={(v) => setState((s) => ({ ...s, currency: v as MilestoneCurrency }))}
              >
                <SelectTrigger id="reservation-currency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="SGD">SGD</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="reservation-notes">Notes</Label>
            <Textarea
              id="reservation-notes"
              value={state.notes}
              onChange={(e) => setState((s) => ({ ...s, notes: e.target.value }))}
              placeholder="Optional context"
              rows={2}
            />
          </div>
        </div>

        <DialogFooter className="justify-between sm:justify-between">
          <div>
            {isEdit && (
              <Button
                variant="ghost"
                onClick={() => onDelete((mode as Extract<Mode, { kind: 'edit' }>).reservation.id)}
                disabled={isDeleting}
              >
                <Trash2 className="h-4 w-4" />
                Delete
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={!canSave || isSaving}>
              <Save className="h-4 w-4" />
              {isEdit ? 'Save' : 'Link'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
