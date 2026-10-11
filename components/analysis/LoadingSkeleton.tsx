type LoadingStep = {
  label: string;
  state: "done" | "current" | "upcoming";
};

type LoadingSkeletonProps = {
  progress: number;
  stageLabel: string;
  /** Ordered steps for a live URL capture. Screenshot reviews keep the single line. */
  steps?: LoadingStep[];
};

/**
 * Holds the same footprint as the finished notes so the panel does not jump
 * when the review arrives. The pulse is skipped when the designer prefers
 * reduced motion.
 */
export function LoadingSkeleton({ progress, stageLabel, steps }: LoadingSkeletonProps) {
  const bounded = Math.max(0, Math.min(100, Math.round(progress)));

  return (
    <div className="mt-8" aria-hidden={false}>
      {steps && steps.length > 0 ? (
        <ol className="space-y-2.5">
          {steps.map((step, index) => (
            <li key={step.label} className="flex items-center gap-3 text-sm">
              <span
                aria-hidden="true"
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-medium ${
                  step.state === "current"
                    ? "border-accent bg-accent-soft text-ink"
                    : step.state === "done"
                      ? "border-ink bg-ink text-paper"
                      : "border-line text-mute"
                }`}
              >
                {step.state === "done" ? "✓" : index + 1}
              </span>
              <span className={step.state === "upcoming" ? "text-mute" : "text-ink"}>
                {step.label}
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-sm text-mute">{stageLabel}</p>
      )}
      <p className="sr-only" aria-live="polite">
        {stageLabel}
      </p>
      <div
        className="mt-3 h-1 overflow-hidden rounded-full bg-line"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={bounded}
        aria-valuetext={stageLabel}
      >
        <div
          className="h-full rounded-full bg-accent motion-safe:transition-[width] motion-safe:duration-500"
          style={{ width: `${bounded}%` }}
        />
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {["overall", "one", "two", "three", "four"].map((slot) => (
          <div
            key={slot}
            className={`rounded-2xl border border-line bg-paper px-4 py-4 ${
              slot === "overall" ? "sm:col-span-2" : ""
            }`}
          >
            <div className="h-3 w-24 rounded-full bg-line motion-safe:animate-pulse" />
            <div className="mt-4 h-1 rounded-full bg-line motion-safe:animate-pulse" />
            <div className="mt-4 h-3 w-4/5 rounded-full bg-line/80 motion-safe:animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
}
