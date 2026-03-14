import type { Drug } from "@/lib/types";

import { SectionCard } from "@/components/SectionCard";

type DoseCalculatorCardProps = {
  selectedDrug: Drug | null;
  weight: string;
  intake: string;
  intakeUnit: string;
  elapsedHours: string;
  onWeightChange: (value: string) => void;
  onIntakeChange: (value: string) => void;
  onIntakeUnitChange: (value: string) => void;
  onElapsedHoursChange: (value: string) => void;
};

export function DoseCalculatorCard({
  selectedDrug,
  weight,
  intake,
  intakeUnit,
  elapsedHours,
  onWeightChange,
  onIntakeChange,
  onIntakeUnitChange,
  onElapsedHoursChange
}: DoseCalculatorCardProps) {
  if (selectedDrug?.isDoseUnknown) {
    return (
      <SectionCard
        eyebrow="Emergência"
        title="Dose não calculável com segurança"
        description="Para produtos clandestinos e concentrações imprevisíveis, a interface bloqueia o cálculo por mg/kg e redireciona a decisão para o quadro clínico."
        accent="danger"
      >
        <div className="rounded-3xl border border-red-300 bg-[linear-gradient(135deg,_rgba(239,68,68,0.15),_rgba(251,146,60,0.22))] px-5 py-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.4)]">
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-red-700">Alerta crítico</p>
          <p className="mt-3 text-base font-semibold leading-7 text-red-950">{selectedDrug.alertMessage}</p>
        </div>
      </SectionCard>
    );
  }

  return (
    <SectionCard
      eyebrow="Cálculo"
      title="Dose ingerida e janela de descontaminação"
      description="Padronizado em Tailwind para manter o mesmo padrão visual em novas substâncias, protocolos e níveis de gravidade."
    >
      <div className="grid gap-4 md:grid-cols-2">
        <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
          Peso (kg)
          <input
            value={weight}
            onChange={(event) => onWeightChange(event.target.value)}
            inputMode="decimal"
            placeholder="70"
            className="rounded-2xl border border-slate-200 bg-white px-4 py-4 outline-none transition focus:border-red-400"
          />
        </label>

        <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
          Tempo desde a ingestão
          <select
            value={elapsedHours}
            onChange={(event) => onElapsedHoursChange(event.target.value)}
            className="rounded-2xl border border-slate-200 bg-white px-4 py-4 outline-none transition focus:border-red-400"
          >
            <option value="">Selecione...</option>
            <option value="0.5">Até 1 hora</option>
            <option value="2">1 a 2 horas</option>
            <option value="4">Mais de 2 horas</option>
          </select>
        </label>

        <label className="md:col-span-2 flex flex-col gap-2 text-sm font-medium text-slate-700">
          Dose ingerida
          <div className="grid gap-3 sm:grid-cols-[1fr_110px]">
            <input
              value={intake}
              onChange={(event) => onIntakeChange(event.target.value)}
              inputMode="decimal"
              placeholder="2000"
              className="rounded-2xl border border-slate-200 bg-white px-4 py-4 outline-none transition focus:border-red-400"
            />
            <select
              value={intakeUnit}
              onChange={(event) => onIntakeUnitChange(event.target.value)}
              className="rounded-2xl border border-slate-200 bg-white px-4 py-4 outline-none transition focus:border-red-400"
            >
              <option value="mg">mg</option>
              <option value="g">g</option>
              <option value="mcg">mcg</option>
            </select>
          </div>
        </label>
      </div>
    </SectionCard>
  );
}