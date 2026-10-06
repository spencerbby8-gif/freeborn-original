"use client";

type PasswordStrengthProps = {
  password: string;
};

type Rule = { label: string; test: (value: string) => boolean };

const rules: Rule[] = [
  { label: "8+ characters", test: (v) => v.length >= 8 },
  { label: "Uppercase letter", test: (v) => /[A-Z]/.test(v) },
  { label: "Lowercase letter", test: (v) => /[a-z]/.test(v) },
  { label: "A number", test: (v) => /[0-9]/.test(v) },
];

const levels = [
  { label: "Too weak", color: "var(--color-danger)", segments: 1 },
  { label: "Fair", color: "var(--color-warning)", segments: 2 },
  { label: "Good", color: "var(--color-gold-500)", segments: 3 },
  { label: "Strong", color: "var(--color-success)", segments: 4 },
];

export function PasswordStrength({ password }: PasswordStrengthProps) {
  if (!password) return null;

  const passed = rules.filter((rule) => rule.test(password)).length;
  const levelIndex = passed >= 4 ? 3 : passed - 1 < 0 ? 0 : passed - 1;
  const current = levels[levelIndex];

  return (
    <div className="animate-scale-in space-y-3 px-1">
      <div className="flex gap-1.5">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-1 flex-1 rounded-full transition-all duration-500 ease-out"
            style={{
              backgroundColor: i < current.segments ? current.color : "rgba(255,255,255,0.06)",
              boxShadow: i < current.segments ? `0 0 8px ${current.color}40` : "none",
            }}
          />
        ))}
      </div>
      <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider">
        <span style={{ color: current.color }}>{current.label}</span>
        <div className="flex gap-2.5">
          {rules.map((rule) => {
            const ok = rule.test(password);
            return (
              <span
                key={rule.label}
                title={rule.label}
                className={`transition-colors duration-300 ${
                  ok ? "text-[var(--color-success)]" : "text-[var(--color-ash)]"
                }`}
              >
                {ok ? "●" : "○"}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}
