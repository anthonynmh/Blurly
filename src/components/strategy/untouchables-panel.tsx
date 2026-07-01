import { useState } from 'react';
import { AlertTriangle, Lock, Plus } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/empty-state';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/formatters';
import type { HoldingCashSplit } from '@/lib/calculations';
import type { Holding, StrategyCashReservation, StrategyMilestone } from '@/lib/types';

interface UntouchablesPanelProps {
  cashHoldings: Holding[];
  reservations: StrategyCashReservation[];
  milestones: StrategyMilestone[];
  perHolding: Map<string, HoldingCashSplit>;
  onAdd: (holdingId?: string) => void;
  onEdit: (reservation: StrategyCashReservation) => void;
}

export function UntouchablesPanel({
  cashHoldings,
  reservations,
  milestones,
  perHolding,
  onAdd,
  onEdit,
}: UntouchablesPanelProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="inline-flex items-center gap-2 text-base">
            <Lock className="h-4 w-4 text-muted-foreground" />
            Untouchables
          </CardTitle>
          <CardDescription>
            Cash and money-market holdings reserved for milestones so the analyst treats them as ring-fenced.
          </CardDescription>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onAdd()}
          disabled={cashHoldings.length === 0 || milestones.length === 0}
        >
          <Plus className="h-4 w-4" />
          Link reservation
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {cashHoldings.length === 0 ? (
          <EmptyState
            icon={Lock}
            title="No cash-equivalent holdings"
            description="Add a Cash or MoneyMarket holding to link reservations."
          />
        ) : (
          cashHoldings.map((h) => (
            <HoldingRow
              key={h.id}
              holding={h}
              split={perHolding.get(h.id)}
              reservations={reservations.filter((r) => r.holdingId === h.id)}
              milestones={milestones}
              onAdd={() => onAdd(h.id)}
              onEdit={onEdit}
            />
          ))
        )}
      </CardContent>
    </Card>
  );
}

function HoldingRow({
  holding,
  split,
  reservations,
  milestones,
  onAdd,
  onEdit,
}: {
  holding: Holding;
  split: HoldingCashSplit | undefined;
  reservations: StrategyCashReservation[];
  milestones: StrategyMilestone[];
  onAdd: () => void;
  onEdit: (r: StrategyCashReservation) => void;
}) {
  const [expanded, setExpanded] = useState(reservations.length > 0);
  const totalValue = split?.totalValue ?? 0;
  const totalReserved = split?.totalReserved ?? 0;
  const available = split?.available ?? totalValue;
  const overReserved = split?.overReserved ?? false;
  const pct = totalValue > 0 ? Math.min(1, totalReserved / totalValue) : 0;
  const milestoneLabel = (id: string) => milestones.find((m) => m.id === id)?.label ?? '(deleted)';

  return (
    <div className={cn('rounded-md border p-3', overReserved && 'border-amber-500/40 bg-amber-500/5')}>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="grid w-full grid-cols-[1fr_auto] items-start gap-3 text-left"
        aria-expanded={expanded}
      >
        <div className="space-y-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-semibold">{holding.symbol}</span>
            {holding.name && <span className="text-sm text-muted-foreground">{holding.name}</span>}
            <Badge variant="secondary">{holding.assetClass}</Badge>
            <Badge variant="secondary">{holding.currency}</Badge>
          </div>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <Stat label="Total" value={formatCurrency(totalValue, holding.currency)} />
            <Stat label="Reserved" value={formatCurrency(totalReserved, holding.currency)} />
            <Stat label="Available" value={formatCurrency(available, holding.currency)} />
          </div>
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={cn(
                'h-full rounded-full transition-all',
                overReserved ? 'bg-amber-500' : 'bg-primary',
              )}
              style={{ width: `${Math.max(2, pct * 100)}%` }}
            />
          </div>
          {overReserved && (
            <div className="inline-flex items-center gap-1 text-xs text-amber-700 dark:text-amber-400">
              <AlertTriangle className="h-3 w-3" />
              Over-reserved by {formatCurrency(totalReserved - totalValue, holding.currency)}
            </div>
          )}
          {split?.fxMissing && (
            <div className="text-xs text-muted-foreground">
              Set the SGD↔USD rate in Settings for cross-currency reservations.
            </div>
          )}
        </div>
        <div className="text-xs text-muted-foreground">{expanded ? 'Hide' : `${reservations.length} link${reservations.length === 1 ? '' : 's'}`}</div>
      </button>

      {expanded && (
        <div className="mt-3 space-y-2 border-t pt-3">
          {reservations.length === 0 ? (
            <div className="text-xs text-muted-foreground">No reservations linked yet.</div>
          ) : (
            reservations.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => onEdit(r)}
                className="grid w-full grid-cols-[1fr_auto] items-center gap-3 rounded-md border px-2 py-1.5 text-left text-sm hover:bg-muted/40"
              >
                <div>
                  <div className="font-medium">{milestoneLabel(r.milestoneId)}</div>
                  {r.notes && <div className="text-xs text-muted-foreground line-clamp-1">{r.notes}</div>}
                </div>
                <div className="text-sm font-medium">
                  {formatCurrency(r.amount, r.currency)}
                </div>
              </button>
            ))
          )}
          <Button variant="ghost" size="sm" onClick={onAdd}>
            <Plus className="h-4 w-4" />
            Link another
          </Button>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm">{value}</div>
    </div>
  );
}
