import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Eye, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';

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
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { EmptyState } from '@/components/empty-state';
import { watchlistService } from '@/services/watchlist-service';
import type { WatchlistItem } from '@/lib/types';

const itemSchema = z.object({
  symbol: z.string().min(1, 'Symbol is required').max(20).transform((s) => s.toUpperCase()),
  name: z.string().optional(),
  assetClass: z.string().optional(),
  sector: z.string().optional(),
  region: z.string().optional(),
  notes: z.string().optional(),
});

type ItemFormValues = z.infer<typeof itemSchema>;

function emptyValues(): ItemFormValues {
  return { symbol: '', name: '', assetClass: '', sector: '', region: '', notes: '' };
}

function toFormValues(item: WatchlistItem): ItemFormValues {
  return {
    symbol: item.symbol,
    name: item.name ?? '',
    assetClass: item.assetClass ?? '',
    sector: item.sector ?? '',
    region: item.region ?? '',
    notes: item.notes ?? '',
  };
}

export default function WatchlistPage() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<WatchlistItem | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data: items, isLoading } = useQuery({
    queryKey: ['watchlist'],
    queryFn: () => watchlistService.list(),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => watchlistService.delete(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['watchlist'] });
      toast.success('Removed from watchlist');
      setDeleteId(null);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Watchlist</h1>
          <p className="text-sm text-muted-foreground">
            Tickers you&apos;re interested in but don&apos;t currently hold.
          </p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" />
          Add ticker
        </Button>
      </div>

      {isLoading ? (
        <Skeleton className="h-40" />
      ) : !items || items.length === 0 ? (
        <EmptyState
          icon={Eye}
          title="Watchlist is empty"
          description="Add a ticker to start tracking ideas."
          actionLabel="Add ticker"
          onAction={() => setCreating(true)}
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Symbol</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Class</TableHead>
              <TableHead>Sector</TableHead>
              <TableHead>Region</TableHead>
              <TableHead>Notes</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="font-medium">{item.symbol}</TableCell>
                <TableCell>{item.name ?? '—'}</TableCell>
                <TableCell>{item.assetClass ?? '—'}</TableCell>
                <TableCell>{item.sector ?? '—'}</TableCell>
                <TableCell>{item.region ?? '—'}</TableCell>
                <TableCell className="max-w-xs truncate text-muted-foreground">
                  {item.notes ?? '—'}
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setEditing(item)}>
                        <Pencil className="h-4 w-4" /> Edit
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={() => setDeleteId(item.id)}
                      >
                        <Trash2 className="h-4 w-4" /> Remove
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <WatchlistFormDialog
        open={creating}
        onOpenChange={(open) => !open && setCreating(false)}
        title="Add to watchlist"
        defaultValues={emptyValues()}
        onSubmit={async (values) => {
          await watchlistService.create({
            symbol: values.symbol,
            name: values.name || undefined,
            assetClass: values.assetClass || undefined,
            sector: values.sector || undefined,
            region: values.region || undefined,
            notes: values.notes || undefined,
          });
          await queryClient.invalidateQueries({ queryKey: ['watchlist'] });
          toast.success('Added to watchlist');
          setCreating(false);
        }}
      />

      <WatchlistFormDialog
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        title="Edit watchlist item"
        defaultValues={editing ? toFormValues(editing) : emptyValues()}
        onSubmit={async (values) => {
          if (!editing) return;
          await watchlistService.update(editing.id, {
            symbol: values.symbol,
            name: values.name || undefined,
            assetClass: values.assetClass || undefined,
            sector: values.sector || undefined,
            region: values.region || undefined,
            notes: values.notes || undefined,
          });
          await queryClient.invalidateQueries({ queryKey: ['watchlist'] });
          toast.success('Updated');
          setEditing(null);
        }}
      />

      <Dialog open={deleteId !== null} onOpenChange={(open) => !open && setDeleteId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove from watchlist</DialogTitle>
            <DialogDescription>This action cannot be undone.</DialogDescription>
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
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface FormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  defaultValues: ItemFormValues;
  onSubmit: (values: ItemFormValues) => Promise<void>;
}

function WatchlistFormDialog({ open, onOpenChange, title, defaultValues, onSubmit }: FormDialogProps) {
  const form = useForm<ItemFormValues>({
    resolver: zodResolver(itemSchema),
    values: defaultValues,
  });

  const handleSubmit = form.handleSubmit(async (values) => {
    try {
      await onSubmit(values);
      form.reset();
    } catch (err) {
      toast.error((err as Error).message);
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={handleSubmit} className="space-y-4">
            <FormField
              control={form.control}
              name="symbol"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Symbol</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="AAPL" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Apple Inc." />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-3 gap-3">
              <FormField
                control={form.control}
                name="assetClass"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Class</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Stock" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="sector"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Sector</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Technology" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="region"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Region</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="US" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <Textarea {...field} rows={3} placeholder="Why are you watching this?" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                Save
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
