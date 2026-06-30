import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { AlertCircle, CheckCircle2, KeyRound, Trash2 } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import { Skeleton } from '@/components/ui/skeleton';
import { WindowsNotReadyBanner } from '@/components/windows-not-ready-banner';
import { aiKeysService } from '@/services/ai-keys-service';
import { aiSettingsService } from '@/services/ai-settings-service';
import { twelveDataService } from '@/services/twelve-data-service';
import { isWindows } from '@/lib/platform';
import type { ApiKeyStatus } from '@/lib/types';

const keySchema = z.object({
  apiKey: z.string().min(8, 'API key looks too short'),
});

type KeyFormValues = z.infer<typeof keySchema>;

export default function KeysPage() {
  const windowsBlocked = isWindows();

  return (
    <div className="space-y-6">
      <WindowsNotReadyBanner />

      <div>
        <h1 className="text-2xl font-bold tracking-tight">Keys</h1>
        <p className="text-sm text-muted-foreground">
          Bring your own keys. Stored encrypted on this machine — never in the database, never sent anywhere except the provider.
        </p>
      </div>

      <OpenAiKeyCard disabled={windowsBlocked} />
      <TwelveDataKeyCard />
    </div>
  );
}

function OpenAiKeyCard({ disabled }: { disabled: boolean }) {
  const queryClient = useQueryClient();
  const [testing, setTesting] = useState(false);
  const provider = 'openai';
  const statusQueryKey = ['ai-key-status', provider] as const;

  const { data: keyStatus, error: keyStatusError } = useQuery({
    queryKey: statusQueryKey,
    queryFn: () => aiKeysService.status(provider),
    retry: false,
  });

  const { data: signingId } = useQuery({
    queryKey: ['app-signing-identity'],
    queryFn: () => aiKeysService.signingIdentity(),
    staleTime: Infinity,
  });

  const keyForm = useForm<KeyFormValues>({
    resolver: zodResolver(keySchema),
    defaultValues: { apiKey: '' },
    mode: 'onChange',
  });
  const typedKey = keyForm.watch('apiKey');
  const typedKeyValid = (typedKey ?? '').trim().length >= 8;
  const hasSavedKey = keyStatus?.status === 'saved';
  const isStaleKey = keyStatus?.status === 'stale';
  const statusMeta = keyStatus ? getOpenAiKeyStatusMeta(keyStatus) : null;

  const saveKey = useMutation({
    mutationFn: (values: KeyFormValues) => aiKeysService.set(provider, values.apiKey),
    onSuccess: (status) => {
      queryClient.setQueryData(statusQueryKey, status);
      void queryClient.invalidateQueries({ queryKey: ['ai-settings'] });
      void queryClient.invalidateQueries({ queryKey: statusQueryKey });
      keyForm.reset({ apiKey: '' });
      toast.success('OpenAI key saved');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteKey = useMutation({
    mutationFn: () => aiKeysService.delete(provider),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: statusQueryKey });
      void queryClient.invalidateQueries({ queryKey: ['ai-settings'] });
      toast.success('OpenAI key removed');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  async function handleTest() {
    if (!typedKeyValid) return;
    setTesting(true);
    try {
      const aiModel = await aiSettingsService.get();
      const result = await aiKeysService.test(provider, typedKey.trim(), aiModel.model);
      if (result.ok) {
        toast.success(`✓ ${result.message}`);
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
          OpenAI
          {hasSavedKey && (
            <Badge variant="secondary" className="ml-2 text-xs">
              <CheckCircle2 className="h-3 w-3" /> Connected
            </Badge>
          )}
        </CardTitle>
        <CardDescription>
          Used by the Analyst. Encrypted at rest with ChaCha20-Poly1305 (key derived per-machine) and only read when running analysis.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {keyStatusError && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Couldn&apos;t read saved key</AlertTitle>
            <AlertDescription>{(keyStatusError as Error).message}</AlertDescription>
          </Alert>
        )}
        {!keyStatusError && !statusMeta && <Skeleton className="h-24" />}
        {statusMeta && keyStatus && (
          <div className={statusMeta.containerClass}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <p className="text-sm font-medium">{statusMeta.title}</p>
                <p className="text-sm text-muted-foreground">{statusMeta.description}</p>
              </div>
              <Badge variant={statusMeta.badgeVariant}>{statusMeta.badgeLabel}</Badge>
            </div>
            <div className="grid gap-1 text-xs text-muted-foreground md:grid-cols-2">
              <p>Active provider: <code>{keyStatus.provider}</code></p>
              <p>Saved key reference: <code>{keyStatus.keyRef ?? 'none'}</code></p>
            </div>
            {signingId && (
              <p className={`text-xs ${signingId.isAdhoc ? 'text-destructive' : 'text-muted-foreground'}`}>
                Build identity: {signingId.authority ?? 'ad-hoc'}
                {signingId.cdhash ? ` — ${signingId.cdhash.slice(0, 12)}…` : ''}
                {signingId.isAdhoc ? ' — keys will not survive rebuilds' : ''}
              </p>
            )}
          </div>
        )}
        <Form {...keyForm}>
          <form
            onSubmit={keyForm.handleSubmit((v) => saveKey.mutate(v))}
            className="space-y-4"
          >
            <FormField
              control={keyForm.control}
              name="apiKey"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{hasSavedKey ? 'Replace key' : 'Enter key'}</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      type="password"
                      placeholder="sk-…"
                      autoComplete="off"
                      disabled={disabled}
                    />
                  </FormControl>
                  <FormDescription>
                    Paste a key from <code>platform.openai.com → API keys</code>. You can test it before saving.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={handleTest}
                disabled={testing || !typedKeyValid || disabled}
              >
                {testing ? 'Testing…' : 'Test connection'}
              </Button>
              <Button type="submit" disabled={saveKey.isPending || !typedKeyValid || disabled}>
                {saveKey.isPending ? 'Saving…' : hasSavedKey ? 'Replace saved key' : 'Save key'}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => deleteKey.mutate()}
                disabled={deleteKey.isPending || disabled}
                title={
                  hasSavedKey
                    ? 'Remove the saved key from disk'
                    : isStaleKey
                      ? 'Clear the stale key reference'
                      : 'Clear any orphaned secret file'
                }
              >
                <Trash2 className="h-4 w-4" /> {hasSavedKey ? 'Remove saved key' : isStaleKey ? 'Clear stale entry' : 'Clear saved key'}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Test validates the typed key only. Save is still required before Analyst can run.
            </p>
          </form>
        </Form>
      </CardContent>
    </Card>
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
  const statusMeta = getTwelveDataKeyStatusMeta(keyStatus);

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
          Used by the Auto-Refresh action on Holdings. Encrypted at rest in local app data.
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
            Test validates the typed key only. Save is required before auto-refresh can run.
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

function getOpenAiKeyStatusMeta(status: ApiKeyStatus): {
  title: string;
  description: string;
  badgeLabel: string;
  badgeVariant: 'secondary' | 'outline' | 'destructive';
  containerClass: string;
} {
  switch (status.status) {
    case 'saved':
      return {
        title: 'Key saved',
        description: 'Blurly can decrypt the saved key for OpenAI. Analyst is allowed to use it.',
        badgeLabel: 'Saved',
        badgeVariant: 'secondary',
        containerClass: 'space-y-3 rounded-md border bg-muted/30 p-3',
      };
    case 'stale':
      return {
        title: 'Saved-state mismatch',
        description: status.message ?? 'Blurly expected a saved key, but the encrypted secret file is missing.',
        badgeLabel: 'Stale',
        badgeVariant: 'outline',
        containerClass: 'space-y-3 rounded-md border border-dashed p-3',
      };
    case 'error':
      return {
        title: 'Saved key unreadable',
        description: status.message ?? 'Blurly could not decrypt the saved key. This usually means the machine identifier changed; clear and re-save.',
        badgeLabel: 'Error',
        badgeVariant: 'destructive',
        containerClass: 'space-y-3 rounded-md border border-destructive/50 bg-destructive/5 p-3',
      };
    case 'missing':
    default:
      return {
        title: 'No key saved',
        description: 'No readable key is currently saved for OpenAI.',
        badgeLabel: 'Missing',
        badgeVariant: 'outline',
        containerClass: 'space-y-3 rounded-md border border-dashed p-3',
      };
  }
}

function getTwelveDataKeyStatusMeta(status?: ApiKeyStatus): {
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
        description: 'Save a Twelve Data key before using auto-refresh.',
        badgeLabel: 'Missing',
        badgeVariant: 'outline',
        containerClass: 'space-y-3 rounded-md border border-dashed p-3',
      };
  }
}
