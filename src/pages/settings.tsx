import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
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
import { useEffect } from 'react';

const CURRENCY_OPTIONS = ['USD', 'SGD'] as const;

const settingsSchema = z.object({
  portfolioName: z.string().min(1, 'Portfolio name is required'),
  baseCurrency: z.enum(CURRENCY_OPTIONS),
  defaultCurrency: z.enum(CURRENCY_OPTIONS),
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
      });
    }
  }, [settings, form]);

  const mutation = useMutation({
    mutationFn: (values: SettingsFormValues) => settingsService.update(values),
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

              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? 'Saving…' : 'Save Settings'}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>

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
