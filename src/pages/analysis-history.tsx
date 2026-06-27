import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { History, MoreHorizontal, Trash2 } from 'lucide-react';
import { useParams, useNavigate } from 'react-router-dom';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AnalystMemo } from '@/components/analyst-memo';
import { EmptyState } from '@/components/empty-state';
import { WindowsNotReadyBanner } from '@/components/windows-not-ready-banner';
import { analysisService } from '@/services/analysis-service';
import type { AnalysisStatus } from '@/lib/types';

const STATUS_VARIANT: Record<AnalysisStatus, 'default' | 'secondary' | 'destructive'> = {
  pending: 'secondary',
  running: 'secondary',
  succeeded: 'default',
  failed: 'destructive',
};

export default function AnalysisHistoryPage() {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: runs, isLoading } = useQuery({
    queryKey: ['analysis-runs'],
    queryFn: () => analysisService.list(),
  });

  const { data: selected } = useQuery({
    queryKey: ['analysis-run', id],
    queryFn: () => analysisService.get(id!),
    enabled: !!id,
  });

  const deleteMutation = useMutation({
    mutationFn: (runId: string) => analysisService.delete(runId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['analysis-runs'] });
      toast.success('Deleted');
      if (id) navigate('/analysis-history');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  if (id) {
    return (
      <div className="space-y-6">
        <WindowsNotReadyBanner />
        <Button variant="ghost" onClick={() => navigate('/analysis-history')} className="text-sm">
          ← Back to history
        </Button>
        {!selected ? (
          <Skeleton className="h-64" />
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>{selected.analysisType}</CardTitle>
              <CardDescription>
                {selected.provider} · {selected.model} ·{' '}
                {new Date(selected.createdAt).toLocaleString()}
                <Badge variant={STATUS_VARIANT[selected.status]} className="ml-2">
                  {selected.status}
                </Badge>
              </CardDescription>
            </CardHeader>
            <CardContent>
              {selected.status === 'succeeded' && selected.outputMarkdown ? (
                <AnalystMemo markdown={selected.outputMarkdown} sourcesJson={selected.sourcesJson} />
              ) : selected.status === 'failed' ? (
                <p className="text-sm text-muted-foreground">{selected.errorMessage ?? 'No error message.'}</p>
              ) : (
                <p className="text-sm text-muted-foreground">No output recorded for this run.</p>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <WindowsNotReadyBanner />
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Analysis History</h1>
        <p className="text-sm text-muted-foreground">Previous analyst runs, saved locally.</p>
      </div>

      {isLoading ? (
        <Skeleton className="h-40" />
      ) : !runs || runs.length === 0 ? (
        <EmptyState
          icon={History}
          title="No analyses yet"
          description="Run your first analysis from the Analyst page."
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>When</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Provider</TableHead>
              <TableHead>Model</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {runs.map((r) => (
              <TableRow
                key={r.id}
                className="cursor-pointer"
                onClick={() => navigate(`/analysis-history/${r.id}`)}
              >
                <TableCell className="font-medium">{new Date(r.createdAt).toLocaleString()}</TableCell>
                <TableCell>{r.analysisType}</TableCell>
                <TableCell>{r.provider}</TableCell>
                <TableCell>{r.model}</TableCell>
                <TableCell>
                  <Badge variant={STATUS_VARIANT[r.status]}>{r.status}</Badge>
                </TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={() => deleteMutation.mutate(r.id)}
                      >
                        <Trash2 className="h-4 w-4" /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
