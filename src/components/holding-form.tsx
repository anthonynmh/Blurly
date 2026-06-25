import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ChevronDown, ChevronRight } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { Holding } from '@/lib/types';
import { formatCurrency, todayIso } from '@/lib/formatters';

const ASSET_CLASSES = ['Stock', 'ETF', 'Cash', 'MoneyMarket', 'Bond', 'Crypto', 'Other'] as const;
const CURRENCY_OPTIONS = ['USD', 'SGD'] as const;

const holdingSchema = z.object({
  symbol: z.string().min(1, 'Symbol is required').max(20).toUpperCase(),
  name: z.string().optional(),
  assetClass: z.enum(ASSET_CLASSES),
  quantity: z.coerce.number().min(0, 'Quantity must be ≥ 0'),
  averagePrice: z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? undefined : Number(v)),
    z.number().min(0).optional(),
  ),
  currentPrice: z.coerce.number().min(0, 'Current price must be ≥ 0'),
  currency: z.string().min(3).max(3).toUpperCase(),
  sector: z.string().optional(),
  region: z.string().optional(),
  broker: z.string().optional(),
  asOfDate: z.string().min(1, 'Date is required'),
  notes: z.string().optional(),
});

export type HoldingFormValues = z.infer<typeof holdingSchema>;

interface HoldingFormProps {
  defaultValues?: Partial<HoldingFormValues>;
  onSubmit: (values: HoldingFormValues) => Promise<void>;
  isSubmitting?: boolean;
  submitLabel?: string;
}

export function HoldingForm({
  defaultValues,
  onSubmit,
  isSubmitting,
  submitLabel = 'Save',
}: HoldingFormProps) {
  const form = useForm<HoldingFormValues>({
    resolver: zodResolver(holdingSchema),
    defaultValues: {
      symbol: '',
      name: '',
      assetClass: 'Stock',
      quantity: 0,
      averagePrice: undefined,
      currentPrice: 0,
      currency: 'USD',
      sector: '',
      region: '',
      broker: '',
      asOfDate: todayIso(),
      notes: '',
      ...defaultValues,
    },
  });

  // Open the optional section by default when there's existing optional data (edit case).
  const hasOptional =
    !!defaultValues?.name ||
    defaultValues?.averagePrice !== undefined ||
    !!defaultValues?.sector ||
    !!defaultValues?.region ||
    !!defaultValues?.broker ||
    !!defaultValues?.notes;
  const [optionalOpen, setOptionalOpen] = useState(hasOptional);

  const watchQty = form.watch('quantity');
  const watchPrice = form.watch('currentPrice');
  const watchCurrency = form.watch('currency');
  const marketValue =
    Number.isFinite(Number(watchQty)) && Number.isFinite(Number(watchPrice))
      ? Number(watchQty) * Number(watchPrice)
      : 0;

  // Surface this currency even if it isn't in CURRENCY_OPTIONS so existing
  // holdings with EUR/etc still display correctly in edit mode.
  const currencyOptions: readonly string[] = CURRENCY_OPTIONS.includes(watchCurrency as 'USD' | 'SGD')
    ? CURRENCY_OPTIONS
    : [...CURRENCY_OPTIONS, watchCurrency];

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="flex max-h-[calc(100vh-14rem)] flex-col"
      >
        <div className="flex-1 space-y-6 overflow-y-auto pr-1">
          {/* Essential fields */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-muted-foreground">Essentials</h3>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="symbol"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Symbol *</FormLabel>
                    <FormControl>
                      <Input placeholder="AAPL" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="assetClass"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Asset class *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select class" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {ASSET_CLASSES.map((c) => (
                          <SelectItem key={c} value={c}>
                            {c}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <FormField
                control={form.control}
                name="quantity"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Quantity *</FormLabel>
                    <FormControl>
                      <Input type="number" step="any" min="0" placeholder="10" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="currentPrice"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Current price *</FormLabel>
                    <FormControl>
                      <Input type="number" step="any" min="0" placeholder="175.00" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="currency"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Currency *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {currencyOptions.map((c) => (
                          <SelectItem key={c} value={c}>
                            {c}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="asOfDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>As-of date *</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormItem>
                <FormLabel>Market value</FormLabel>
                <div className="flex h-9 items-center rounded-md border bg-muted/30 px-3 text-sm tabular-nums">
                  {formatCurrency(marketValue, watchCurrency || 'USD')}
                </div>
                <FormDescription>quantity × current price</FormDescription>
              </FormItem>
            </div>
          </div>

          {/* Optional details — collapsible */}
          <div className="space-y-3 border-t pt-4">
            <button
              type="button"
              onClick={() => setOptionalOpen((v) => !v)}
              className="flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground"
            >
              {optionalOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              Optional details
            </button>
            {optionalOpen && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Name</FormLabel>
                        <FormControl>
                          <Input placeholder="Apple Inc." {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="averagePrice"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Average cost</FormLabel>
                        <FormControl>
                          <Input type="number" step="any" min="0" placeholder="150.00" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <FormField
                    control={form.control}
                    name="sector"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Sector</FormLabel>
                        <FormControl>
                          <Input placeholder="Technology" {...field} />
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
                          <Input placeholder="US" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="broker"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Broker</FormLabel>
                        <FormControl>
                          <Input placeholder="Fidelity" {...field} />
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
                        <Textarea placeholder="Optional notes..." {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            )}
          </div>
        </div>

        <div className="sticky bottom-0 mt-4 flex justify-end gap-2 border-t bg-background pt-4">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Saving…' : submitLabel}
          </Button>
        </div>
      </form>
    </Form>
  );
}

/** Convert a Holding (from Rust) into HoldingFormValues for the form defaults */
export function holdingToFormValues(h: Holding): HoldingFormValues {
  return {
    symbol: h.symbol,
    name: h.name ?? '',
    assetClass: h.assetClass,
    quantity: h.quantity,
    averagePrice: h.averagePrice,
    currentPrice: h.currentPrice,
    currency: h.currency,
    sector: h.sector ?? '',
    region: h.region ?? '',
    broker: h.broker ?? '',
    asOfDate: h.asOfDate,
    notes: h.notes ?? '',
  };
}
