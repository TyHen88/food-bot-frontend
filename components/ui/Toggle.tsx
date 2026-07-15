"use client";

interface ToggleProps {
  checked: boolean;
  onChange: (val: boolean) => void;
  disabled?: boolean;
  label?: string;
  size?: "sm" | "md";
}

export function Toggle({ checked, onChange, disabled, label, size = "md" }: ToggleProps) {
  const track = size === "sm" ? "w-8 h-4" : "w-11 h-6";
  const thumb = size === "sm" ? "w-3 h-3" : "w-5 h-5";
  const translate = size === "sm"
    ? (checked ? "translate-x-4" : "translate-x-0.5")
    : (checked ? "translate-x-5" : "translate-x-0.5");

  return (
    <label
      className="inline-flex items-center gap-2 cursor-pointer select-none"
      style={disabled ? { opacity: 0.5, cursor: "not-allowed" } : undefined}
    >
      <button
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        className={`relative inline-flex ${track} flex-shrink-0 rounded-full border-0 transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]`}
        style={{
          background: checked ? "var(--color-primary)" : "var(--surface-3)",
        }}
      >
        <span
          className={`${thumb} ${translate} inline-block rounded-full bg-white shadow-sm transition-transform duration-200 pointer-events-none`}
          style={{ marginTop: "auto", marginBottom: "auto" }}
        />
      </button>
      {label && (
        <span className="text-sm" style={{ color: "var(--text)" }}>
          {label}
        </span>
      )}
    </label>
  );
}
