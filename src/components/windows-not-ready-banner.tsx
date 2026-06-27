import { AlertTriangle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { isWindows } from '@/lib/platform';

export function WindowsNotReadyBanner() {
  if (!isWindows()) return null;
  return (
    <Alert className="border-yellow-500/50 bg-yellow-500/10 text-yellow-900 dark:text-yellow-200">
      <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
      <AlertTitle>Not ready on Windows</AlertTitle>
      <AlertDescription>
        The Analyst module isn&apos;t tested on Windows yet. BYOK key storage and analysis runs may not work
        — macOS is the supported platform for this phase.
      </AlertDescription>
    </Alert>
  );
}
