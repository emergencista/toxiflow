import { SectionCard } from "@/components/SectionCard";
import type { Drug } from "@/lib/types";

type ToxicityPanelProps = {
  drug: Drug | null;
  isReady: boolean;
  isToxic: boolean;
  ingestedMg: number | null;
  thresholdMg: number | null;
};

export function ToxicityPanel({ drug, isReady, isToxic, ingestedMg, thresholdMg }: ToxicityPanelProps) {
  if (drug?.isDoseUnknown) {
    return (
      <SectionCard
        eyebrow="Risco"
        title="Triagem guiada pela clínica"
        accent="danger"
        description="Sem estimativa confiável por mg/kg. Priorize clínica e suporte."
      >
        <div className="legacy-panel-danger rounded-[1.28rem] px-4 py-4.5 text-center text-white min-[390px]:rounded-[1.35rem] min-[390px]:px-5 min-[390px]:py-5">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white">Emergência toxicológica</p>
          <p className="mt-2 text-[1.45rem] font-semibold min-[390px]:text-2xl">Não calcular mg/kg</p>
          <p className="mt-3 text-[13px] leading-5 text-white min-[390px]:text-sm">{drug.alertMessage}</p>
        </div>
      </SectionCard>
    );
  }

  if (!isReady) {
    return (
      <SectionCard
        eyebrow="Risco"
        title="Cálculo pendente"
        description="Informe peso e dose para calcular risco."
      >
        <p className="rounded-2xl border border-dashed border-slate-300 px-4 py-4 text-sm leading-6 text-slate-500">
          Este painel será liberado após o preenchimento.
        </p>
      </SectionCard>
    );
  }

  return (
    <SectionCard
      eyebrow="Risco"
      title={isToxic ? "Risco elevado" : "Risco abaixo do limiar estimado"}
      accent={isToxic ? "danger" : "success"}
      description={
        isToxic
          ? "Confirme com a clínica e acione suporte quando necessário."
          : "Mantenha julgamento clínico, especialmente em apresentações atípicas."
      }
    >
      <div className={`rounded-[1.28rem] px-4 py-4.5 text-center text-white min-[390px]:rounded-[1.35rem] min-[390px]:px-5 min-[390px]:py-5 ${isToxic ? "legacy-panel-danger" : "legacy-panel-safe"}`}>
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white">{isToxic ? "Risco tóxico" : "Baixo risco estimado"}</p>
        <p className="mt-2 text-[1.3rem] font-semibold min-[390px]:text-[1.45rem] min-[430px]:text-[1.6rem]">{isToxic ? "Suporte e monitorização" : "Observação clínica"}</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl bg-white/10 px-4 py-3.5 backdrop-blur-sm min-[390px]:py-4">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white">Dose ingerida</p>
            <p className="mt-2 text-[1.6rem] font-semibold min-[390px]:text-[1.75rem] min-[430px]:text-3xl">{ingestedMg?.toFixed(1)} mg</p>
          </div>
          <div className="rounded-2xl bg-white/10 px-4 py-3.5 backdrop-blur-sm min-[390px]:py-4">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white">Limiar estimado</p>
            <p className="mt-2 text-[1.6rem] font-semibold min-[390px]:text-[1.75rem] min-[430px]:text-3xl">{thresholdMg?.toFixed(1)} mg</p>
          </div>
        </div>
      </div>

      {isToxic ? (
        <p className="mt-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3.5 text-sm leading-5 text-red-950">
          Acima do limiar estimado. Priorize monitorização, suporte e CIATox.
        </p>
      ) : (
        <p className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3.5 text-sm leading-5 text-emerald-950">
          Abaixo do limiar estimado. Reavalie se houver sintomas ou contexto de maior risco.
        </p>
      )}
    </SectionCard>
  );
}