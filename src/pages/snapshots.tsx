import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { Camera, Trash2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { EmptyState } from '@/components/empty-state';
import { snapshotService } from '@/services/snapshot-service';
import { holdingService } from '@/services/holding-service';
import { portfolioService } from '@/services/portfolio-service';
import { buildPortfolioSnapshot } from '@/lib/calculations';
import type { PortfolioSnapshot, SnapshotMeta } from '@/lib/types';
import { formatCurrency, formatDate } from '@/lib/formatters';

export default function SnapshotsPage() {
  const queryClient = useQueryClient();
  const [viewSnapshot, setViewSnapshot] = useState<PortfolioSnapshot | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data: portfolio } = useQuery({
    queryKey: ['portfolio', 'default'],
    queryFn: () => portfolioService.getDefault(),
  });

  const { data: snapshots, isLoading } = useQuery({
    queryKey: ['snapshots', 'default'],
    queryFn: () => snapshotService.list('default'),
  });

  const takeMutation = useMutation({
    mutationFn: async () => {
      const [p, holdings] = await Promise.all([
        portfolioService.getDefault(),
        holdingService.list('default'),
      ]);
      const snap = buildPortfolioSnapshot(p, holdings);
      return snapshotService.create({
        portfolioId: snap.portfolioId,
        snapshotDate: snap.snapshotDate,
        totalValue: snap.totalValue,
        snapshotJson: JSON.stringify(snap),
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['snapshots', 'default'] });
      toast.success('Snapshot saved');
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => snapshotService.delete(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['snapshots', 'default'] });
      toast.success('Snapshot deleted');
      setDeleteId(null);
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  async function handleView(meta: SnapshotMeta) {
    try {
      const full = await snapshotService.get(meta.id);
      setViewSnapshot(full);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load snapshot');
    }
  }

  const baseCurrency = portfolio?.baseCurrency ?? 'USD';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Snapshots</h2>
        <Button onClick={() => takeMutation.mutate()} disabled={takeMutation.isPending}>
          <Camera className="h-4 w-4" />
          {takeMutation.isPending ? 'Saving…' : 'Take Snapshot'}
        </Button>
      </div>

      {isLoading ? (
        <Skeleton className="h-48" />
      ) : !snapshots || snapshots.length === 0 ? (
        <EmptyState
          icon={Camera}
          title="No snapshots yet"
          description="Take a snapshot to record your portfolio value at a point in time."
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Total Value</TableHead>
                  <TableHead>Taken At</TableHead>
                  <TableHead className="w-20" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {snapshots.map((s) => (
                  <TableRow
                    key={s.id}
                    className="cursor-pointer"
                    onClick={() => handleView(s)}
                  >
                    <TableCell className="font-medium">{formatDate(s.snapshotDate)}</TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(s.totalValue, baseCurrency)}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {formatDate(s.createdAt)}
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => setDeleteId(s.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Snapshot detail view */}
      <Dialog open={viewSnapshot !== null} onOpenChange={(open) => !open && setViewSnapshot(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              Snapshot — {viewSnapshot ? formatDate(viewSnapshot.snapshotDate) : ''}
            </DialogTitle>
            <DialogDescription>
              Total: {viewSnapshot ? formatCurrency(viewSnapshot.totalValue, viewSnapshot.baseCurrency) : ''}
            </DialogDescription>
          </DialogHeader>
          {viewSnapshot && (
            <div className="max-h-96 overflow-auto">
              <pre className="rounded bg-muted p-4 text-xs">
                {JSON.stringify(viewSnapshot, null, 2)}
              </pre>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewSnapshot(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm delete */}
      <Dialog open={deleteId !== null} onOpenChange={(open) => !open && setDeleteId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Snapshot</DialogTitle>
            <DialogDescription>
              This will permanently remove the snapshot. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>Cancel</Button>
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
    </div>
  );
}
