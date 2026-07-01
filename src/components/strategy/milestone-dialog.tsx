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
import { cn } from '@/lib/utils';
import { todayIso } from '@/lib/formatters';
import type {
  MilestoneCurrency,
  MilestoneIcon,
  NewStrategyMilestone,
  StrategyMilestone,
  UpdateStrategyMilestone,
} from '@/lib/types';
import { MILESTONE_ICON_OPTIONS, getMilestoneIcon } from './milestone-icons';

type Mode =
  | { kind: 'create' }
  | { kind: 'edit'; milestone: StrategyMilestone };

interface MilestoneDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: Mode;
  defaultSortOrder: number;
  onCreate: (input: NewStrategyMilestone) => void;
  onUpdate: (id: string, input: UpdateStrategyMilestone) => void;
  onDelete: (id: string) => void;
  isSaving: boolean;
  isDeleting: boolean;
}

interface FormState {
  label: string;
  description: string;
  targetDate: string;
  targetAmount: string;
  targetCurrency: MilestoneCurrency;
  icon: MilestoneIcon | 'none';
}

function initialState(mode: Mode): FormState {
  if (mode.kind === 'edit') {
    const m = mode.milestone;
    return {
      label: m.label,
      description: m.description ?? '',
      targetDate: m.targetDate,
      targetAmount: m.targetAmount != null ? String(m.targetAmount) : '',
      targetCurrency: (m.targetCurrency as MilestoneCurrency) ?? 'USD',
      icon: (m.icon as MilestoneIcon | undefined) ?? 'none',
    };
  }
  return {
    label: '',
    description: '',
    targetDate: todayIso(),
    targetAmount: '',
    targetCurrency: 'USD',
    icon: 'none',
  };
}

export function MilestoneDialog({
  open,
  onOpenChange,
  mode,
  defaultSortOrder,
  onCreate,
  onUpdate,
  onDelete,
  isSaving,
  isDeleting,
}: MilestoneDialogProps) {
  const [state, setState] = useState<FormState>(() => initialState(mode));

  useEffect(() => {
    if (open) setState(initialState(mode));
  }, [open, mode]);

  const isEdit = mode.kind === 'edit';
  const canSave = state.label.trim().length > 0;

  function handleSave() {
    if (!canSave) return;
    const amount = state.targetAmount ? Number(state.targetAmount) : undefined;
    const currency = amount != null ? state.targetCurrency : undefined;
    const icon = state.icon === 'none' ? undefined : state.icon;
    if (isEdit) {
      const m = (mode as Extract<Mode, { kind: 'edit' }>).milestone;
      onUpdate(m.id, {
        label: state.label.trim(),
        description: state.description.trim() || null,
        targetDate: state.targetDate,
        targetAmount: amount ?? null,
        targetCurrency: (currency as MilestoneCurrency | undefined) ?? null,
        icon: icon ?? null,
      });
    } else {
      const input: NewStrategyMilestone = {
        label: state.label.trim(),
        description: state.description.trim() || undefined,
        targetDate: state.targetDate,
        targetAmount: amount,
        targetCurrency: currency,
        sortOrder: defaultSortOrder,
        icon,
      };
      onCreate(input);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit milestone' : 'Add milestone'}</DialogTitle>
          <DialogDescription>
            Give the analyst a concrete target so it can reason about time horizon and required funding.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="milestone-label">Label</Label>
            <Input
              id="milestone-label"
              value={state.label}
              onChange={(e) => setState((s) => ({ ...s, label: e.target.value }))}
              placeholder="House deposit"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="milestone-date">Target date</Label>
              <Input
                id="milestone-date"
                type="date"
                value={state.targetDate}
                onChange={(e) => setState((s) => ({ ...s, targetDate: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="milestone-icon">Icon</Label>
              <Select
                value={state.icon}
                onValueChange={(v) => setState((s) => ({ ...s, icon: v as MilestoneIcon | 'none' }))}
              >
                <SelectTrigger id="milestone-icon">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Generic</SelectItem>
                  {MILESTONE_ICON_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      <span className="inline-flex items-center gap-2">
                        <opt.Icon className="h-4 w-4" />
                        {opt.label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_8rem]">
            <div className="space-y-2">
              <Label htmlFor="milestone-amount">Target amount</Label>
              <Input
                id="milestone-amount"
                type="number"
                min="0"
                step="any"
                value={state.targetAmount}
                onChange={(e) => setState((s) => ({ ...s, targetAmount: e.target.value }))}
                placeholder="50000"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="milestone-currency">Currency</Label>
              <Select
                value={state.targetCurrency}
                onValueChange={(v) => setState((s) => ({ ...s, targetCurrency: v as MilestoneCurrency }))}
              >
                <SelectTrigger id="milestone-currency">
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
            <Label htmlFor="milestone-description">Description</Label>
            <Textarea
              id="milestone-description"
              value={state.description}
              onChange={(e) => setState((s) => ({ ...s, description: e.target.value }))}
              placeholder="Optional context for the analyst — how you plan to fund it, constraints, etc."
              rows={3}
            />
          </div>

          {isEdit && (
            <div className="rounded-md border bg-muted/30 p-2 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-2">
                {(() => {
                  const Icon = getMilestoneIcon(state.icon === 'none' ? null : state.icon);
                  return <Icon className={cn('h-4 w-4')} />;
                })()}
                <span>Preview: {state.label || '(no label)'} · {state.targetDate}</span>
              </span>
            </div>
          )}
        </div>

        <DialogFooter className="justify-between sm:justify-between">
          <div>
            {isEdit && (
              <Button
                variant="ghost"
                onClick={() => onDelete((mode as Extract<Mode, { kind: 'edit' }>).milestone.id)}
                disabled={isDeleting}
                title="Delete milestone"
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
              {isEdit ? 'Save' : 'Add milestone'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
