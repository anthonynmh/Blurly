import { useMemo, type AnchorHTMLAttributes, type MouseEvent } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ExternalLink } from 'lucide-react';
import { openUrl } from '@tauri-apps/plugin-opener';
import type { AnalysisSource } from '@/lib/types';

interface AnalystMemoProps {
  markdown: string;
  sourcesJson?: string | null;
}

// Anchors inside the Tauri webview would otherwise navigate the app itself
// (no back button). Route every external link through the opener plugin so it
// opens in the user's default browser.
function ExternalAnchor({ href, children, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement>) {
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (!href) return;
    event.preventDefault();
    void openUrl(href);
  };
  return (
    <a {...rest} href={href} onClick={handleClick} target="_blank" rel="noreferrer noopener">
      {children}
    </a>
  );
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
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ a: ExternalAnchor }}>
          {markdown}
        </ReactMarkdown>
      </article>
      {sources.length > 0 && (
        <div className="space-y-2 border-t pt-4">
          <h3 className="text-sm font-semibold">Sources</h3>
          <ul className="space-y-1 text-sm">
            {sources.map((s, i) => (
              <li key={`${s.url}-${i}`} className="flex items-start gap-2">
                <ExternalLink className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
                <ExternalAnchor
                  href={s.url}
                  className="break-all text-blue-600 hover:underline dark:text-blue-400"
                >
                  {s.title ?? s.url}
                </ExternalAnchor>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
