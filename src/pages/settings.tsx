import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { CheckCircle2, KeyRound, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { settingsService } from '@/services/settings-service';
import { twelveDataService } from '@/services/twelve-data-service';
import { todayIso } from '@/lib/formatters';
import { useEffect, useState } from 'react';
import type { ApiKeyStatus } from '@/lib/types';

const CURRENCY_OPTIONS = ['USD', 'SGD'] as const;
const TODAY = todayIso();

const settingsSchema = z.object({
  portfolioName: z.string().min(1, 'Portfolio name is required'),
  baseCurrency: z.enum(CURRENCY_OPTIONS),
  defaultCurrency: z.enum(CURRENCY_OPTIONS),
  stalenessThresholdDays: z
    .number({ invalid_type_error: 'Must be a number' })
    .int('Must be a whole number')
    .min(1, 'Must be at least 1 day')
    .optional(),
  fxUsdSgdRate: z
    .number({ invalid_type_error: 'Must be a number' })
    .positive('Rate must be greater than 0')
    .optional(),
  fxUsdSgdAsOf: z
    .string()
    .refine((v) => !v || v <= TODAY, { message: 'As-of date cannot be in the future' })
    .optional(),
});

type SettingsFormValues = z.infer<typeof settingsSchema>;

export default function SettingsPage() {
  const queryClient = useQueryClient();

  const { data: settings, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: () => settingsService.get(),
  });

  const form = useForm<SettingsFormValues>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      portfolioName: '',
      baseCurrency: 'USD',
      defaultCurrency: 'USD',
      stalenessThresholdDays: 7,
      fxUsdSgdRate: undefined,
      fxUsdSgdAsOf: '',
    },
  });

  // Populate form when settings load
  useEffect(() => {
    if (settings) {
      form.reset({
        portfolioName: settings.portfolioName,
        // Fall back to USD if an existing value isn't in our supported set
        baseCurrency: CURRENCY_OPTIONS.includes(settings.baseCurrency as 'USD' | 'SGD')
          ? (settings.baseCurrency as 'USD' | 'SGD')
          : 'USD',
        defaultCurrency: CURRENCY_OPTIONS.includes(settings.defaultCurrency as 'USD' | 'SGD')
          ? (settings.defaultCurrency as 'USD' | 'SGD')
          : 'USD',
        stalenessThresholdDays: settings.stalenessThresholdDays ?? 7,
        fxUsdSgdRate: settings.fxUsdSgdRate ?? undefined,
        fxUsdSgdAsOf: settings.fxUsdSgdAsOf ?? '',
      });
    }
  }, [settings, form]);

  const mutation = useMutation({
    mutationFn: (values: SettingsFormValues) => {
      const fxRate = values.fxUsdSgdRate;
      const hasFxRate = fxRate != null;
      const fxAsOf = hasFxRate ? (values.fxUsdSgdAsOf || null) : null;
      const previousFxRate = settings?.fxUsdSgdRate ?? null;
      const previousFxAsOf = settings?.fxUsdSgdAsOf ?? null;
      const fxChanged = fxRate !== previousFxRate || fxAsOf !== previousFxAsOf;

      return settingsService.update({
        portfolioName: values.portfolioName,
        baseCurrency: values.baseCurrency,
        defaultCurrency: values.defaultCurrency,
        stalenessThresholdDays: values.stalenessThresholdDays,
        fxUsdSgdRate: hasFxRate ? fxRate : null,
        fxUsdSgdAsOf: fxAsOf,
        fxUsdSgdSource: hasFxRate
          ? (fxChanged ? 'manual' : (settings?.fxUsdSgdSource ?? null))
          : null,
        fxUsdSgdRefreshedAt: hasFxRate && !fxChanged
          ? (settings?.fxUsdSgdRefreshedAt ?? null)
          : null,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['settings'] });
      toast.success('Settings saved');
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  if (isLoading) {
    return (
      <div className="mx-auto max-w-lg space-y-6">
        <h2 className="text-2xl font-bold">Settings</h2>
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <h2 className="text-2xl font-bold">Settings</h2>

      <Card>
        <CardHeader>
          <CardTitle>Portfolio</CardTitle>
          <CardDescription>Configure your portfolio preferences.</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit((v) => mutation.mutate(v))} className="space-y-4">
              <FormField
                control={form.control}
                name="portfolioName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Portfolio Name</FormLabel>
                    <FormControl>
                      <Input placeholder="My Portfolio" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="baseCurrency"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Base Currency</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {CURRENCY_OPTIONS.map((c) => (
                          <SelectItem key={c} value={c}>{c}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Holdings in this currency are included in total value and weight calculations.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="defaultCurrency"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Default Currency</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {CURRENCY_OPTIONS.map((c) => (
                          <SelectItem key={c} value={c}>{c}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>Pre-fills the currency field on new holdings.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* ── Staleness Threshold ── */}
              <FormField
                control={form.control}
                name="stalenessThresholdDays"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Staleness Threshold</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min="1"
                        step="1"
                        placeholder="7"
                        {...field}
                        value={field.value ?? ''}
                        onChange={(e) => {
                          const v = e.target.value;
                          field.onChange(v === '' ? undefined : parseInt(v, 10));
                        }}
                      />
                    </FormControl>
                    <FormDescription>
                      Holdings whose price hasn&apos;t been updated within this many days are
                      flagged as stale.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* ── USD↔SGD FX Rate ── */}
              <FormItem>
                <FormLabel>USD↔SGD FX Rate</FormLabel>
                <div className="flex items-center gap-2">
                  <FormField
                    control={form.control}
                    name="fxUsdSgdRate"
                    render={({ field }) => (
                      <FormControl>
                        <Input
                          type="number"
                          step="any"
                          min="0.0001"
                          placeholder="e.g. 1.35"
                          className="w-32"
                          {...field}
                          value={field.value ?? ''}
                          onChange={(e) => {
                            const v = e.target.value;
                            field.onChange(v === '' ? undefined : parseFloat(v));
                          }}
                        />
                      </FormControl>
                    )}
                  />
                  <span className="text-sm text-muted-foreground">as of</span>
                  <FormField
                    control={form.control}
                    name="fxUsdSgdAsOf"
                    render={({ field }) => (
                      <FormControl>
                        <Input
                          type="date"
                          max={TODAY}
                          min="2000-01-01"
                          className="w-36"
                          {...field}
                          value={field.value ?? ''}
                        />
                      </FormControl>
                    )}
                  />
                  {/* Slot reserved for a future "Refresh from web" button */}
                  <div />
                </div>
                <FormDescription>
                  Refreshed from Frankfurter on launch; manual edits remain available as a
                  fallback. 1 USD = N SGD.
                </FormDescription>
                {/* Show validation errors for either sub-field */}
                {form.formState.errors.fxUsdSgdRate && (
                  <p className="text-sm font-medium text-destructive">
                    {form.formState.errors.fxUsdSgdRate.message}
                  </p>
                )}
                {form.formState.errors.fxUsdSgdAsOf && (
                  <p className="text-sm font-medium text-destructive">
                    {form.formState.errors.fxUsdSgdAsOf.message}
                  </p>
                )}
              </FormItem>

              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? 'Saving…' : 'Save Settings'}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>

      <TwelveDataKeyCard />

      <Card>
        <CardHeader>
          <CardTitle>Data</CardTitle>
          <CardDescription>Local storage location</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Your data is stored locally at:
          </p>
          <code className="mt-1 block rounded bg-muted px-2 py-1 text-xs">
            ~/Library/Application Support/com.blurly.app/blurly.db
          </code>
        </CardContent>
      </Card>
    </div>
  );
}

function TwelveDataKeyCard() {
  const queryClient = useQueryClient();
  const [apiKey, setApiKey] = useState('');
  const [testing, setTesting] = useState(false);
  const typedKeyValid = apiKey.trim().length >= 8;
  const statusQueryKey = ['twelve-data-key-status'] as const;

  const { data: keyStatus } = useQuery({
    queryKey: statusQueryKey,
    queryFn: () => twelveDataService.keyStatus(),
    retry: false,
  });

  const hasSavedKey = keyStatus?.status === 'saved';
  const statusMeta = getMarketDataKeyStatusMeta(keyStatus);

  const saveKey = useMutation({
    mutationFn: () => twelveDataService.setKey(apiKey),
    onSuccess: (status) => {
      queryClient.setQueryData(statusQueryKey, status);
      void queryClient.invalidateQueries({ queryKey: statusQueryKey });
      setApiKey('');
      toast.success('Twelve Data key saved');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteKey = useMutation({
    mutationFn: () => twelveDataService.deleteKey(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: statusQueryKey });
      toast.success('Twelve Data key removed');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  async function handleTest() {
    if (!typedKeyValid) return;
    setTesting(true);
    try {
      const result = await twelveDataService.testKey(apiKey);
      if (result.ok) {
        toast.success(result.message);
      } else {
        toast.error(result.message);
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setTesting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="h-4 w-4" />
          Twelve Data
          {hasSavedKey && (
            <Badge variant="secondary" className="ml-2 text-xs">
              <CheckCircle2 className="h-3 w-3" /> Connected
            </Badge>
          )}
        </CardTitle>
        <CardDescription>
          Bring your own Twelve Data API key for web price refreshes. The key is stored encrypted in local app data.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className={statusMeta.containerClass}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <p className="text-sm font-medium">{statusMeta.title}</p>
              <p className="text-sm text-muted-foreground">{statusMeta.description}</p>
            </div>
            <Badge variant={statusMeta.badgeVariant}>{statusMeta.badgeLabel}</Badge>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="twelve-data-key">
            {hasSavedKey ? 'Replace key' : 'Enter key'}
          </label>
          <Input
            id="twelve-data-key"
            type="password"
            placeholder="Twelve Data API key"
            value={apiKey}
            autoComplete="off"
            onChange={(e) => setApiKey(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Test validates the typed key only. Save is required before web price refresh can run.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={handleTest}
            disabled={testing || !typedKeyValid}
          >
            {testing ? 'Testing...' : 'Test connection'}
          </Button>
          <Button
            type="button"
            onClick={() => saveKey.mutate()}
            disabled={saveKey.isPending || !typedKeyValid}
          >
            {saveKey.isPending ? 'Saving...' : hasSavedKey ? 'Replace saved key' : 'Save key'}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => deleteKey.mutate()}
            disabled={deleteKey.isPending}
          >
            <Trash2 className="h-4 w-4" />
            {hasSavedKey ? 'Remove saved key' : 'Clear saved key'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function getMarketDataKeyStatusMeta(status?: ApiKeyStatus): {
  title: string;
  description: string;
  badgeLabel: string;
  badgeVariant: 'secondary' | 'outline' | 'destructive';
  containerClass: string;
} {
  switch (status?.status) {
    case 'saved':
      return {
        title: 'Key saved',
        description: 'Blurly can decrypt the saved Twelve Data key for price refreshes.',
        badgeLabel: 'Saved',
        badgeVariant: 'secondary',
        containerClass: 'space-y-3 rounded-md border bg-muted/30 p-3',
      };
    case 'error':
      return {
        title: 'Saved key unreadable',
        description: status.message ?? 'Blurly could not decrypt the saved Twelve Data key. Clear and re-save it.',
        badgeLabel: 'Error',
        badgeVariant: 'destructive',
        containerClass: 'space-y-3 rounded-md border border-destructive/50 bg-destructive/5 p-3',
      };
    case 'missing':
    default:
      return {
        title: 'No key saved',
        description: 'Save a Twelve Data key before using web price refresh.',
        badgeLabel: 'Missing',
        badgeVariant: 'outline',
        containerClass: 'space-y-3 rounded-md border border-dashed p-3',
      };
  }
}
