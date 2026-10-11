"use client";

import { LensMark } from "./icons";
import { useLanguage } from "./language-provider";
import type { Locale } from "@/lib/types";

const LOCALES: { id: Locale; short: string }[] = [
  { id: "en", short: "EN" },
  { id: "de", short: "DE" },
];

/** Sticky bar: brand, section links, and the English/German switch. */
export function SiteHeader() {
  const { locale, setLocale, t } = useLanguage();

  return (
    <header className="sticky top-0 z-20 border-b border-line/80 bg-paper/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between gap-4 px-5 sm:px-8">
        <a href="#top" className="flex items-center gap-2.5 text-ink">
          <LensMark className="h-7 w-7" />
          <span className="font-serif text-[1.35rem] leading-none tracking-tight">
            Design <span className="italic text-accent">Lens</span>
          </span>
        </a>

        <nav className="flex items-center gap-1 sm:gap-6" aria-label={t.brandNav}>
          <a
            href="#source"
            className="hidden rounded-full px-3 py-2 text-sm text-mute transition hover:text-ink sm:inline"
          >
            {t.navSource}
          </a>
          <a
            href="#critique"
            className="hidden rounded-full px-3 py-2 text-sm text-mute transition hover:text-ink sm:inline"
          >
            {t.navNotes}
          </a>
          <div
            role="group"
            aria-label={t.languageLabel}
            className="flex rounded-full border border-line bg-card p-1"
          >
            {LOCALES.map((item) => {
              const selected = locale === item.id;
              const name = item.id === "en" ? t.localeEn : t.localeDe;
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={selected}
                  aria-label={name}
                  onClick={() => setLocale(item.id)}
                  className={`cursor-pointer rounded-full px-3 py-1.5 text-xs font-medium tracking-wide transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                    selected ? "bg-ink text-paper" : "text-mute hover:text-ink"
                  }`}
                >
                  {item.short}
                </button>
              );
            })}
          </div>
        </nav>
      </div>
    </header>
  );
}
