"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/button";
import { useLanguage } from "@/components/language-provider";

type AnalysisErrorBoundaryProps = {
  children: ReactNode;
  /** Changes when a new review starts, so a previous render crash can recover. */
  resetKey: string;
  onRetry: () => void;
};

type AnalysisErrorBoundaryState = {
  hasError: boolean;
};

/**
 * Catches a render failure inside the notes view. The data may be valid and
 * the view still throw; this keeps the rest of the page usable and offers
 * another attempt.
 *
 * خطای رندر داخل نمای یادداشت‌ها را می‌گیرد تا بقیهٔ صفحه بماند
 * و طراح بتواند یک بار دیگر تلاش کند.
 */
export class AnalysisErrorBoundary extends Component<
  AnalysisErrorBoundaryProps,
  AnalysisErrorBoundaryState
> {
  state: AnalysisErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): AnalysisErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Analysis notes failed to render", error.name, info.componentStack);
  }

  componentDidUpdate(previous: AnalysisErrorBoundaryProps) {
    if (previous.resetKey !== this.props.resetKey && this.state.hasError) {
      this.setState({ hasError: false });
    }
  }

  render() {
    if (this.state.hasError) {
      return <AnalysisRenderFallback onRetry={this.props.onRetry} />;
    }
    return this.props.children;
  }
}

function AnalysisRenderFallback({ onRetry }: { onRetry: () => void }) {
  const { t } = useLanguage();

  return (
    <div
      role="alert"
      className="mt-8 rounded-2xl border border-accent/30 bg-accent-soft px-4 py-4"
    >
      <p className="text-sm leading-6 text-ink">{t.analysisRenderError}</p>
      <Button className="mt-4" variant="ghost" size="sm" onClick={onRetry}>
        {t.retry}
      </Button>
    </div>
  );
}
