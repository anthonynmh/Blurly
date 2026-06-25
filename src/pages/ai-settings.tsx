import { useEffect, useState } from 'react';
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
import { Switch } from '@/components/ui/switch';
import { WindowsNotReadyBanner } from '@/components/windows-not-ready-banner';
import { aiKeysService } from '@/services/ai-keys-service';
import { aiSettingsService } from '@/services/ai-settings-service';
import { isWindows } from '@/lib/platform';

const settingsSchema = z.object({
  provider: z.string().min(1),
  model: z.string().min(1, 'Model is required'),
  webSearchEnabled: z.boolean(),
  includeExactValues: z.boolean(),
  includeQuantities: z.boolean(),
  includeNotes: z.boolean(),
});

type SettingsFormValues = z.infer<typeof settingsSchema>;

const keySchema = z.object({
  apiKey: z.string().min(8, 'API key looks too short'),
});

type KeyFormValues = z.infer<typeof keySchema>;

export default function AiSettingsPage() {
  const queryClient = useQueryClient();
  const windowsBlocked = isWindows();

  const { data: settings, isLoading } = useQuery({
    queryKey: ['ai-settings'],
    queryFn: () => aiSettingsService.get(),
  });

  const form = useForm<SettingsFormValues>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      provider: 'openai',
      model: 'gpt-4o',
      webSearchEnabled: true,
      includeExactValues: false,
      includeQuantities: false,
      includeNotes: false,
    },
  });

  useEffect(() => {
    if (settings) {
      form.reset({
        provider: settings.provider,
        model: settings.model,
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
      toast.success('AI settings saved');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  if (isLoading) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <h1 className="text-2xl font-bold">AI Settings</h1>
        <Skeleton className="h-64" />
      </div>
    );
  }

  const provider = form.watch('provider');

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <WindowsNotReadyBanner />

      <div>
        <h1 className="text-2xl font-bold tracking-tight">AI Settings</h1>
        <p className="text-sm text-muted-foreground">
          Bring your own API key. Keys are stored in your macOS Keychain — never in Blurly&apos;s database.
        </p>
      </div>

      <ApiKeyCard provider={provider} disabled={windowsBlocked} />

      <Card>
        <CardHeader>
          <CardTitle>Provider &amp; model</CardTitle>
          <CardDescription>Only OpenAI is supported in this phase.</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit((v) => saveSettings.mutate(v))}
              className="space-y-5"
            >
              <FormField
                control={form.control}
                name="provider"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Provider</FormLabel>
                    <FormControl>
                      <Input {...field} disabled />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="model"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Model</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="gpt-4o" />
                    </FormControl>
                    <FormDescription>
                      Use a model that supports the Responses API and web search (e.g. <code>gpt-4o</code>).
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="webSearchEnabled"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel>Enable web search</FormLabel>
                      <FormDescription>
                        Lets the analyst look up recent news and developments relevant to your holdings.
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
        </CardContent>
      </Card>
    </div>
  );
}

type PrivacyFormProps = {
  form: ReturnType<typeof useForm<SettingsFormValues>>;
  name: 'includeExactValues' | 'includeQuantities' | 'includeNotes';
  label: string;
  description: string;
};

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

interface ApiKeyCardProps {
  provider: string;
  disabled: boolean;
}

function ApiKeyCard({ provider, disabled }: ApiKeyCardProps) {
  const queryClient = useQueryClient();
  const [testing, setTesting] = useState(false);

  const { data: hasKey, error: hasKeyError } = useQuery({
    queryKey: ['ai-has-key', provider],
    queryFn: () => aiKeysService.has(provider),
    retry: false,
  });

  const keyForm = useForm<KeyFormValues>({
    resolver: zodResolver(keySchema),
    defaultValues: { apiKey: '' },
    mode: 'onChange',
  });
  const typedKey = keyForm.watch('apiKey');
  const typedKeyValid = (typedKey ?? '').trim().length >= 8;

  const saveKey = useMutation({
    mutationFn: (values: KeyFormValues) => aiKeysService.set(provider, values.apiKey),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['ai-has-key', provider] });
      void queryClient.invalidateQueries({ queryKey: ['ai-settings'] });
      keyForm.reset({ apiKey: '' });
      toast.success('API key saved to Keychain');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteKey = useMutation({
    mutationFn: () => aiKeysService.delete(provider),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['ai-has-key', provider] });
      void queryClient.invalidateQueries({ queryKey: ['ai-settings'] });
      toast.success('API key removed');
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
          API key
          {hasKey && (
            <Badge variant="secondary" className="ml-2 text-xs">
              <CheckCircle2 className="h-3 w-3" /> Connected
            </Badge>
          )}
        </CardTitle>
        <CardDescription>
          Keys are stored in macOS Keychain and only read when running analysis. They are never sent anywhere except the provider.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {hasKeyError && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Couldn&apos;t read keychain</AlertTitle>
            <AlertDescription>{(hasKeyError as Error).message}</AlertDescription>
          </Alert>
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
                  <FormLabel>{hasKey ? 'Replace key' : 'Enter key'}</FormLabel>
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
                    For OpenAI, paste a key from{' '}
                    <code>platform.openai.com → API keys</code>. You can test it before saving.
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
                {saveKey.isPending ? 'Saving…' : hasKey ? 'Replace key' : 'Save key'}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => deleteKey.mutate()}
                disabled={deleteKey.isPending || disabled}
                title={hasKey ? 'Remove the saved key from Keychain' : 'Clear any orphaned com.blurly.app entry in Keychain'}
              >
                <Trash2 className="h-4 w-4" /> {hasKey ? 'Remove key' : 'Clear keychain entry'}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
