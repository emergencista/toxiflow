import type { Drug } from "@/lib/types";

import { SectionCard } from "@/components/SectionCard";

type AdministrationRoute = "oral" | "parenteral";

type DoseCalculatorCardProps = {
  selectedDrug: Drug | null;
  administrationRoute: AdministrationRoute;
  weight: string;
  intake: string;
  intakeUnit: string;
  elapsedHours: string;
  onAdministrationRouteChange: (value: AdministrationRoute) => void;
  onWeightChange: (value: string) => void;
  onIntakeChange: (value: string) => void;
  onIntakeUnitChange: (value: string) => void;
  onElapsedHoursChange: (value: string) => void;
};

export function DoseCalculatorCard({
  selectedDrug,
  administrationRoute,
  weight,
  intake,
  intakeUnit,
  elapsedHours,
  onAdministrationRouteChange,
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
        description="Sem cálculo por mg/kg. Decisão pela clínica."
        accent="danger"
      >
        <div className="rounded-3xl border border-red-300 bg-[linear-gradient(135deg,_rgba(239,68,68,0.15),_rgba(251,146,60,0.22))] px-5 py-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.4)]">
          <p className="text-[13px] font-semibold uppercase tracking-[0.2em] text-red-700 min-[390px]:text-sm">Alerta crítico</p>
          <p className="mt-3 text-[15px] font-semibold leading-7 text-red-950 min-[390px]:text-base">{selectedDrug.alertMessage}</p>
        </div>
      </SectionCard>
    );
  }

  return (
    <SectionCard
      eyebrow="Caso"
      title="Dados essenciais"
      description="Só o que muda conduta."
    >
      <div className="grid gap-3 min-[430px]:gap-3.5 md:grid-cols-2">
        <label className="flex flex-col gap-2 text-sm font-medium text-slate-700 md:col-span-2">
          Via de administração
          <select
            value={administrationRoute}
            onChange={(event) => onAdministrationRouteChange(event.target.value as AdministrationRoute)}
            className="rounded-2xl border border-slate-300 bg-white px-4 py-3.5 text-[15px] outline-none transition focus:border-blue-500 min-[390px]:py-4 min-[390px]:text-base"
          >
            <option value="oral">Oral (comprimido ou liquido)</option>
            <option value="parenteral">Parenteral</option>
          </select>
        </label>

        <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
          Peso (kg)
          <input
            value={weight}
            onChange={(event) => onWeightChange(event.target.value)}
            inputMode="decimal"
            placeholder="70"
            className="rounded-2xl border border-slate-300 bg-white px-4 py-3.5 text-[15px] outline-none transition focus:border-blue-500 min-[390px]:py-4 min-[390px]:text-base"
          />
        </label>

        <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
          Tempo desde a ingestão
          <select
            value={elapsedHours}
            onChange={(event) => onElapsedHoursChange(event.target.value)}
            className="rounded-2xl border border-slate-300 bg-white px-4 py-3.5 text-[15px] outline-none transition focus:border-blue-500 min-[390px]:py-4 min-[390px]:text-base"
          >
            <option value="">Selecione...</option>
            <option value="0.5">Até 1 hora</option>
            <option value="2">1 a 2 horas</option>
            <option value="4">Mais de 2 horas</option>
          </select>
        </label>

        <label className="flex flex-col gap-2 text-sm font-medium text-slate-700 md:col-span-2">
          Dose ingerida
          <div className="grid gap-2 grid-cols-[1fr_96px] sm:grid-cols-[1fr_110px]">
            <input
              value={intake}
              onChange={(event) => onIntakeChange(event.target.value)}
              inputMode="decimal"
              placeholder="2000"
              className="rounded-2xl border border-slate-300 bg-white px-4 py-3.5 text-[15px] outline-none transition focus:border-blue-500 min-[390px]:py-4 min-[390px]:text-base"
            />
            <select
              value={intakeUnit}
              onChange={(event) => onIntakeUnitChange(event.target.value)}
              className="rounded-2xl border border-slate-300 bg-white px-4 py-3.5 text-[15px] outline-none transition focus:border-blue-500 min-[390px]:py-4 min-[390px]:text-base"
            >
              <option value="mg">mg</option>
              <option value="g">g</option>
              <option value="mcg">mcg</option>
            </select>
          </div>
        </label>

        <p className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-[13px] leading-5 text-slate-600 min-[390px]:text-sm md:col-span-2">
          {selectedDrug
            ? `${selectedDrug.name}: ${administrationRoute === "oral" ? "avaliar descontaminação" : "priorizar suporte e monitorização"}.`
            : "Selecione uma substância para seguir."}
        </p>
      </div>
    </SectionCard>
  );
}