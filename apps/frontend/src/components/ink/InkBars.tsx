import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface InkBar {
  key: string;
  value: number;
  /** actual = solid slate, estimated = half-tone slate, projected = outline (not yet real). */
  kind?: 'actual' | 'estimated' | 'projected';
  /** Native tooltip (period + formatted amount). */
  title?: string;
}

interface InkBarsProps {
  bars: InkBar[];
  /** Left / centre / right axis labels. */
  axis: [string, string, string];
  /** One stat line under the chart. */
  stat?: ReactNode;
  ariaLabel: string;
  height?: number;
  className?: string;
}

/** Fill per bar kind; legends reuse it so the swatches always match the bars. */
export const INK_BAR_KIND: Record<NonNullable<InkBar['kind']>, string> = {
  actual: 'bg-slate',
  estimated: 'bg-slate/50',
  projected: 'border border-b-0 border-slate/60',
};

/** Thin bars on a soft baseline in the one accent tone; no gridlines. */
export function InkBars({ bars, axis, stat, ariaLabel, height = 140, className }: InkBarsProps) {
  const max = Math.max(0, ...bars.map((b) => b.value));
  return (
    <div className={cn('min-w-0', className)}>
      <div
        role="img"
        aria-label={ariaLabel}
        className="flex items-end justify-between gap-1 border-b border-hairline px-1"
        style={{ height }}
      >
        {bars.map((b) => {
          const pct = max > 0 && b.value > 0 ? Math.max((b.value / max) * 100, 2) : 0;
          return (
            <div
              key={b.key}
              title={b.title}
              className={cn(
                'w-[5px] shrink-0 rounded-t-[2px] sm:w-1.5',
                INK_BAR_KIND[b.kind ?? 'actual'],
              )}
              style={{ height: `${pct}%` }}
            />
          );
        })}
      </div>
      <div className="mt-2 flex justify-between gap-2 text-xs text-ink-3">
        <span>{axis[0]}</span>
        <span>{axis[1]}</span>
        <span>{axis[2]}</span>
      </div>
      {stat != null && <p className="mt-3 text-[13px] text-ink-2">{stat}</p>}
    </div>
  );
}
