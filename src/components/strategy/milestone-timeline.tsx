import { CalendarDays } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { formatCurrency, formatDate } from '@/lib/formatters';
import { describeMilestoneCountdown } from '@/lib/analysis';
import type {
  MilestoneReservationSummary,
} from '@/lib/calculations';
import type { StrategyMilestone } from '@/lib/types';
import { getMilestoneIcon } from './milestone-icons';

type CountdownTone = 'overdue' | 'near' | 'mid' | 'far';

function countdownTone(targetDate: string, now = new Date()): CountdownTone {
  const target = new Date(`${targetDate}T00:00:00Z`).getTime();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const diffDays = Math.round((target - today) / 86_400_000);
  if (diffDays < 0) return 'overdue';
  if (diffDays < 90) return 'near';
  if (diffDays < 365) return 'mid';
  return 'far';
}

const TONE_CLASSES: Record<CountdownTone, {
  ring: string;
  text: string;
  bg: string;
  progressStroke: string;
  chipBg: string;
  chipText: string;
  chipBorder: string;
}> = {
  overdue: {
    ring: 'border-amber-500/40',
    text: 'text-amber-700 dark:text-amber-400',
    bg: 'bg-amber-500/10',
    progressStroke: 'stroke-amber-500',
    chipBg: 'bg-amber-500/15',
    chipText: 'text-amber-700 dark:text-amber-400',
    chipBorder: 'border-amber-500/30',
  },
  near: {
    ring: 'border-rose-500/40',
    text: 'text-rose-700 dark:text-rose-400',
    bg: 'bg-rose-500/10',
    progressStroke: 'stroke-rose-500',
    chipBg: 'bg-rose-500/15',
    chipText: 'text-rose-700 dark:text-rose-400',
    chipBorder: 'border-rose-500/30',
  },
  mid: {
    ring: 'border-emerald-500/40',
    text: 'text-emerald-700 dark:text-emerald-400',
    bg: 'bg-emerald-500/10',
    progressStroke: 'stroke-emerald-500',
    chipBg: 'bg-emerald-500/15',
    chipText: 'text-emerald-700 dark:text-emerald-400',
    chipBorder: 'border-emerald-500/30',
  },
  far: {
    ring: 'border-sky-500/40',
    text: 'text-sky-700 dark:text-sky-400',
    bg: 'bg-sky-500/10',
    progressStroke: 'stroke-sky-500',
    chipBg: 'bg-sky-500/15',
    chipText: 'text-sky-700 dark:text-sky-400',
    chipBorder: 'border-sky-500/30',
  },
};

interface MilestoneTimelineProps {
  milestones: StrategyMilestone[];
  reservationSummaries: Map<string, MilestoneReservationSummary>;
  onEdit: (milestone: StrategyMilestone) => void;
}

export function MilestoneTimeline({
  milestones,
  reservationSummaries,
  onEdit,
}: MilestoneTimelineProps) {
  return (
    <TooltipProvider delayDuration={150}>
      {/* Desktop / md+: horizontal rail with nodes stacked above/below */}
      <div className="hidden md:block">
        <div className="relative overflow-x-auto pb-2 pt-8">
          <div
            className="absolute inset-x-6 top-[calc(50%+0.75rem)] h-0.5 rounded-full bg-gradient-to-r from-primary/60 via-primary/25 to-muted"
            aria-hidden
          />
          <ol className="relative flex min-w-full items-stretch gap-6 px-2">
            {milestones.map((m, i) => (
              <li key={m.id} className="flex flex-1 min-w-[10rem] flex-col items-center gap-2">
                <MilestoneNode
                  milestone={m}
                  index={i}
                  summary={reservationSummaries.get(m.id)}
                  onClick={() => onEdit(m)}
                  orientation="horizontal"
                />
              </li>
            ))}
          </ol>
        </div>
      </div>

      {/* Mobile: vertical rail on the left */}
      <div className="md:hidden">
        <ol className="relative space-y-4 pl-6">
          <div
            className="absolute left-2 top-2 bottom-2 w-0.5 rounded-full bg-gradient-to-b from-primary/60 via-primary/25 to-muted"
            aria-hidden
          />
          {milestones.map((m, i) => (
            <li key={m.id} className="flex items-start gap-3">
              <MilestoneNode
                milestone={m}
                index={i}
                summary={reservationSummaries.get(m.id)}
                onClick={() => onEdit(m)}
                orientation="vertical"
              />
            </li>
          ))}
        </ol>
      </div>
    </TooltipProvider>
  );
}

interface MilestoneNodeProps {
  milestone: StrategyMilestone;
  index: number;
  summary: MilestoneReservationSummary | undefined;
  onClick: () => void;
  orientation: 'horizontal' | 'vertical';
}

function MilestoneNode({ milestone, index, summary, onClick, orientation }: MilestoneNodeProps) {
  const tone = countdownTone(milestone.targetDate);
  const classes = TONE_CLASSES[tone];
  const Icon = getMilestoneIcon(milestone.icon);
  const countdown = describeMilestoneCountdown(milestone.targetDate);
  const reserved = summary?.totalReservedInTargetCurrency ?? 0;
  const target = milestone.targetAmount ?? 0;
  const rawPct = target > 0 ? reserved / target : 0;
  const cappedPct = Math.max(0, Math.min(1, rawPct));
  const hasReservations = (summary?.reservations.length ?? 0) > 0;

  const reservationChip = (() => {
    if (!hasReservations) {
      return (
        <span className="text-xs text-muted-foreground">No reserve linked</span>
      );
    }
    if (target > 0 && milestone.targetCurrency && !summary?.fxMissing) {
      return (
        <Badge variant="secondary" className={cn(classes.chipBg, classes.chipText, classes.chipBorder, 'border')}>
          {formatCurrency(reserved, milestone.targetCurrency)} of{' '}
          {formatCurrency(target, milestone.targetCurrency)} · {Math.round(rawPct * 100)}%
        </Badge>
      );
    }
    // Fall back to raw per-currency sums
    const parts = Object.entries(summary?.byCurrency ?? {}).map(
      ([ccy, amt]) => formatCurrency(amt, ccy),
    );
    return (
      <Badge variant="secondary" className={cn(classes.chipBg, classes.chipText, classes.chipBorder, 'border')}>
        Reserved {parts.join(' + ')}
      </Badge>
    );
  })();

  return (
    <>
      {orientation === 'horizontal' ? (
        <>
          <div className="min-h-[3.5rem] text-center">
            <div className="text-sm font-semibold leading-tight line-clamp-2">{milestone.label}</div>
            <div className="text-xs text-muted-foreground">{index + 1}</div>
          </div>

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={onClick}
                aria-label={`Edit milestone ${milestone.label}`}
                className={cn(
                  'group relative isolate flex h-14 w-14 items-center justify-center rounded-full border-2 transition-all duration-200 ease-out hover:scale-105 hover:shadow-md motion-reduce:transition-none motion-reduce:hover:scale-100',
                  classes.bg,
                  classes.ring,
                )}
              >
                <ProgressRing pct={cappedPct} toneClass={classes.progressStroke} dashed={!hasReservations} />
                <Icon className={cn('relative z-10 h-6 w-6', classes.text)} />
              </button>
            </TooltipTrigger>
            <TooltipContent>
              <div className="space-y-1 text-xs">
                <div className="font-medium">{milestone.label}</div>
                <div>{countdown} · {formatDate(milestone.targetDate)}</div>
                {milestone.targetAmount != null && milestone.targetCurrency && (
                  <div>Target {formatCurrency(milestone.targetAmount, milestone.targetCurrency)}</div>
                )}
                {hasReservations && summary && target > 0 && milestone.targetCurrency && !summary.fxMissing && (
                  <div>Reserved {Math.round(rawPct * 100)}%</div>
                )}
                <div className="pt-1 text-muted-foreground">Click to edit</div>
              </div>
            </TooltipContent>
          </Tooltip>

          <Badge variant="secondary" className={cn('gap-1', classes.chipBg, classes.chipText, classes.chipBorder, 'border')}>
            <CalendarDays className="h-3 w-3" />
            {countdown}
          </Badge>
          <div className="text-xs text-muted-foreground">{formatDate(milestone.targetDate)}</div>
          {reservationChip}
        </>
      ) : (
        <>
          <button
            type="button"
            onClick={onClick}
            aria-label={`Edit milestone ${milestone.label}`}
            className={cn(
              'absolute left-0 top-1 flex h-10 w-10 items-center justify-center rounded-full border-2 transition-all duration-200 hover:scale-105',
              classes.bg,
              classes.ring,
            )}
          >
            <ProgressRing pct={cappedPct} toneClass={classes.progressStroke} dashed={!hasReservations} />
            <Icon className={cn('relative z-10 h-5 w-5', classes.text)} />
          </button>
          <div className="ml-10 flex-1 space-y-1">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="text-sm font-semibold">{milestone.label}</span>
              <span className="text-xs text-muted-foreground">{formatDate(milestone.targetDate)}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className={cn('gap-1', classes.chipBg, classes.chipText, classes.chipBorder, 'border')}>
                <CalendarDays className="h-3 w-3" />
                {countdown}
              </Badge>
              {reservationChip}
            </div>
            <button type="button" onClick={onClick} className="text-xs text-primary underline-offset-4 hover:underline">
              Edit
            </button>
          </div>
        </>
      )}
    </>
  );
}

/** Thin SVG ring showing reservation coverage. Dashed when no reservations linked. */
function ProgressRing({
  pct,
  toneClass,
  dashed,
}: {
  pct: number;
  toneClass: string;
  dashed: boolean;
}) {
  const size = 56;
  const stroke = 2.5;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = c * pct;
  return (
    <svg
      className="absolute inset-0 -rotate-90"
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      aria-hidden
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        className="fill-none stroke-muted-foreground/20"
        strokeWidth={stroke}
        strokeDasharray={dashed ? '3 3' : undefined}
      />
      {!dashed && (
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          className={cn('fill-none', toneClass)}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c}`}
        />
      )}
    </svg>
  );
}
