import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MessageSquare, Plus, Send, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { AnalystMemo } from '@/components/analyst-memo';
import { EmptyState } from '@/components/empty-state';
import { WindowsNotReadyBanner } from '@/components/windows-not-ready-banner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { aiKeysService } from '@/services/ai-keys-service';
import { aiSettingsService } from '@/services/ai-settings-service';
import { analystChatService } from '@/services/analyst-chat-service';
import { analysisService } from '@/services/analysis-service';
import { holdingService } from '@/services/holding-service';
import { settingsService } from '@/services/settings-service';
import { strategyService } from '@/services/strategy-service';
import { buildAnalysisContext } from '@/lib/analysis';
import { formatDateTime } from '@/lib/formatters';
import { isWindows } from '@/lib/platform';
import { cn } from '@/lib/utils';

export default function AskAnalystPage() {
  const queryClient = useQueryClient();
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [selectedAnalysisId, setSelectedAnalysisId] = useState('latest');
  const [question, setQuestion] = useState('');
  const [proDialogOpen, setProDialogOpen] = useState(false);
  const windowsBlocked = isWindows();

  const { data: threads } = useQuery({
    queryKey: ['analyst-threads'],
    queryFn: () => analystChatService.listThreads(),
  });
  const { data: threadDetail, isLoading: threadLoading } = useQuery({
    queryKey: ['analyst-thread', activeThreadId],
    queryFn: () => analystChatService.getThread(activeThreadId!),
    enabled: !!activeThreadId,
  });
  const { data: runs } = useQuery({
    queryKey: ['analysis-runs'],
    queryFn: () => analysisService.list(),
  });
  const { data: appSettings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => settingsService.get(),
  });
  const { data: aiSettings } = useQuery({
    queryKey: ['ai-settings'],
    queryFn: () => aiSettingsService.get(),
  });
  const { data: keyStatus } = useQuery({
    queryKey: ['ai-key-status', aiSettings?.provider ?? 'openai'],
    queryFn: () => aiKeysService.status(aiSettings?.provider ?? 'openai'),
    enabled: !!aiSettings,
    retry: false,
  });
  const { data: holdings } = useQuery({
    queryKey: ['holdings', 'default'],
    queryFn: () => holdingService.list('default'),
  });
  const { data: strategy } = useQuery({
    queryKey: ['investment-strategy'],
    queryFn: () => strategyService.get(),
  });
  const { data: milestones } = useQuery({
    queryKey: ['strategy-milestones'],
    queryFn: () => strategyService.listMilestones(),
  });

  const successfulRuns = useMemo(
    () => (runs ?? []).filter((run) => run.status === 'succeeded' && run.outputMarkdown),
    [runs],
  );
  const userQuestionCount =
    threadDetail?.messages.filter((message) => message.role === 'user').length ?? 0;
  const threadQuestionLimitReached = !!activeThreadId && userQuestionCount >= 1;
  const context = useMemo(() => {
    if (!holdings || !appSettings || !aiSettings) return null;
    return buildAnalysisContext(holdings, appSettings.baseCurrency, {
      includeExactValues: aiSettings.includeExactValues,
      includeQuantities: aiSettings.includeQuantities,
      includeNotes: aiSettings.includeNotes,
    }, appSettings.stalenessThresholdDays, strategy, milestones ?? []);
  }, [holdings, appSettings, aiSettings, strategy, milestones]);

  const askMutation = useMutation({
    mutationFn: () => {
      if (!context) throw new Error('Holdings or settings not loaded yet');
      return analystChatService.ask({
        threadId: activeThreadId ?? undefined,
        analysisRunId: selectedAnalysisId === 'latest' ? undefined : selectedAnalysisId,
        question,
        contextJson: JSON.stringify(context),
      });
    },
    onSuccess: (result) => {
      setActiveThreadId(result.thread.id);
      setQuestion('');
      void queryClient.invalidateQueries({ queryKey: ['analyst-threads'] });
      void queryClient.invalidateQueries({ queryKey: ['analyst-thread', result.thread.id] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteThread = useMutation({
    mutationFn: analystChatService.deleteThread,
    onSuccess: (_, id) => {
      if (activeThreadId === id) setActiveThreadId(null);
      void queryClient.invalidateQueries({ queryKey: ['analyst-threads'] });
      toast.success('Thread deleted');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const canTryAsk =
    !!context &&
    !!question.trim() &&
    keyStatus?.status === 'saved' &&
    !windowsBlocked &&
    !askMutation.isPending;

  function handleAsk() {
    if (threadQuestionLimitReached) {
      setProDialogOpen(true);
      return;
    }
    askMutation.mutate();
  }

  return (
    <div className="space-y-6">
      <WindowsNotReadyBanner />
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Ask Analyst</h1>
          <p className="text-sm text-muted-foreground">
            Follow up on the latest or a historical analysis using current holdings and strategy.
          </p>
          <p className="mt-1 text-sm font-medium">
            Free plan: 1 follow-up question per thread. Subscribe to Pro for unlimited follow-up chats.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => {
            setActiveThreadId(null);
            setQuestion('');
          }}
        >
          <Plus className="h-4 w-4" />
          New thread
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[18rem_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Threads</CardTitle>
            <CardDescription>Stored locally.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {!threads ? (
              <Skeleton className="h-32" />
            ) : threads.length === 0 ? (
              <EmptyState icon={MessageSquare} title="No threads" description="Ask a question to start." />
            ) : (
              threads.map((thread) => (
                <button
                  key={thread.id}
                  type="button"
                  onClick={() => setActiveThreadId(thread.id)}
                  className={cn(
                    'w-full rounded-md border p-2 text-left text-sm transition-colors',
                    activeThreadId === thread.id ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted',
                  )}
                >
                  <span className="line-clamp-2 font-medium">{thread.title}</span>
                  <span className={cn('mt-1 block text-xs', activeThreadId === thread.id ? 'opacity-80' : 'text-muted-foreground')}>
                    {formatDateTime(thread.updatedAt)}
                  </span>
                </button>
              ))
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Question context</CardTitle>
              <CardDescription>Pick the analysis memo this thread should reference.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 md:flex-row md:items-center">
              <Select value={selectedAnalysisId} onValueChange={setSelectedAnalysisId}>
                <SelectTrigger className="md:w-96">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="latest">Latest successful analysis</SelectItem>
                  {successfulRuns.map((run) => (
                    <SelectItem key={run.id} value={run.id}>
                      {run.analysisType} · {formatDateTime(run.createdAt)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Badge variant="secondary">
                {context?.holdings.length ?? 0} holdings · {context?.strategy?.milestones.length ?? 0} milestones
              </Badge>
              <Badge variant={threadQuestionLimitReached ? 'default' : 'secondary'}>
                {threadQuestionLimitReached ? 'Thread limit reached' : '1 question per thread'}
              </Badge>
              {keyStatus && keyStatus.status !== 'saved' && !windowsBlocked && (
                <span className="text-sm text-muted-foreground">Save an OpenAI key before asking.</span>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-start justify-between gap-4">
              <div>
                <CardTitle className="text-base">
                  {threadDetail?.thread.title ?? 'New thread'}
                </CardTitle>
                <CardDescription>
                  {threadDetail ? formatDateTime(threadDetail.thread.updatedAt) : 'No messages yet.'}
                </CardDescription>
              </div>
              {threadDetail && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => deleteThread.mutate(threadDetail.thread.id)}
                  disabled={deleteThread.isPending}
                  title="Delete thread"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              {threadLoading ? (
                <Skeleton className="h-48" />
              ) : threadDetail && threadDetail.messages.length > 0 ? (
                <div className="space-y-4">
                  {threadDetail.messages.map((message) => (
                    <div
                      key={message.id}
                      className={cn(
                        'rounded-md border p-3',
                        message.role === 'user' ? 'ml-auto max-w-[85%] bg-muted/40' : 'mr-auto bg-background',
                      )}
                    >
                      <div className="mb-2 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                        <span>{message.role === 'user' ? 'You' : 'Analyst'}</span>
                        <span>{formatDateTime(message.createdAt)}</span>
                      </div>
                      {message.role === 'assistant' ? (
                        <AnalystMemo markdown={message.content} sourcesJson={message.sourcesJson} />
                      ) : (
                        <p className="whitespace-pre-wrap text-sm">{message.content}</p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState
                  icon={MessageSquare}
                  title="No messages"
                  description="Ask a follow-up against the selected analysis."
                />
              )}

              <div className="space-y-2 border-t pt-4">
                {threadQuestionLimitReached && (
                  <div className="rounded-md border bg-muted/30 p-3 text-sm">
                    This thread has used its 1 free follow-up question. Start a new thread or subscribe to Pro
                    for unlimited follow-up chats with the analyst.
                  </div>
                )}
                <Textarea
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder="Ask about rebalancing, risks, milestone fit, or a prior recommendation..."
                  rows={4}
                />
                <div className="flex justify-end">
                  <Button onClick={handleAsk} disabled={!canTryAsk}>
                    <Send className="h-4 w-4" />
                    {askMutation.isPending
                      ? 'Asking...'
                      : threadQuestionLimitReached
                        ? 'Upgrade for more'
                        : 'Ask'}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={proDialogOpen} onOpenChange={setProDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Subscribe to Pro for unlimited analyst chats</DialogTitle>
            <DialogDescription>
              The free plan includes 1 follow-up question per Ask Analyst thread. This thread has
              already used its free question. Pro unlocks unlimited follow-up chats with the analyst.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setProDialogOpen(false)}>
              Not now
            </Button>
            <Button onClick={() => setProDialogOpen(false)}>
              Subscribe to Pro
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
