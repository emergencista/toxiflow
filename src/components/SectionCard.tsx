import type { ReactNode } from "react";

type SectionCardProps = {
  eyebrow: string;
  title: string;
  description?: string;
  accent?: "slate" | "danger" | "success";
  children: ReactNode;
};

const accentStyles = {
  slate: "border-white/80 bg-[linear-gradient(170deg,rgba(255,255,255,0.97)_0%,rgba(247,250,253,0.92)_62%,rgba(240,247,255,0.88)_100%)]",
  danger: "border-rose-200 bg-[linear-gradient(170deg,rgba(255,244,246,0.98)_0%,rgba(255,247,237,0.93)_72%,rgba(255,236,236,0.9)_100%)]",
  success: "border-emerald-200 bg-[linear-gradient(170deg,rgba(236,253,245,0.99)_0%,rgba(240,253,244,0.94)_72%,rgba(224,250,239,0.88)_100%)]"
};

export function SectionCard({
  eyebrow,
  title,
  description,
  accent = "slate",
  children
}: SectionCardProps) {
  return (
    <section className={`card-enter rounded-[1.4rem] border p-3.5 shadow-[0_24px_54px_-32px_rgba(15,23,42,0.35)] ring-1 ring-white/55 backdrop-blur-sm min-[390px]:rounded-[1.48rem] min-[390px]:p-4 min-[430px]:rounded-[1.55rem] sm:p-5 ${accentStyles[accent]}`}>
      <div className="mb-3.5 flex flex-col gap-1.5 min-[390px]:mb-4 sm:mb-5">
        <span className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-600">{eyebrow}</span>
        <h2 className="text-[1.02rem] font-semibold tracking-tight text-slate-950 min-[390px]:text-[1.06rem] min-[430px]:text-[1.1rem] sm:text-xl">{title}</h2>
        {description ? <p className="max-w-2xl text-[13px] leading-5 text-slate-700 min-[390px]:text-sm">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}