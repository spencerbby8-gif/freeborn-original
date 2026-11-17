import Image from "next/image";

export type WordmarkSize = "sm" | "md" | "lg";

/**
 * Freeborn Monogram — "The Flame" (elevated)
 *
 * An abstract F-shape carved by two ember arcs meeting at a golden center,
 * set on a midnight plate with an ember → gold → violet gradient ring.
 * Ancient like a seal, modern like a spark. Pure SVG, crisp at any size.
 */
export function Monogram({ size = 42 }: { size?: number }) {

  return (
    <div
      className="relative flex shrink-0 items-center justify-center"
      style={{ width: size, height: size }}
      aria-hidden
    >
      {/* Ambient glow behind the seal */}
      <div
        className="pulse-glow absolute inset-0 rounded-[32%]"
        style={{
          background:
            "radial-gradient(circle at 35% 35%, rgba(239,94,94,0.42) 0%, rgba(217,167,82,0.22) 45%, transparent 70%)",
          filter: "blur(8px)",
        }}
      />
      <Image
        src="/images/brand/monogram-512.png"
        alt=""
        width={size}
        height={size}
        priority
        className="relative drop-shadow-[0_4px_12px_rgba(0,0,0,0.5)]"
      />
    </div>
  );
}

const dims: Record<WordmarkSize, { logo: number; name: string; tag: string }> = {
  sm: { logo: 32, name: "text-[18px]", tag: "text-[7px]" },
  md: { logo: 42, name: "text-[22px]", tag: "text-[8px]" },
  lg: { logo: 64, name: "text-[32px] leading-none", tag: "text-[9px]" },
};

export function Wordmark({
  muted = false,
  size = "md",
  mono = false,
}: {
  muted?: boolean;
  size?: WordmarkSize;
  mono?: boolean;
}) {
  const d = dims[size];

  return (
    <div className="flex select-none items-center gap-3.5">
      <Monogram size={d.logo} />
      <div className="leading-tight">
        <div
          className={`${d.name} font-semibold tracking-tighter ${
            mono ? "uppercase tracking-[0.18em]" : ""
          } ${muted ? "text-[var(--color-pearl)]/80" : "text-[var(--color-pearl)]"}`}
          style={{ fontFamily: "var(--font-display-stack)" }}
        >
          {mono ? "FREEBORN" : "Freeborn"}
        </div>
        <div
          className={`mt-1 uppercase font-black tracking-[0.3em] ${d.tag} ${
            muted ? "text-[var(--color-ash)]" : "text-[var(--color-sand)]"
          }`}
        >
          Date like you mean it.
        </div>
      </div>
    </div>
  );
}
