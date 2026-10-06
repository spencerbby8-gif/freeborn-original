type IconProps = { size?: number; className?: string; strokeWidth?: number };

function strokeProps(strokeWidth?: number) {
  return {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: strokeWidth ?? 1.7,
    strokeLinecap: "round",
    strokeLinejoin: "round",
  } as const;
}

export function LockIcon({ size = 20, className = "", strokeWidth }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} {...strokeProps(strokeWidth)} aria-hidden>
      <rect x="5" y="10.5" width="14" height="9.5" rx="2.6" />
      <path d="M8 10.5V8a4 4 0 018 0v2.5" />
      <path d="M12 14.4v2.2" />
    </svg>
  );
}

export function PinIcon({ size = 20, className = "", strokeWidth }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} {...strokeProps(strokeWidth)} aria-hidden>
      <path d="M12 21.5s-7-6.2-7-11.3A7 7 0 0119 10.2c0 5.1-7 11.3-7 11.3z" />
      <circle cx="12" cy="10" r="2.6" />
    </svg>
  );
}

export function XIcon({ size = 20, className = "", strokeWidth }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} {...strokeProps(strokeWidth)} aria-hidden>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

export function CameraIcon({ size = 20, className = "", strokeWidth }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} {...strokeProps(strokeWidth)} aria-hidden>
      <path d="M4 8.2h3l1.6-2.4h6.8L17 8.2h3a1.5 1.5 0 011.5 1.5v8.6A1.5 1.5 0 0120 19.8H4a1.5 1.5 0 01-1.5-1.5V9.7A1.5 1.5 0 014 8.2z" />
      <circle cx="12" cy="13.6" r="3.4" />
    </svg>
  );
}

export function ArrowIcon({ size = 20, className = "", strokeWidth }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} {...strokeProps(strokeWidth)} aria-hidden>
      <path d="M4 12h16M13 5l7 7-7 7" />
    </svg>
  );
}

export function ShieldIcon({ size = 20, className = "", strokeWidth }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} {...strokeProps(strokeWidth)} aria-hidden>
      <path d="M12 3l7.5 3v5.2c0 4.8-3.2 8.1-7.5 9.8-4.3-1.7-7.5-5-7.5-9.8V6L12 3z" />
      <path d="M9 11.8l2.1 2.1L15.4 9" />
    </svg>
  );
}

export function BadgeIcon({ size = 20, className = "", strokeWidth }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} {...strokeProps(strokeWidth)} aria-hidden>
      <path d="M12 2.6l2.1 1.7 2.7-.3 1 2.5 2.4 1.2-.4 2.7 1.7 2.1-1.7 2.1.4 2.7-2.4 1.2-1 2.5-2.7-.3-2.1 1.7-2.1-1.7-2.7.3-1-2.5-2.4-1.2.4-2.7L2.5 12l1.7-2.1-.4-2.7 2.4-1.2 1-2.5 2.7.3L12 2.6z" />
      <path d="M8.9 12.2l2.1 2.1 4.2-4.5" />
    </svg>
  );
}

export function HeartIcon({ size = 20, className = "", strokeWidth }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} {...strokeProps(strokeWidth)} aria-hidden>
      <path d="M12 20.4S4.3 15.6 4.3 10a4.1 4.1 0 018.1-1 4.1 4.1 0 018.1 1c0 5.6-8.5 10.4-8.5 10.4z" />
    </svg>
  );
}

export function CheckIcon({ size = 20, className = "", strokeWidth }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} {...strokeProps(strokeWidth)} aria-hidden>
      <path d="M5 12.6l4.4 4.4L19 7.4" />
    </svg>
  );
}

export function CloseIcon({ size = 20, className = "", strokeWidth }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} {...strokeProps(strokeWidth)} aria-hidden>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

/** Official multicolor Google "G" glyph. */
export function GoogleGlyph({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  );
}
