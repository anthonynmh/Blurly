import { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ExternalLink } from 'lucide-react';
import type { AnalysisSource } from '@/lib/types';

interface AnalystMemoProps {
  markdown: string;
  sourcesJson?: string | null;
}

export function AnalystMemo({ markdown, sourcesJson }: AnalystMemoProps) {
  const sources = useMemo<AnalysisSource[]>(() => {
    if (!sourcesJson) return [];
    try {
      const parsed = JSON.parse(sourcesJson);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }, [sourcesJson]);

  return (
    <div className="space-y-6">
      <article className="prose prose-neutral max-w-none dark:prose-invert prose-headings:font-semibold prose-h2:mt-6 prose-h2:text-lg prose-h3:text-base prose-pre:bg-muted">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>
      </article>
      {sources.length > 0 && (
        <div className="space-y-2 border-t pt-4">
          <h3 className="text-sm font-semibold">Sources</h3>
          <ul className="space-y-1 text-sm">
            {sources.map((s, i) => (
              <li key={`${s.url}-${i}`} className="flex items-start gap-2">
                <ExternalLink className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
                <a
                  href={s.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="break-all text-blue-600 hover:underline dark:text-blue-400"
                >
                  {s.title ?? s.url}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
