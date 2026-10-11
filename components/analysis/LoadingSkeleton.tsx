type LoadingSkeletonProps = {
  progress: number;
  stageLabel: string;
};

/**
 * Holds the same footprint as the finished notes so the panel does not jump
 * when the review arrives. The pulse is skipped when the designer prefers
 * reduced motion.
 */
export function LoadingSkeleton({ progress, stageLabel }: LoadingSkeletonProps) {
  const bounded = Math.max(0, Math.min(100, Math.round(progress)));

  return (
    <div className="mt-8" aria-hidden={false}>
      <p className="text-sm text-mute" aria-live="polite">
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
