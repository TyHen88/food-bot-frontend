import { clsx } from "clsx";
import type { InputHTMLAttributes, TextareaHTMLAttributes } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  hint?: string;
}

const fieldBase =
  "w-full px-3 py-2 rounded-[var(--radius-md)] text-sm border transition-colors duration-150 " +
  "focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] focus:ring-offset-0 focus:border-transparent " +
  "disabled:opacity-50 disabled:cursor-not-allowed";

const fieldStyle = {
  background: "var(--surface)",
  color:      "var(--text)",
  border:     "1px solid var(--border)",
};

export function Input({ label, error, hint, className, ...props }: InputProps) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label className="text-xs font-medium" style={{ color: "var(--text-2)" }}>
          {label}
        </label>
      )}
      <input
        className={clsx(fieldBase, error && "border-[var(--color-danger)]", className)}
        style={fieldStyle}
        {...props}
      />
      {hint && !error && <p className="text-xs" style={{ color: "var(--text-muted)" }}>{hint}</p>}
      {error && <p className="text-xs" style={{ color: "var(--color-danger)" }}>{error}</p>}
    </div>
  );
}

export function Textarea({ label, error, hint, className, ...props }: TextareaProps) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label className="text-xs font-medium" style={{ color: "var(--text-2)" }}>
          {label}
        </label>
      )}
      <textarea
        className={clsx(fieldBase, "min-h-[80px] resize-y", error && "border-[var(--color-danger)]", className)}
        style={fieldStyle}
        {...props}
      />
      {hint && !error && <p className="text-xs" style={{ color: "var(--text-muted)" }}>{hint}</p>}
      {error && <p className="text-xs" style={{ color: "var(--color-danger)" }}>{error}</p>}
    </div>
  );
}
