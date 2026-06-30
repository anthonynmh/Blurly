import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { ChevronDown, ChevronRight, Play, Sparkles } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
} from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { AnalystMemo } from '@/components/analyst-memo';
import { EmptyState } from '@/components/empty-state';
import { WindowsNotReadyBanner } from '@/components/windows-not-ready-banner';
import { aiKeysService } from '@/services/ai-keys-service';
import { aiSettingsService } from '@/services/ai-settings-service';
import { analysisService } from '@/services/analysis-service';
import { holdingService } from '@/services/holding-service';
import { settingsService } from '@/services/settings-service';
import { buildAnalysisContext } from '@/lib/analysis';
import { isWindows } from '@/lib/platform';
import type { AnalysisRun, AnalysisType, AnalystPersona, ApiKeyStatus, TimeWindow } from '@/lib/types';

const ANALYSIS_TYPES: { value: AnalysisType; label: string; description: string }[] = [
  { value: 'PortfolioReview', label: 'Portfolio Review', description: 'Full memo: rebalancing + recent news.' },
  { value: 'MacroReview', label: 'Macro Review', description: 'Macro / cross-asset developments and exposure.' },
  { value: 'SectorReview', label: 'Sector Review', description: 'Drill into sectors present in the portfolio.' },
  { value: 'HoldingReview', label: 'Holding Review', description: 'Per-holding recent news for your top positions.' },
  { value: 'RebalancingConsiderations', label: 'Rebalancing', description: 'Only the rebalancing section.' },
];

const TIME_WINDOWS: { value: TimeWindow; label: string }[] = [
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
  { value: '1y', label: 'Last 12 months' },
];

const PERSONAS: {
  value: AnalystPersona;
  label: string;
  description: string;
  model: string;
}[] = [
  {
    value: 'light',
    label: 'Light Research',
    description: 'Concise memo. Web search honoured per saved setting. Faster and cheaper.',
    model: 'gpt-4o',
  },
  {
    value: 'deep',
    label: 'Deep Research',
    description: 'In-depth memo with aggressive web search. Slower, more grounded, more credits.',
    model: 'gpt-5.5',
  },
];

const settingsSchema = z.object({
  webSearchEnabled: z.boolean(),
  includeExactValues: z.boolean(),
  includeQuantities: z.boolean(),
  includeNotes: z.boolean(),
});

type SettingsFormValues = z.infer<typeof settingsSchema>;

export default function AnalystPage() {
  const queryClient = useQueryClient();
  const [analysisType, setAnalysisType] = useState<AnalysisType>('PortfolioReview');
  const [timeWindow, setTimeWindow] = useState<TimeWindow>('30d');
  const [persona, setPersona] = useState<AnalystPersona>('light');
  const [previewOpen, setPreviewOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [run, setRun] = useState<AnalysisRun | null>(null);
  const windowsBlocked = isWindows();

  const { data: appSettings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => settingsService.get(),
  });
  const { data: aiSettings } = useQuery({
    queryKey: ['ai-settings'],
    queryFn: () => aiSettingsService.get(),
  });
  const { data: keyStatus, error: keyStatusError } = useQuery({
    queryKey: ['ai-key-status', aiSettings?.provider ?? 'openai'],
    queryFn: () => aiKeysService.status(aiSettings?.provider ?? 'openai'),
    enabled: !!aiSettings,
    retry: false,
  });
  const { data: signingId } = useQuery({
    queryKey: ['app-signing-identity'],
    queryFn: () => aiKeysService.signingIdentity(),
    staleTime: Infinity,
  });
  const { data: holdings } = useQuery({
    queryKey: ['holdings', 'default'],
    queryFn: () => holdingService.list('default'),
  });

  const context = useMemo(() => {
    if (!holdings || !appSettings || !aiSettings) return null;
    return buildAnalysisContext(holdings, appSettings.baseCurrency, {
      includeExactValues: aiSettings.includeExactValues,
      includeQuantities: aiSettings.includeQuantities,
      includeNotes: aiSettings.includeNotes,
    });
  }, [holdings, appSettings, aiSettings]);

  const runMutation = useMutation({
    mutationFn: async () => {
      if (!context) throw new Error('Holdings or settings not loaded yet');
      return analysisService.run({
        inputContextJson: JSON.stringify(context),
        analysisType,
        timeWindow,
        persona,
      });
    },
    onSuccess: (r) => {
      setRun(r);
      void queryClient.invalidateQueries({ queryKey: ['analysis-runs'] });
      if (r.status === 'failed') {
        toast.error(r.errorMessage ?? 'Analysis failed');
      } else {
        toast.success('Analysis complete');
      }
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const canRun =
    !!holdings &&
    holdings.length > 0 &&
    keyStatus?.status === 'saved' &&
    !windowsBlocked &&
    !runMutation.isPending;
  const keyStatusMeta = keyStatus ? getAnalystKeyStatusMeta(keyStatus) : null;
  const selectedPersona = PERSONAS.find((p) => p.value === persona)!;
  const effectiveWebSearch =
    persona === 'deep' ? true : aiSettings?.webSearchEnabled ?? false;
  const webSearchLabel =
    persona === 'deep'
      ? 'Web search: ON (forced for Deep Research)'
      : effectiveWebSearch
        ? 'Web search: ON'
        : 'Web search: OFF';

  return (
    <div className="space-y-6">
      <WindowsNotReadyBanner />

      <div>
        <h1 className="text-2xl font-bold tracking-tight">Analyst</h1>
        <p className="text-sm text-muted-foreground">
          Long-term positioning review of your current holdings. Pick a persona, then Run.
        </p>
      </div>

      <AnalystSettingsCard open={settingsOpen} onOpenChange={setSettingsOpen} />

      <Card>
        <CardHeader>
          <CardTitle>Run analysis</CardTitle>
          <CardDescription>
            Uses your current holdings (not snapshots). The persona drives model and web search.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <label className="text-sm font-medium">Persona</label>
              <Select value={persona} onValueChange={(v) => setPersona(v as AnalystPersona)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PERSONAS.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label} ({p.model})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{selectedPersona.description}</p>
              {persona === 'deep' && analysisType === 'PortfolioReview' && (
                <p className="text-xs text-muted-foreground">
                  Portfolio Review with Deep Research is about $2 USD per 10 holdings.
                </p>
              )}
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Analysis type</label>
              <Select value={analysisType} onValueChange={(v) => setAnalysisType(v as AnalysisType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ANALYSIS_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {ANALYSIS_TYPES.find((t) => t.value === analysisType)?.description}
              </p>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Time window</label>
              <Select value={timeWindow} onValueChange={(v) => setTimeWindow(v as TimeWindow)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIME_WINDOWS.map((w) => (
                    <SelectItem key={w.value} value={w.value}>
                      {w.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Used as a prompt hint for web search. {webSearchLabel}.
              </p>
            </div>
          </div>

          {context && (
            <div className="rounded-md border bg-muted/30">
              <button
                type="button"
                onClick={() => setPreviewOpen((v) => !v)}
                className="flex w-full items-center justify-between p-3 text-left text-sm font-medium"
              >
                <span className="flex items-center gap-2">
                  {previewOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  Data preview — {context.holdings.length} holdings, {context.breakdowns.assetClass.length} asset classes
                </span>
                <span className="text-xs text-muted-foreground">
                  {aiSettings?.includeExactValues ? 'values: ON' : 'values: OFF'} ·{' '}
                  {aiSettings?.includeQuantities ? 'qty: ON' : 'qty: OFF'}
                </span>
              </button>
              {previewOpen && (
                <pre className="max-h-72 overflow-auto border-t bg-background p-3 text-xs">
                  {JSON.stringify(context, null, 2)}
                </pre>
              )}
            </div>
          )}

          {keyStatusError && !windowsBlocked && (
            <Alert variant="destructive">
              <AlertTitle>Couldn&apos;t read key status</AlertTitle>
              <AlertDescription>{(keyStatusError as Error).message}</AlertDescription>
            </Alert>
          )}

          {keyStatusMeta && !windowsBlocked && keyStatusMeta.kind === 'error' && (
            <Alert variant="destructive">
              <AlertTitle>{keyStatusMeta.title}</AlertTitle>
              <AlertDescription>
                {keyStatusMeta.description}
                {signingId && (
                  <p className="mt-1 text-xs opacity-80">
                    Build identity: {signingId.authority ?? 'ad-hoc'}
                    {signingId.cdhash ? ` — ${signingId.cdhash.slice(0, 12)}…` : ''}
                  </p>
                )}
              </AlertDescription>
            </Alert>
          )}

          {keyStatusMeta && !windowsBlocked && keyStatusMeta.kind === 'stale' && (
            <Alert>
              <AlertTitle>{keyStatusMeta.title}</AlertTitle>
              <AlertDescription>
                {keyStatusMeta.description}
                {signingId && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Build identity: {signingId.authority ?? 'ad-hoc'}
                    {signingId.cdhash ? ` — ${signingId.cdhash.slice(0, 12)}…` : ''}
                  </p>
                )}
              </AlertDescription>
            </Alert>
          )}

          {keyStatusMeta && !windowsBlocked && keyStatusMeta.kind === 'missing' && (
            <div className="rounded-md border border-dashed bg-muted/30 p-3 text-sm text-muted-foreground">
              {keyStatusMeta.description}
            </div>
          )}

          <div className="flex items-center gap-3">
            <Button onClick={() => runMutation.mutate()} disabled={!canRun}>
              <Play className="h-4 w-4" />
              {runMutation.isPending ? 'Running…' : 'Run analysis'}
            </Button>
            {holdings && holdings.length === 0 && (
              <span className="text-sm text-muted-foreground">Add some holdings first.</span>
            )}
          </div>
        </CardContent>
      </Card>

      {runMutation.isPending && <Skeleton className="h-64" />}

      {run && run.status === 'succeeded' && run.outputMarkdown && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4" />
              {ANALYSIS_TYPES.find((t) => t.value === run.analysisType)?.label ?? run.analysisType}
            </CardTitle>
            <CardDescription>
              {run.provider} · {run.model} · {run.persona === 'deep' ? 'Deep Research' : 'Light Research'} ·{' '}
              {new Date(run.createdAt).toLocaleString()}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AnalystMemo markdown={run.outputMarkdown} sourcesJson={run.sourcesJson} />
          </CardContent>
        </Card>
      )}

      {run && run.status === 'failed' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-destructive">Analysis failed</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{run.errorMessage ?? 'Unknown error.'}</p>
          </CardContent>
        </Card>
      )}

      {!run && !runMutation.isPending && holdings?.length === 0 && (
        <EmptyState
          icon={Sparkles}
          title="No holdings yet"
          description="Add some holdings to enable the analyst."
        />
      )}
    </div>
  );
}

interface AnalystSettingsCardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function AnalystSettingsCard({ open, onOpenChange }: AnalystSettingsCardProps) {
  const queryClient = useQueryClient();
  const { data: settings, isLoading } = useQuery({
    queryKey: ['ai-settings'],
    queryFn: () => aiSettingsService.get(),
  });

  const form = useForm<SettingsFormValues>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      webSearchEnabled: true,
      includeExactValues: false,
      includeQuantities: false,
      includeNotes: false,
    },
  });

  useEffect(() => {
    if (settings) {
      form.reset({
        webSearchEnabled: settings.webSearchEnabled,
        includeExactValues: settings.includeExactValues,
        includeQuantities: settings.includeQuantities,
        includeNotes: settings.includeNotes,
      });
    }
  }, [settings, form]);

  const saveSettings = useMutation({
    mutationFn: (values: SettingsFormValues) => aiSettingsService.update(values),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['ai-settings'] });
      toast.success('Analyst settings saved');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <Card>
      <CardHeader>
        <button
          type="button"
          onClick={() => onOpenChange(!open)}
          className="flex w-full items-center justify-between text-left"
        >
          <div>
            <CardTitle className="flex items-center gap-2">
              {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              Analyst settings
            </CardTitle>
            <CardDescription>
              Web search, and what the data preview sends to the AI. API keys live under Keys.
            </CardDescription>
          </div>
        </button>
      </CardHeader>
      {open && (
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-40" />
          ) : (
            <Form {...form}>
              <form
                onSubmit={form.handleSubmit((v) => saveSettings.mutate(v))}
                className="space-y-5"
              >
                <FormField
                  control={form.control}
                  name="webSearchEnabled"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-start justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <FormLabel>Enable web search (Light Research)</FormLabel>
                        <FormDescription>
                          Lets the analyst look up recent news. Deep Research always uses web search regardless of this toggle.
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <div className="space-y-3">
                  <h3 className="text-sm font-medium">Privacy — what gets sent to the AI</h3>
                  <p className="text-xs text-muted-foreground">
                    Symbols, asset classes, and portfolio weights are always included. The toggles below add more detail.
                    Off by default for privacy.
                  </p>
                  <PrivacyToggle
                    form={form}
                    name="includeExactValues"
                    label="Include exact market values"
                    description="Sends dollar amounts and total portfolio value to the AI."
                  />
                  <PrivacyToggle
                    form={form}
                    name="includeQuantities"
                    label="Include quantities"
                    description="Sends share/unit counts for each holding."
                  />
                  <PrivacyToggle
                    form={form}
                    name="includeNotes"
                    label="Include notes"
                    description="Sends your personal notes for each holding."
                  />
                </div>

                <Button type="submit" disabled={saveSettings.isPending}>
                  {saveSettings.isPending ? 'Saving…' : 'Save settings'}
                </Button>
              </form>
            </Form>
          )}
        </CardContent>
      )}
    </Card>
  );
}

interface PrivacyFormProps {
  form: ReturnType<typeof useForm<SettingsFormValues>>;
  name: 'includeExactValues' | 'includeQuantities' | 'includeNotes';
  label: string;
  description: string;
}

function PrivacyToggle({ form, name, label, description }: PrivacyFormProps) {
  return (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem className="flex flex-row items-start justify-between rounded-lg border p-3">
          <div className="space-y-0.5">
            <FormLabel>{label}</FormLabel>
            <FormDescription className="text-xs">{description}</FormDescription>
          </div>
          <FormControl>
            <Switch checked={field.value} onCheckedChange={field.onChange} />
          </FormControl>
        </FormItem>
      )}
    />
  );
}

function getAnalystKeyStatusMeta(status: ApiKeyStatus): {
  kind: 'saved' | 'missing' | 'stale' | 'error';
  title: string;
  description: string;
} {
  switch (status.status) {
    case 'saved':
      return {
        kind: 'saved',
        title: 'Saved key available',
        description: 'Blurly can decrypt the saved key for the active provider.',
      };
    case 'stale':
      return {
        kind: 'stale',
        title: 'Saved key needs to be re-added',
        description: status.message ?? 'Blurly expected a saved key, but the encrypted secret file is missing. Go to Keys, clear the stale entry, then save the key again.',
      };
    case 'error':
      return {
        kind: 'error',
        title: 'Saved key unreadable',
        description: status.message ?? 'Blurly could not decrypt the saved key.',
      };
    case 'missing':
    default:
      return {
        kind: 'missing',
        title: 'No API key configured',
        description: 'No readable key is currently saved. Go to Keys, then save a key to enable Run.',
      };
  }
}
