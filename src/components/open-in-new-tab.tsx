"use client";

export function OpenInNewTab() {
  return (
    <a
      href="#"
      onClick={(e) => {
        e.preventDefault();
        window.open(window.location.href, "_blank", "noopener");
      }}
      className="hidden items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2.5 text-[12px] font-bold text-[var(--color-mist)] transition-all hover:bg-white/[0.08] hover:text-[var(--color-pearl)] sm:flex"
      title="Previews embed this page in an iframe — opening it in its own tab makes sessions most reliable."
    >
      <svg
        width="13"
        height="13"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M14 4h6v6M20 4l-9 9M18 13v6a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h6" />
      </svg>
      Open in new tab
    </a>
  );
}
