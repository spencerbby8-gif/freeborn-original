import { CheckIcon, CloseIcon } from "@/components/icons";

type AuthNoticeProps = {
  title: string;
  body: string;
  tone: "success" | "error";
};

export function AuthNotice({ title, body, tone }: AuthNoticeProps) {
  const success = tone === "success";
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      aria-live="polite"
      className={`relative overflow-hidden rounded-[24px] border p-5 ${
        success
          ? "border-[rgba(109,211,176,0.2)] bg-[rgba(109,211,176,0.05)]"
          : "border-[rgba(255,107,122,0.2)] bg-[rgba(255,107,122,0.05)]"
      }`}
    >
      <div className="flex items-start gap-4">
        <span
          className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${
            success
              ? "bg-[rgba(109,211,176,0.15)] text-[var(--color-success)]"
              : "bg-[rgba(255,107,122,0.15)] text-[var(--color-danger)]"
          }`}
        >
          {success ? <CheckIcon size={18} /> : <CloseIcon size={18} />}
        </span>
        <div className="min-w-0">
          <p className="text-[15px] font-bold text-[var(--color-pearl)]">{title}</p>
          <p className="mt-1 text-[14px] font-medium leading-relaxed text-[var(--color-mist)]">{body}</p>
        </div>
      </div>
    </div>
  );
}
