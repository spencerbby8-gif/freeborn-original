import { BrandMark } from "@/components/brand-mark";
export type WordmarkSize = "sm" | "md" | "lg";
export function Monogram({size=42}:{size?:number}){return <BrandMark size={size}/>;}

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
          style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontWeight: 400 }}
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
