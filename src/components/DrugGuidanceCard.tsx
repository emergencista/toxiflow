import type { Drug } from "@/lib/types";

import { SectionCard } from "@/components/SectionCard";
import { getCharcoalCopy, getLavageCopy } from "@/lib/drug-utils";

type DrugGuidanceCardProps = {
  drug: Drug | null;
  elapsedHours: number | null;
};

export function DrugGuidanceCard({ drug, elapsedHours }: DrugGuidanceCardProps) {
  if (!drug) {
    return null;
  }

  return (
    <SectionCard
      eyebrow="Conduta"
      title="Resumo clínico reutilizável"
      description="Os cartões de orientação consomem o mesmo modelo para qualquer nova substância vinda do Supabase."
    >
      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-4">
          {drug.alertMessage ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-4 text-red-950">
              <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-red-700">Alerta operacional</h3>
              <p className="mt-3 text-sm leading-6">{drug.alertMessage}</p>
            </div>
          ) : null}

          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
            <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">Apresentação clínica</h3>
            <p className="mt-3 text-sm leading-6 text-slate-700">
              {drug.clinicalPresentation ?? "Sem descrição detalhada no legado. Complemente este campo diretamente no Supabase conforme o protocolo local."}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
            <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">Tratamento inicial</h3>
            <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-700">
              {drug.treatment.map((item) => (
                <li key={item} className="rounded-xl bg-slate-50 px-3 py-2">
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4">
            <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-amber-800">Descontaminação</h3>
            <p className="mt-3 text-sm leading-6 text-amber-950">{getCharcoalCopy(drug.activatedCharcoal, elapsedHours)}</p>
            <p className="mt-3 text-sm leading-6 text-amber-950">{getLavageCopy(drug.lavage)}</p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
            <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">Antídoto</h3>
            {drug.antidote ? (
              <div className="mt-3 space-y-2 text-sm leading-6 text-slate-700">
                <p className="text-base font-semibold text-slate-950">{drug.antidote.name}</p>
                {drug.antidote.indication ? <p>{drug.antidote.indication}</p> : null}
                {drug.antidote.dose ? <p>{drug.antidote.dose}</p> : null}
              </div>
            ) : (
              <p className="mt-3 text-sm leading-6 text-slate-600">Sem antídoto específico descrito.</p>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
            <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">Suporte clínico</h3>
            <p className="mt-3 text-sm leading-6 text-slate-700">{drug.supportiveCare ?? "Suporte ABCDE, observação e monitorização."}</p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
            <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">Referência</h3>
            <p className="mt-3 text-sm leading-6 text-slate-700">{drug.guidelineRef ?? "Sem referência informada."}</p>
            {drug.notes.length ? (
              <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-600">
                {drug.notes.map((note) => (
                  <li key={note} className="rounded-xl bg-slate-50 px-3 py-2">
                    {note}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
      </div>
    </SectionCard>
  );
}