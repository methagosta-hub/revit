import type { ReactNode } from "react";

export function FormField({
  label,
  children,
  className = "",
  hint,
  error,
}: {
  label: string;
  children: ReactNode;
  className?: string;
  hint?: string;
  error?: string;
}) {
  return (
    <label className={`block min-w-0 text-xs font-bold text-slate-600 ${className}`}>
      <span>{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] font-normal text-slate-400">{hint}</span>}
      {error && <span className="mt-1 block text-[11px] font-semibold text-rose-600">{error}</span>}
    </label>
  );
}
