"use client";

import { useEffect, useId, useRef, useState, type ClipboardEvent as ReactClipboardEvent, type DragEvent, type KeyboardEvent } from "react";
import { IMAGE_MIME_TYPES, MAX_SCREENSHOT_BYTES } from "@/types/analysis";
import { Button } from "./button";
import { useLanguage } from "./language-provider";

const ACCEPTED_TYPES = new Set<string>(IMAGE_MIME_TYPES);

type ScreenshotDropzoneProps = {
  file: File | null;
  previewUrl: string | null;
  onFileChange: (file: File | null) => void;
  /** Starts a review when the designer clicks Critique this screen. */
  onCritique: (file: File) => void;
};

function formatFileSize(bytes: number, locale: string) {
  const formatter = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  if (bytes < 1024 * 1024) {
    return `${formatter.format(bytes / 1024)} KB`;
  }
  return `${formatter.format(bytes / (1024 * 1024))} MB`;
}

export function ScreenshotDropzone({
  file,
  previewUrl,
  onFileChange,
  onCritique,
}: ScreenshotDropzoneProps) {
  const { locale, t } = useLanguage();
  const inputId = useId();
  const errorId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function takeFile(next: File | null): File | null {
    if (!next) return null;
    const named = next.name.trim() ? next : namedClipboardFile(next);
    if (!ACCEPTED_TYPES.has(named.type)) {
      setError(t.fileType);
      return null;
    }
    if (named.size > MAX_SCREENSHOT_BYTES) {
      setError(t.fileTooLarge);
      return null;
    }
    setError(null);
    onFileChange(named);
    return named;
  }

  useEffect(() => {
    // The listener lives on window so Ctrl+V works after a screenshot, even
    // when focus is not inside the dropzone. It is mounted only on the
    // screenshot tab, so pasting a URL on the other tab is left alone.
    // شنونده روی window است تا بعد از اسکرین‌شات، Ctrl+V کار کند حتی اگر
    // فوکوس داخل ناحیهٔ رها کردن نباشد. فقط در تب اسکرین‌شات وصل است.
    function onPaste(event: ClipboardEvent) {
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        target.closest("input, textarea, [contenteditable='true']")
      ) {
        return;
      }

      // A paste on the box is handled there. Either way, paste only selects
      // the image. Critique this screen is what starts the review.
      // جای‌گذاری فقط تصویر را انتخاب می‌کند. دکمهٔ نقد، بررسی را شروع می‌کند.
      const pasted = clipboardImage(event.clipboardData);
      if (!pasted) return;
      event.preventDefault();
      takeFile(pasted);
    }

    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [onFileChange, t.fileTooLarge, t.fileType]);

  function onBoxPaste(event: ReactClipboardEvent<HTMLDivElement>) {
    // preventDefault keeps the bitmap out of the editable box. The preview
    // is the only place the image is shown, until Critique this screen.
    // preventDefault تصویر را داخل جعبه نمی‌گذارد. پیش‌نمایش تا کلیک نقد می‌ماند.
    event.preventDefault();
    event.currentTarget.replaceChildren();
    const pasted = clipboardImage(event.clipboardData);
    if (!pasted) return;
    takeFile(pasted);
  }

  function openPicker() {
    inputRef.current?.click();
  }

  function clearFile() {
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
    onFileChange(null);
  }

  function onDragEnter(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    dragDepth.current += 1;
    setDragging(true);
  }

  function onDragLeave(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    dragDepth.current -= 1;
    if (dragDepth.current <= 0) {
      dragDepth.current = 0;
      setDragging(false);
    }
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    takeFile(event.dataTransfer.files?.[0] ?? null);
  }

  return (
    <div
      className="flex flex-col"
      onDragEnter={onDragEnter}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="sr-only"
        aria-label={t.dropTitle}
        onChange={(event) => {
          takeFile(event.target.files?.[0] ?? null);
          event.target.value = "";
        }}
      />

      {file && previewUrl ? (
        <div className={`relative rounded-2xl border border-dashed bg-paper transition ${frameClass(dragging)}`}>
          <div className="pointer-events-none flex max-h-80 items-center justify-center overflow-hidden bg-paper p-3">
            {/* Local object URLs are not served by the image optimizer. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewUrl}
              alt={t.previewAlt}
              className="max-h-72 w-full object-contain"
            />
          </div>
          <div className="relative z-10 flex flex-col gap-3 border-t border-line px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="pointer-events-none min-w-0">
              <p className="truncate text-sm font-medium">{file.name}</p>
              <p className="text-xs text-mute">
                {formatFileSize(file.size, locale)}
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={openPicker}>
                {t.replace}
              </Button>
              <Button variant="ghost" size="sm" onClick={clearFile}>
                {t.remove}
              </Button>
            </div>
          </div>
          <PasteCatcher label={t.pasteCue} onPaste={onBoxPaste} />
        </div>
      ) : (
        <div
          className={`relative flex min-h-72 flex-col items-center justify-center rounded-2xl border border-dashed px-6 py-12 text-center transition ${frameClass(dragging)}`}
        >
          <div className="pointer-events-none flex flex-col items-center">
            <span
              className={`flex h-14 w-14 items-center justify-center rounded-full border ${
                dragging
                  ? "border-accent text-accent"
                  : "border-line text-ink"
              }`}
            >
              <FrameIcon />
            </span>
            <span className="mt-5 font-serif text-3xl tracking-tight text-ink">
              {dragging ? t.dropRelease : t.dropTitle}
            </span>
            <span className="mt-2 text-sm text-mute">
              {t.dropOr}{" "}
              <button
                type="button"
                className="pointer-events-auto relative z-10 cursor-pointer underline decoration-line underline-offset-4 hover:text-ink"
                onClick={openPicker}
              >
                {t.browse}
              </button>
            </span>
            <span className="mt-5 text-xs tracking-wide text-mute">{t.dropHint}</span>
            <span className="mt-2 max-w-sm text-xs leading-5 text-mute group-focus-within:font-medium group-focus-within:text-ink">
              {t.pasteCue}
            </span>
          </div>
          <PasteCatcher label={t.pasteCue} onPaste={onBoxPaste} />
        </div>
      )}

      {error ? (
        <p id={errorId} role="alert" className="mt-3 text-sm text-accent">
          {error}
        </p>
      ) : null}

      <div className="mt-4 flex justify-end">
        <Button
          className="w-full sm:w-auto"
          disabled={!file}
          onClick={() => {
            if (file) onCritique(file);
          }}
        >
          {t.critiqueScreenshot}
        </Button>
      </div>
    </div>
  );
}

/**
 * `files` is filled by most desktop pastes. Some tools only put the bitmap
 * on `items`, so that list is the fallback.
 */
function frameClass(dragging: boolean) {
  const focus =
    "focus-within:border-accent focus-within:bg-accent-soft focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent";
  return dragging
    ? "group border-accent bg-accent-soft"
    : `group border-line bg-paper hover:border-ink/30 ${focus}`;
}

/**
 * An empty editable layer over the box. Browsers only offer Paste in the
 * native right-click menu for an editable element, so this layer is that
 * element. It stays empty; the preview is rendered beside it.
 *
 * لایهٔ خالی و قابل ویرایش روی جعبه. مرورگر گزینهٔ Paste را فقط برای
 * عنصر قابل ویرایش در منوی راست‌کلیک نشان می‌دهد.
 */
function PasteCatcher({
  label,
  onPaste,
}: {
  label: string;
  onPaste: (event: ReactClipboardEvent<HTMLDivElement>) => void;
}) {
  function blockTyping(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Tab") return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    event.preventDefault();
  }

  return (
    <div
      contentEditable
      suppressContentEditableWarning
      spellCheck={false}
      aria-label={label}
      aria-multiline={false}
      className="absolute inset-0 z-[1] cursor-pointer outline-none"
      style={{ caretColor: "transparent" }}
      onPaste={onPaste}
      onKeyDown={blockTyping}
      onBeforeInput={(event) => event.preventDefault()}
    />
  );
}

function clipboardImage(data: DataTransfer | null): File | null {
  if (!data) return null;

  const fromFiles = Array.from(data.files).find((file) => ACCEPTED_TYPES.has(file.type));
  if (fromFiles) return fromFiles;

  for (const item of data.items) {
    if (item.kind !== "file" || !ACCEPTED_TYPES.has(item.type)) continue;
    const file = item.getAsFile();
    if (file) return file;
  }
  return null;
}

function namedClipboardFile(file: File): File {
  const extension =
    file.type === "image/jpeg" ? "jpg" : file.type === "image/webp" ? "webp" : "png";
  return new File([file], `pasted-screen.${extension}`, {
    type: file.type,
    lastModified: Date.now(),
  });
}

function FrameIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true">
      <path
        d="M4 8 V5.5 A1.5 1.5 0 0 1 5.5 4 H8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M16 4 H18.5 A1.5 1.5 0 0 1 20 5.5 V8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M20 16 V18.5 A1.5 1.5 0 0 1 18.5 20 H16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M8 20 H5.5 A1.5 1.5 0 0 1 4 18.5 V16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <circle cx="12" cy="12" r="2.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}
