import type { Locale } from "./types";

/**
 * UI copy for English and German. Components read `t` from the language
 * provider. A `{label}` placeholder is filled by `fillLabel`.
 */
export type Dictionary = {
  brandNav: string;
  navSource: string;
  navNotes: string;
  languageLabel: string;
  localeEn: string;
  localeDe: string;
  eyebrow: string;
  headlineLead: string;
  headlineEmphasis: string;
  headlineTail: string;
  lede: string;
  tablistLabel: string;
  tabScreenshot: string;
  tabUrl: string;
  dropTitle: string;
  dropRelease: string;
  dropOr: string;
  browse: string;
  dropHint: string;
  pasteCue: string;
  replace: string;
  remove: string;
  fileTooLarge: string;
  fileType: string;
  critiqueScreenshot: string;
  previewAlt: string;
  urlLabel: string;
  urlPlaceholder: string;
  urlHint: string;
  critiqueUrl: string;
  urlInvalid: string;
  resultsTitle: string;
  resultsEmpty: string;
  resultsEmptyBody: string;
  resultsReadyBody: string;
  statusIdle: string;
  statusReady: string;
  facetHierarchy: string;
  facetContrast: string;
  facetSpacing: string;
  facetType: string;
  facetPending: string;
  analysisReading: string;
  analysisFailedBody: string;
  statusAnalyzing: string;
  statusComplete: string;
  statusFailed: string;
  progressPreparing: string;
  progressSending: string;
  progressReviewing: string;
  progressWriting: string;
  urlStepConnect: string;
  urlStepCapture: string;
  urlStepAnalyze: string;
  retry: string;
  resetReview: string;
  overallLabel: string;
  feedbackLabel: string;
  recommendationLabel: string;
  evidenceLabel: string;
  severityHigh: string;
  severityMedium: string;
  severityLow: string;
  errorGeneric: string;
  errorNetwork: string;
  errorInvalid: string;
  errorMissingKey: string;
  errorQuota: string;
  errorUpstream: string;
  errorParse: string;
  errorPage: string;
  errorTooLarge: string;
  errorTimeout: string;
  analysisRenderError: string;
  footer: string;
};

export const dictionaries: Record<Locale, Dictionary> = {
  en: {
    brandNav: "Primary",
    navSource: "Upload",
    navNotes: "Notes",
    languageLabel: "Language",
    localeEn: "English",
    localeDe: "German",
    eyebrow: "AI design critique",
    headlineLead: "A ",
    headlineEmphasis: "sharper",
    headlineTail: " read of every screen.",
    lede: "Upload any UI screenshot or design export (from Figma, Adobe XD, or Sketch), or paste a live URL. Design Lens analyzes hierarchy, contrast, spacing, and typography to give you clear, actionable design review notes.",
    tablistLabel: "What to review",
    tabScreenshot: "Screenshot",
    tabUrl: "Website",
    dropTitle: "Drop a screen here",
    dropRelease: "Release to upload",
    dropOr: "or",
    browse: "browse files",
    dropHint: "PNG, JPG, or WebP · up to 10 MB",
    pasteCue: "Click the box, then right-click and choose Paste, or press Ctrl+V.",
    replace: "Replace",
    remove: "Remove",
    fileTooLarge: "That file is over 10 MB. Export a lighter screenshot.",
    fileType: "Use a PNG, JPG, or WebP screenshot.",
    critiqueScreenshot: "Critique this screen",
    previewAlt: "Selected screenshot",
    urlLabel: "Website address",
    urlPlaceholder: "https://your-product.com",
    urlHint: "Live URL captures take 5–10 seconds. Upload a screenshot for a faster result.",
    critiqueUrl: "Critique this page",
    urlInvalid: "Enter a valid website address, such as your-product.com.",
    resultsTitle: "Critique notes",
    resultsEmpty: "Waiting for a screen.",
    resultsEmptyBody:
      "Choose a screenshot or a URL above. Hierarchy, contrast, spacing, and typography will be written up in this panel.",
    resultsReadyBody: "Notes for {label}.",
    statusIdle: "No source",
    statusReady: "Source ready",
    facetHierarchy: "Hierarchy",
    facetContrast: "Contrast",
    facetSpacing: "Spacing",
    facetType: "Typography",
    facetPending: "Awaiting analysis",
    analysisReading: "Reading {label}…",
    analysisFailedBody: "The review of {label} did not finish.",
    statusAnalyzing: "Reviewing",
    statusComplete: "Notes ready",
    statusFailed: "Review failed",
    progressPreparing: "Preparing the source",
    progressSending: "Sending it for review",
    progressReviewing: "Reading hierarchy, space, and type",
    progressWriting: "Writing the notes",
    urlStepConnect: "Connecting to website...",
    urlStepCapture: "Capturing page screenshot...",
    urlStepAnalyze: "Analyzing design hierarchy...",
    retry: "Try again",
    resetReview: "Try another screen",
    overallLabel: "Overall",
    feedbackLabel: "What is off",
    recommendationLabel: "What to change",
    evidenceLabel: "Evidence",
    severityHigh: "High",
    severityMedium: "Medium",
    severityLow: "Low",
    errorGeneric: "The review could not be finished. Try again in a moment.",
    errorNetwork: "Design Lens could not reach the server. Check your connection and try again.",
    errorInvalid: "That source could not be reviewed. Use a PNG, JPG, or WebP under 10 MB, or a public web address.",
    errorMissingKey: "Analysis is not configured yet. Add a Gemini API key on the server.",
    errorQuota: "Today's free reviews are used up. Try again tomorrow.",
    errorUpstream: "The review service did not respond. Try again in a moment.",
    errorParse: "The review came back in an unexpected shape. Try again.",
    errorPage: "That page did not respond in time. Try again in a moment, or upload a screenshot instead.",
    errorTooLarge: "That file is too large to send. Export a lighter screenshot.",
    errorTimeout: "The review timed out before it could finish. Wait a moment and try again.",
    analysisRenderError: "These notes could not be shown. Try the review again.",
    footer: "Design Lens reads the screen. The decisions stay yours.",
  },
  de: {
    brandNav: "Hauptnavigation",
    navSource: "Hochladen",
    navNotes: "Notizen",
    languageLabel: "Sprache",
    localeEn: "Englisch",
    localeDe: "Deutsch",
    eyebrow: "KI-Designkritik",
    headlineLead: "Ein ",
    headlineEmphasis: "schärferer",
    headlineTail: " Blick auf jeden Screen.",
    lede: "Lade einen beliebigen UI-Screenshot oder Design-Export (aus Figma, Adobe XD oder Sketch) hoch, oder füge eine Live-URL ein. Design Lens analysiert Hierarchie, Kontrast, Abstände und Typografie und gibt dir klare, umsetzbare Design-Review-Notizen.",
    tablistLabel: "Was geprüft wird",
    tabScreenshot: "Screenshot",
    tabUrl: "Website",
    dropTitle: "Screen hier ablegen",
    dropRelease: "Loslassen zum Hochladen",
    dropOr: "oder",
    browse: "Dateien durchsuchen",
    dropHint: "PNG, JPG oder WebP · bis 10 MB",
    pasteCue: "Klicke in das Feld, dann Rechtsklick und Einfügen, oder drücke Strg+V.",
    replace: "Ersetzen",
    remove: "Entfernen",
    fileTooLarge: "Die Datei ist größer als 10 MB. Exportiere einen leichteren Screenshot.",
    fileType: "Bitte einen Screenshot als PNG, JPG oder WebP verwenden.",
    critiqueScreenshot: "Diesen Screen prüfen",
    previewAlt: "Ausgewählter Screenshot",
    urlLabel: "Website-Adresse",
    urlPlaceholder: "https://dein-produkt.de",
    urlHint: "Live-Aufnahmen dauern 5–10 Sekunden. Lade einen Screenshot hoch, wenn du ein schnelleres Ergebnis möchtest.",
    critiqueUrl: "Diese Seite prüfen",
    urlInvalid: "Gib eine gültige Website-Adresse ein, zum Beispiel dein-produkt.de.",
    resultsTitle: "Kritiknotizen",
    resultsEmpty: "Wartet auf einen Screen.",
    resultsEmptyBody:
      "Wähle oben einen Screenshot oder eine URL. Hierarchie, Kontrast, Abstände und Typografie werden in diesem Bereich ausformuliert.",
    resultsReadyBody: "Notizen zu {label}.",
    statusIdle: "Keine Quelle",
    statusReady: "Quelle bereit",
    facetHierarchy: "Hierarchie",
    facetContrast: "Kontrast",
    facetSpacing: "Abstände",
    facetType: "Typografie",
    facetPending: "Wartet auf die Analyse",
    analysisReading: "{label} wird gelesen …",
    analysisFailedBody: "Die Prüfung von {label} wurde nicht abgeschlossen.",
    statusAnalyzing: "In Prüfung",
    statusComplete: "Notizen fertig",
    statusFailed: "Prüfung fehlgeschlagen",
    progressPreparing: "Quelle wird vorbereitet",
    progressSending: "Wird zur Prüfung gesendet",
    progressReviewing: "Hierarchie, Abstände und Schrift werden gelesen",
    progressWriting: "Notizen werden geschrieben",
    urlStepConnect: "Verbindung zur Website wird hergestellt...",
    urlStepCapture: "Screenshot der Seite wird aufgenommen...",
    urlStepAnalyze: "Design-Hierarchie wird analysiert...",
    retry: "Erneut versuchen",
    resetReview: "Anderen Screen wählen",
    overallLabel: "Gesamt",
    feedbackLabel: "Was hakt",
    recommendationLabel: "Was sich ändern sollte",
    evidenceLabel: "Belege",
    severityHigh: "Hoch",
    severityMedium: "Mittel",
    severityLow: "Niedrig",
    errorGeneric: "Die Prüfung konnte nicht abgeschlossen werden. Versuche es gleich noch einmal.",
    errorNetwork: "Design Lens hat den Server nicht erreicht. Prüfe die Verbindung und versuche es erneut.",
    errorInvalid: "Diese Quelle kann nicht geprüft werden. Nutze ein PNG, JPG oder WebP unter 10 MB oder eine öffentliche Webadresse.",
    errorMissingKey: "Die Analyse ist noch nicht eingerichtet. Hinterlege einen Gemini-API-Schlüssel auf dem Server.",
    errorQuota: "Die kostenlosen Prüfungen für heute sind aufgebraucht. Versuche es morgen erneut.",
    errorUpstream: "Der Prüfdienst hat nicht geantwortet. Versuche es gleich noch einmal.",
    errorParse: "Die Prüfung kam in einer unerwarteten Form zurück. Versuche es erneut.",
    errorPage: "Die Seite hat nicht rechtzeitig geantwortet. Versuche es gleich noch einmal, oder lade stattdessen einen Screenshot hoch.",
    errorTooLarge: "Die Datei ist zu groß. Exportiere einen leichteren Screenshot.",
    errorTimeout: "Die Prüfung hat das Zeitlimit überschritten. Warte einen Moment und versuche es erneut.",
    analysisRenderError: "Diese Notizen konnten nicht angezeigt werden. Starte die Prüfung erneut.",
    footer: "Design Lens liest den Screen. Die Entscheidungen bleiben bei dir.",
  },
};

/** Replaces every `{label}` in a sentence with the source name. */
export function fillLabel(template: string, label: string) {
  return template.replaceAll("{label}", label);
}
