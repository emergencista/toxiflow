import type { Drug } from "@/lib/types";

import { SectionCard } from "@/components/SectionCard";

type DrugGuidanceCardProps = {
  drug: Drug | null;
  elapsedHours?: string | number | null;
};

export function DrugGuidanceCard({ drug }: DrugGuidanceCardProps) {
  if (!drug) {
    return null;
  }

  const treatmentItems = Array.isArray(drug.treatment) ? drug.treatment.slice(0, 4) : [];
  const notes = Array.isArray(drug.notes) ? drug.notes : [];

  return (
    <SectionCard
      eyebrow="Resumo"
      title="Resumo clínico"
      description="Só o que ajuda no plantão."
    >
      <div className="space-y-3">
        {drug.alertMessage ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3.5 text-red-950">
            <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-red-700">Alerta</h3>
            <p className="mt-2 text-sm leading-5">{drug.alertMessage}</p>
          </div>
        ) : null}

        {drug.clinicalPresentation ? (
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3.5">
            <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">Apresentação clínica</h3>
            <p className="mt-2 text-sm leading-5 text-slate-700">{drug.clinicalPresentation}</p>
          </div>
        ) : null}

        {treatmentItems.length ? (
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3.5">
            <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">Tratamento inicial</h3>
            <ul className="mt-3 space-y-2 text-sm leading-5 text-slate-700">
              {treatmentItems.map((item) => (
                <li key={item} className="rounded-xl bg-slate-50 px-3 py-2">
                  {item}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {(drug.supportiveCare || drug.antidote || drug.guidelineRef || notes.length) ? (
          <details className="group rounded-2xl border border-slate-200 bg-white px-4 py-3.5">
            <summary className="cursor-pointer list-none text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">Ver mais</summary>
            {drug.supportiveCare ? <p className="mt-3 text-sm leading-5 text-slate-700">{drug.supportiveCare}</p> : null}
            {drug.antidote ? (
              <div className="mt-3 rounded-2xl border border-blue-200 bg-blue-50 px-3 py-3">
                <p className="text-sm font-semibold text-slate-950">{drug.antidote.name}</p>
                {drug.antidote.indication ? <p className="mt-1 text-sm leading-5 text-slate-700">{drug.antidote.indication}</p> : null}
                {drug.antidote.dose ? <p className="mt-1 text-sm leading-5 text-slate-700">{drug.antidote.dose}</p> : null}
              </div>
            ) : null}
            {notes.length ? (
              <ul className="mt-3 space-y-2 text-sm leading-5 text-slate-600">
                {notes.map((note) => (
                  <li key={note} className="rounded-xl bg-slate-50 px-3 py-2">
                    {note}
                  </li>
                ))}
              </ul>
            ) : null}
            {drug.guidelineRef ? <p className="mt-3 text-xs font-medium uppercase tracking-[0.18em] text-slate-500">Fonte: {drug.guidelineRef}</p> : null}
          </details>
        ) : null}
      </div>
    </SectionCard>
  );
}