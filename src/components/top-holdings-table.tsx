import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import type { HoldingWithComputedValues } from '@/lib/types';
import { formatCurrency, formatPercent } from '@/lib/formatters';

interface TopHoldingsTableProps {
  holdings: HoldingWithComputedValues[];
  baseCurrency: string;
}

export function TopHoldingsTable({ holdings, baseCurrency }: TopHoldingsTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Symbol</TableHead>
          <TableHead>Asset Class</TableHead>
          <TableHead className="text-right">Value</TableHead>
          <TableHead className="text-right">Weight</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {holdings.map((h) => (
          <TableRow key={h.id}>
            <TableCell className="font-medium">
              {h.symbol}
              {h.currency !== baseCurrency && (
                <span className="ml-1 text-xs text-muted-foreground">({h.currency})</span>
              )}
            </TableCell>
            <TableCell>
              <Badge variant="secondary">{h.assetClass}</Badge>
            </TableCell>
            <TableCell className="text-right">
              {formatCurrency(h.marketValue, h.currency)}
            </TableCell>
            <TableCell className="text-right">
              {h.currency === baseCurrency ? formatPercent(h.weight) : '—'}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
