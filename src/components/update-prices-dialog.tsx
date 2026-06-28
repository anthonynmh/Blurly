import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { holdingService } from '@/services/holding-service';
import type { BulkPriceUpdate, HoldingWithComputedValues } from '@/lib/types';
import { formatCurrency } from '@/lib/formatters';
import { todayIso } from '@/lib/formatters';
import { cn } from '@/lib/utils';

interface RowState {
  id: string;
  symbol: string;
  name?: string;
  currentPrice: number;
  currency: string;
  daysSinceUpdate: number;
  isStale: boolean;
  newPrice: string;
  newAsOfDate: string;
  dirty: boolean;
}

type SortMode = 'staleness' | 'alpha';

interface UpdatePricesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  holdings: HoldingWithComputedValues[];
}

const TODAY = todayIso();

function rowIsValid(r: RowState): boolean {
  if (!r.dirty) return true;
  const price = parseFloat(r.newPrice);
  if (isNaN(price) || price < 0) return false;
  if (!r.newAsOfDate) return false;
  if (r.newAsOfDate > TODAY) return false;
  if (r.newAsOfDate < '2000-01-01') return false;
  return true;
}

export function UpdatePricesDialog({
  open,
  onOpenChange,
  holdings,
}: UpdatePricesDialogProps) {
  const queryClient = useQueryClient();
  const [rows, setRows] = useState<RowState[]>([]);
  const [sortMode, setSortMode] = useState<SortMode>('staleness');
  const [saving, setSaving] = useState(false);

  // Eligible holdings: exclude Cash and MoneyMarket
  const eligible = holdings.filter(
    (h) => h.assetClass !== 'Cash' && h.assetClass !== 'MoneyMarket',
  );

  // Reset row state every time the dialog opens
  useEffect(() => {
    if (open) {
      setRows(
        eligible.map((h) => ({
          id: h.id,
          symbol: h.symbol,
          name: h.name,
          currentPrice: h.currentPrice,
          currency: h.currency,
          daysSinceUpdate: h.daysSinceUpdate,
          isStale: h.isStale,
          newPrice: '',
          newAsOfDate: TODAY,
          dirty: false,
        })),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const sorted = [...rows].sort((a, b) => {
    if (sortMode === 'alpha') return a.symbol.localeCompare(b.symbol);
    // staleness desc: most stale first
    return b.daysSinceUpdate - a.daysSinceUpdate;
  });

  const dirtyRows = rows.filter((r) => r.dirty);
  const invalidRows = dirtyRows.filter((r) => !rowIsValid(r));
  const canSave = dirtyRows.length > 0 && invalidRows.length === 0;

  function updateRow(id: string, patch: Partial<RowState>) {
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, ...patch, dirty: true } : r)),
    );
  }

  /** Set all as-of dates to a given value */
  function applyDateToAll(date: string) {
    setRows((prev) =>
      prev.map((r) => ({ ...r, newAsOfDate: date, dirty: r.dirty || r.newPrice !== '' })),
    );
  }

  async function handleSave() {
    const updates: BulkPriceUpdate[] = dirtyRows
      .filter(rowIsValid)
      .map((r) => ({
        id: r.id,
        currentPrice: parseFloat(r.newPrice),
        asOfDate: r.newAsOfDate,
      }));

    if (updates.length === 0) return;

    setSaving(true);
    try {
      await holdingService.updatePricesBulk(updates);
      void queryClient.invalidateQueries({ queryKey: ['holdings', 'default'] });
      toast.success(`Updated ${updates.length} price${updates.length !== 1 ? 's' : ''}`);
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save prices');
    } finally {
      setSaving(false);
    }
  }

  return (
    <TooltipProvider>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle>Update Prices</DialogTitle>
                <DialogDescription>
                  Tab between fields. Empty rows are left unchanged.
                </DialogDescription>
              </div>
              {/* Slot reserved for a future "Refresh from web" button */}
              <div />
            </div>
          </DialogHeader>

          {/* Controls */}
          <div className="flex items-center gap-3 border-b pb-3">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Set all as-of dates to</span>
              <Input
                type="date"
                className="h-7 w-36 text-xs"
                defaultValue={TODAY}
                max={TODAY}
                min="2000-01-01"
                onChange={(e) => {
                  if (e.target.value) applyDateToAll(e.target.value);
                }}
              />
            </div>
            <div className="ml-auto flex items-center gap-1">
              <span className="text-xs text-muted-foreground">Sort:</span>
              <Button
                variant={sortMode === 'staleness' ? 'secondary' : 'ghost'}
                size="sm"
                className="h-7 text-xs"
                onClick={() => setSortMode('staleness')}
              >
                Staleness
              </Button>
              <Button
                variant={sortMode === 'alpha' ? 'secondary' : 'ghost'}
                size="sm"
                className="h-7 text-xs"
                onClick={() => setSortMode('alpha')}
              >
                A–Z
              </Button>
            </div>
          </div>

          {/* Row list */}
          <div className="max-h-96 overflow-y-auto">
            {sorted.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No eligible holdings to update.
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground">
                    <th className="py-2 text-left font-medium">Symbol</th>
                    <th className="py-2 text-right font-medium">Current</th>
                    <th className="py-2 pl-4 text-right font-medium">New Price</th>
                    <th className="py-2 pl-2 text-right font-medium">As-of Date</th>
                    <th className="py-2 pl-2 text-right font-medium">Stale?</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((r) => {
                    const isInvalid = r.dirty && !rowIsValid(r);
                    const asOf = new Date(
                      // Use the ORIGINAL asOfDate from eligible holdings
                      eligible.find((h) => h.id === r.id)?.asOfDate + 'T00:00:00Z' ?? '',
                    );
                    const relative = formatDistanceToNow(asOf, { addSuffix: true });
                    return (
                      <tr
                        key={r.id}
                        className={cn(
                          'border-b last:border-0',
                          isInvalid && 'bg-red-50 dark:bg-red-950/20',
                        )}
                      >
                        <td className="py-2">
                          <div className="font-medium">{r.symbol}</div>
                          {r.name && (
                            <div className="text-xs text-muted-foreground">{r.name}</div>
                          )}
                        </td>
                        <td className="py-2 text-right tabular-nums text-muted-foreground">
                          {formatCurrency(r.currentPrice, r.currency)}
                        </td>
                        <td className="py-2 pl-4">
                          <Input
                            type="number"
                            step="any"
                            min="0"
                            placeholder={r.currentPrice.toString()}
                            value={r.newPrice}
                            className={cn('h-7 w-28 text-right text-sm', isInvalid && 'border-red-500')}
                            onChange={(e) => updateRow(r.id, { newPrice: e.target.value })}
                          />
                        </td>
                        <td className="py-2 pl-2">
                          <Input
                            type="date"
                            value={r.newAsOfDate}
                            max={TODAY}
                            min="2000-01-01"
                            className={cn('h-7 w-36 text-sm', isInvalid && 'border-red-500')}
                            onChange={(e) => updateRow(r.id, { newAsOfDate: e.target.value })}
                          />
                        </td>
                        <td className="py-2 pl-2 text-right">
                          {r.isStale ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Badge
                                  variant="secondary"
                                  className="cursor-default gap-1 border-amber-500/30 bg-amber-500/15 text-amber-700 dark:text-amber-400"
                                >
                                  {relative}
                                </Badge>
                              </TooltipTrigger>
                              <TooltipContent>
                                {r.daysSinceUpdate} day{r.daysSinceUpdate !== 1 ? 's' : ''} since last price update
                              </TooltipContent>
                            </Tooltip>
                          ) : (
                            <span className="text-xs text-muted-foreground">{relative}</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          <DialogFooter className="flex items-center justify-between sm:justify-between">
            {invalidRows.length > 0 && (
              <p className="text-xs text-red-600">
                Fix {invalidRows.length} invalid row{invalidRows.length !== 1 ? 's' : ''}
              </p>
            )}
            <div className="ml-auto flex gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={!canSave || saving}>
                {saving ? 'Saving…' : `Save ${dirtyRows.length > 0 ? dirtyRows.length : ''} change${dirtyRows.length !== 1 ? 's' : ''}`}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
}
