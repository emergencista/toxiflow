import type { ReactNode } from "react";

type SectionCardProps = {
  eyebrow: string;
  title: string;
  description?: string;
  accent?: "slate" | "danger" | "success";
  children: ReactNode;
};

const accentStyles = {
  slate: "border-white/70 bg-white/85",
  danger: "border-rose-200 bg-rose-50/90",
  success: "border-emerald-200 bg-emerald-50/90"
};

export function SectionCard({
  eyebrow,
  title,
  description,
  accent = "slate",
  children
}: SectionCardProps) {
  return (
    <section className={`rounded-3xl border p-6 shadow-[0_18px_60px_-30px_rgba(15,23,42,0.35)] backdrop-blur ${accentStyles[accent]}`}>
      <div className="mb-5 flex flex-col gap-2">
        <span className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">{eyebrow}</span>
        <h2 className="text-xl font-semibold tracking-tight text-slate-950">{title}</h2>
        {description ? <p className="max-w-2xl text-sm leading-6 text-slate-600">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}