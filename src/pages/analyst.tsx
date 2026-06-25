import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ChevronDown, ChevronRight, Play, Sparkles } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
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
import type { AnalysisRun, AnalysisType, TimeWindow } from '@/lib/types';

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

export default function AnalystPage() {
  const queryClient = useQueryClient();
  const [analysisType, setAnalysisType] = useState<AnalysisType>('PortfolioReview');
  const [timeWindow, setTimeWindow] = useState<TimeWindow>('30d');
  const [previewOpen, setPreviewOpen] = useState(false);
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
  const { data: hasKey } = useQuery({
    queryKey: ['ai-has-key', aiSettings?.provider ?? 'openai'],
    queryFn: () => aiKeysService.has(aiSettings?.provider ?? 'openai'),
    enabled: !!aiSettings,
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

  const canRun = !!holdings && holdings.length > 0 && !!hasKey && !windowsBlocked && !runMutation.isPending;

  return (
    <div className="space-y-6">
      <WindowsNotReadyBanner />

      <div>
        <h1 className="text-2xl font-bold tracking-tight">Analyst</h1>
        <p className="text-sm text-muted-foreground">
          Long-term positioning review of your current holdings. Optional web search surfaces impactful recent news.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Run analysis</CardTitle>
          <CardDescription>
            Uses your current holdings (not snapshots). Click Run to send the data preview below to the configured AI provider.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
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
                Used as a prompt hint for the web-search tool. {aiSettings?.webSearchEnabled ? 'Web search is on.' : 'Web search is off.'}
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

          {!hasKey && !windowsBlocked && (
            <div className="rounded-md border border-dashed bg-muted/30 p-3 text-sm text-muted-foreground">
              No API key configured. Go to <strong>AI Settings</strong> and save one to enable Run.
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
              {run.provider} · {run.model} · {new Date(run.createdAt).toLocaleString()}
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
