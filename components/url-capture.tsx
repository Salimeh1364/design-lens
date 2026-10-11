"use client";

import { useId, useState, type FormEvent } from "react";
import { Button } from "./button";
import { useLanguage } from "./language-provider";

type UrlCaptureProps = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (url: string) => void;
};

/**
 * Accepts a bare host or a full URL and returns an absolute http(s) address.
 * A missing scheme is treated as https. Localhost is allowed here; the server
 * still refuses it before capture.
 */
export function parseWebsiteUrl(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const withProtocol = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  try {
    const url = new URL(withProtocol);
    const isWeb = url.protocol === "http:" || url.protocol === "https:";
    const hasHost =
      url.hostname === "localhost" || url.hostname.includes(".");
    if (!isWeb || !hasHost) return null;
    return url.toString();
  } catch {
    return null;
  }
}

/** Website field. Submit normalizes the address and hands it to the page. */
export function UrlCapture({ value, onChange, onSubmit }: UrlCaptureProps) {
  const { t } = useLanguage();
  const fieldId = useId();
  const hintId = useId();
  const errorId = useId();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = parseWebsiteUrl(value);
    if (!parsed) {
      setError(t.urlInvalid);
      return;
    }
    setError(null);
    onChange(parsed);
    onSubmit(parsed);
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col"
      noValidate
    >
      <label htmlFor={fieldId} className="text-sm font-medium">
        {t.urlLabel}
      </label>
      <div className="mt-3 flex flex-col gap-3 sm:flex-row">
        <input
          id={fieldId}
          name="website"
          type="text"
          inputMode="url"
          autoComplete="url"
          spellCheck={false}
          placeholder={t.urlPlaceholder}
          value={value}
          onChange={(event) => {
            setError(null);
            onChange(event.target.value);
          }}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${hintId} ${errorId}` : hintId}
          className="h-12 w-full rounded-full border border-line bg-paper px-5 text-base text-ink outline-none transition placeholder:text-mute/70 focus:border-ink"
        />
        <Button type="submit" className="shrink-0">
          {t.critiqueUrl}
        </Button>
      </div>
      <p id={hintId} className="mt-4 max-w-xl text-sm leading-6 text-mute">
        {t.urlHint}
      </p>
      {error ? (
        <p id={errorId} role="alert" className="mt-2 text-sm text-accent">
          {error}
        </p>
      ) : null}
    </form>
  );
}
