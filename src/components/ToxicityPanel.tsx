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
        description="A substância selecionada não permite estimativa confiável por mg/kg. Priorize toxidrome, secreções pulmonares, broncoespasmo e necessidade de suporte imediato."
      >
        <div className="rounded-3xl bg-red-700 px-5 py-5 text-white shadow-[0_18px_50px_-30px_rgba(127,29,29,0.85)]">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/75">Emergência toxicológica</p>
          <p className="mt-3 text-2xl font-semibold">Não calcular mg/kg</p>
          <p className="mt-3 text-sm leading-6 text-white/85">{drug.alertMessage}</p>
        </div>
      </SectionCard>
    );
  }

  if (!isReady) {
    return (
      <SectionCard
        eyebrow="Risco"
        title="Cálculo pendente"
        description="Selecione uma substância e informe peso e dose para liberar a estratificação do risco tóxico."
      >
        <p className="rounded-2xl border border-dashed border-slate-300 px-4 py-4 text-sm leading-6 text-slate-500">
          Este painel é reutilizado para qualquer substância do catálogo normalizado.
        </p>
      </SectionCard>
    );
  }

  return (
    <SectionCard
      eyebrow="Risco"
      title={isToxic ? "Alerta toxicológico" : "Abaixo do limiar estimado"}
      accent={isToxic ? "danger" : "success"}
      description={
        isToxic
          ? "Use este resultado como suporte rápido e confirme a conduta com o contexto clínico e o CIATox quando necessário."
          : "Ainda é necessário julgamento clínico, principalmente em apresentações tardias, formulações prolongadas ou pacientes vulneráveis."
      }
    >
      <div className="grid gap-4 md:grid-cols-2">
        <div className={`rounded-2xl px-4 py-5 ${isToxic ? "bg-red-700 text-white" : "bg-emerald-700 text-white"}`}>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] opacity-80">Dose ingerida</p>
          <p className="mt-2 text-3xl font-semibold">{ingestedMg?.toFixed(1)} mg</p>
        </div>
        <div className="rounded-2xl bg-slate-950 px-4 py-5 text-white">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/70">Limiar estimado</p>
          <p className="mt-2 text-3xl font-semibold">{thresholdMg?.toFixed(1)} mg</p>
        </div>
      </div>
    </SectionCard>
  );
}