type IconProps = {
  className?: string;
};

export function LensMark({ className = "h-8 w-8" }: IconProps) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <circle
        cx="13.5"
        cy="13.5"
        r="8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <circle
        cx="13.5"
        cy="13.5"
        r="3.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        d="M19.4 19.4 L27 27"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <circle cx="13.5" cy="13.5" r="1.15" className="fill-accent" />
    </svg>
  );
}

export function ImageIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg viewBox="0 0 16 16" className={className} aria-hidden="true">
      <rect
        x="1.5"
        y="2.5"
        width="13"
        height="11"
        rx="1.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <path
        d="M2 11.5 L5.4 8.2 L7.6 10.2 L10.2 7.2 L14 11"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <circle cx="5.2" cy="5.6" r="0.9" fill="currentColor" />
    </svg>
  );
}

export function LinkIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg viewBox="0 0 16 16" className={className} aria-hidden="true">
      <path
        d="M6.6 9.4 L9.4 6.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <path
        d="M8.8 10.8 L7.6 12 C6.4 13.2 4.4 13.2 3.2 12 C2 10.8 2 8.8 3.2 7.6 L4.4 6.4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <path
        d="M7.2 5.2 L8.4 4 C9.6 2.8 11.6 2.8 12.8 4 C14 5.2 14 7.2 12.8 8.4 L11.6 9.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}
