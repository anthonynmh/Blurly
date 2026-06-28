import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertTriangle, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { holdingService } from '@/services/holding-service';
import type { HoldingWithComputedValues } from '@/lib/types';
import { formatCurrency, formatPercent } from '@/lib/formatters';
import { cn } from '@/lib/utils';

type SortKey = 'symbol' | 'assetClass' | 'marketValue' | 'weight' | 'currency';
type SortDir = 'asc' | 'desc';

interface HoldingsTableProps {
  holdings: HoldingWithComputedValues[];
  baseCurrency: string;
  portfolioId: string;
}

export function HoldingsTable({ holdings, baseCurrency, portfolioId }: HoldingsTableProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [sortKey, setSortKey] = useState<SortKey>('marketValue');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const deleteMutation = useMutation({
    mutationFn: (id: string) => holdingService.delete(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['holdings', portfolioId] });
      toast.success('Holding deleted');
      setDeleteId(null);
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  }

  const sorted = [...holdings].sort((a, b) => {
    let cmp = 0;
    switch (sortKey) {
      case 'symbol':
        cmp = a.symbol.localeCompare(b.symbol);
        break;
      case 'assetClass':
        cmp = a.assetClass.localeCompare(b.assetClass);
        break;
      case 'marketValue':
        cmp = a.marketValue - b.marketValue;
        break;
      case 'weight':
        cmp = a.weight - b.weight;
        break;
      case 'currency':
        cmp = a.currency.localeCompare(b.currency);
        break;
    }
    return sortDir === 'asc' ? cmp : -cmp;
  });

  function SortHeader({ k, children }: { k: SortKey; children: ReactNode }) {
    return (
      <button
        className="flex items-center gap-1 hover:text-foreground"
        onClick={() => handleSort(k)}
      >
        {children}
        {sortKey === k && <span className="text-xs">{sortDir === 'asc' ? '↑' : '↓'}</span>}
      </button>
    );
  }

  return (
    <TooltipProvider>
      <>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead><SortHeader k="symbol">Symbol</SortHeader></TableHead>
              <TableHead><SortHeader k="assetClass">Class</SortHeader></TableHead>
              <TableHead className="text-right">Qty</TableHead>
              <TableHead className="text-right">Avg Cost</TableHead>
              <TableHead className="text-right">Price</TableHead>
              <TableHead className="text-right"><SortHeader k="marketValue">Value</SortHeader></TableHead>
              <TableHead className="text-right">Unreal. P/L</TableHead>
              <TableHead className="text-right">P/L %</TableHead>
              <TableHead className="text-right"><SortHeader k="weight">Weight</SortHeader></TableHead>
              <TableHead><SortHeader k="currency">CCY</SortHeader></TableHead>
              <TableHead>Updated</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((h) => {
              const asOf = new Date(h.asOfDate + 'T00:00:00Z');
              const relative = formatDistanceToNow(asOf, { addSuffix: true });

              return (
                <TableRow key={h.id}>
                  <TableCell className="font-medium">{h.symbol}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{h.assetClass}</Badge>
                  </TableCell>
                  <TableCell className="text-right">{h.quantity.toLocaleString()}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {h.averagePrice != null
                      ? formatCurrency(h.averagePrice, h.currency)
                      : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="text-right">{formatCurrency(h.currentPrice, h.currency)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(h.marketValue, h.currency)}</TableCell>
                  <TableCell className={cn(
                    'text-right tabular-nums',
                    h.unrealizedPL != null && h.unrealizedPL >= 0 ? 'text-green-600' : '',
                    h.unrealizedPL != null && h.unrealizedPL < 0 ? 'text-red-600' : '',
                  )}>
                    {h.unrealizedPL != null
                      ? formatCurrency(h.unrealizedPL, h.currency)
                      : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className={cn(
                    'text-right tabular-nums',
                    h.unrealizedPLPercent != null && h.unrealizedPLPercent >= 0 ? 'text-green-600' : '',
                    h.unrealizedPLPercent != null && h.unrealizedPLPercent < 0 ? 'text-red-600' : '',
                  )}>
                    {h.unrealizedPLPercent != null
                      ? formatPercent(h.unrealizedPLPercent)
                      : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="text-right">
                    {h.currency === baseCurrency ? formatPercent(h.weight) : (
                      <span className="text-muted-foreground text-xs">non-base</span>
                    )}
                  </TableCell>
                  <TableCell>{h.currency}</TableCell>
                  <TableCell>
                    {h.isStale ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Badge
                            variant="secondary"
                            className="cursor-default gap-1 border-amber-500/30 bg-amber-500/15 text-amber-700 dark:text-amber-400"
                          >
                            <AlertTriangle className="h-3 w-3" />
                            {relative}
                          </Badge>
                        </TooltipTrigger>
                        <TooltipContent>
                          Last updated {h.daysSinceUpdate} day{h.daysSinceUpdate !== 1 ? 's' : ''} ago. Consider refreshing.
                        </TooltipContent>
                      </Tooltip>
                    ) : (
                      <span className="text-sm text-muted-foreground">{relative}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                          <span className="sr-only">Open menu</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => navigate(`/holdings/${h.id}/edit`)}>
                          <Pencil className="h-4 w-4" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => setDeleteId(h.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>

        {/* Confirm delete dialog */}
        <Dialog open={deleteId !== null} onOpenChange={(open) => !open && setDeleteId(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete Holding</DialogTitle>
              <DialogDescription>
                This will permanently remove the holding. This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteId(null)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => deleteId && deleteMutation.mutate(deleteId)}
                disabled={deleteMutation.isPending}
              >
                Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    </TooltipProvider>
  );
}
