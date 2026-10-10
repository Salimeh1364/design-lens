type ScoreBadgeProps = {
  label: string;
  score: number;
  summary?: string;
  emphasis?: boolean;
};

/**
 * One 0–100 score. Below 50 uses the accent so a weak axis is visible
 * without introducing a new palette.
 */
export function ScoreBadge({
  label,
  score,
  summary,
  emphasis = false,
}: ScoreBadgeProps) {
  const rounded = Math.max(0, Math.min(100, Math.round(score)));
  const weak = rounded < 50;

  return (
    <article
      className={`rounded-2xl border bg-paper px-4 py-4 ${
        weak ? "border-accent/40" : "border-line"
      }`}
    >
      <div className="flex items-baseline justify-between gap-3">
        <h3
          className={
            emphasis
              ? "font-serif text-2xl tracking-tight"
              : "text-base font-medium"
          }
        >
          {label}
        </h3>
        <p
          className={`font-serif tracking-tight ${
            emphasis ? "text-5xl" : "text-3xl"
          } ${weak ? "text-accent" : "text-ink"}`}
        >
          {rounded}
          <span className="ml-1 font-sans text-xs font-normal tracking-normal text-mute">
            /100
          </span>
        </p>
      </div>
      <div
        className="mt-3 h-1 overflow-hidden rounded-full bg-line"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={rounded}
        aria-label={label}
      >
        <div
          className={`h-full rounded-full ${weak ? "bg-accent" : "bg-ink"}`}
          style={{ width: `${rounded}%` }}
        />
      </div>
      {summary ? (
        <p className="mt-3 text-sm leading-6 text-mute">{summary}</p>
      ) : null}
    </article>
  );
}
