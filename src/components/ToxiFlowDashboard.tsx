"use client";

import { useDeferredValue, useState } from "react";

import { DoseCalculatorCard } from "@/components/DoseCalculatorCard";
import { DrugGuidanceCard } from "@/components/DrugGuidanceCard";
import { SearchCard } from "@/components/SearchCard";
import { ToxicityPanel } from "@/components/ToxicityPanel";
import { calculateThresholdMg, convertToMg, isMatch, normalizeText } from "@/lib/drug-utils";
import type { Drug } from "@/lib/types";

type ToxiFlowDashboardProps = {
  drugs: Drug[];
};

export function ToxiFlowDashboard({ drugs }: ToxiFlowDashboardProps) {
  const [query, setQuery] = useState("");
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [weight, setWeight] = useState("");
  const [intake, setIntake] = useState("");
  const [intakeUnit, setIntakeUnit] = useState("mg");
  const [elapsedHours, setElapsedHours] = useState("");
  const deferredQuery = useDeferredValue(query);

  const selectedDrug = selectedSlug ? drugs.find((drug) => drug.slug === selectedSlug) ?? null : null;
  const searchResults = deferredQuery.trim().length >= 2 ? drugs.filter((drug) => isMatch(drug, deferredQuery)).slice(0, 24) : [];
  const showResults = deferredQuery.trim().length >= 2 && (!selectedDrug || normalizeText(selectedDrug.name) !== normalizeText(query));

  const weightValue = Number.parseFloat(weight);
  const intakeValue = Number.parseFloat(intake);
  const elapsedValue = Number.parseFloat(elapsedHours);

  const thresholdMg = selectedDrug && Number.isFinite(weightValue) ? calculateThresholdMg(selectedDrug, weightValue) : null;
  const ingestedMg = Number.isFinite(intakeValue) ? convertToMg(intakeValue, intakeUnit) : null;
  const isReady = Boolean(selectedDrug && thresholdMg != null && ingestedMg != null);
  const isToxic = Boolean(isReady && ingestedMg != null && thresholdMg != null && ingestedMg >= thresholdMg);

  function handleQueryChange(value: string) {
    setQuery(value);
    setSelectedSlug(null);
  }

  function handleSelectDrug(drug: Drug) {
    setSelectedSlug(drug.slug);
    setQuery(drug.name);
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-8 px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
      <header className="overflow-hidden rounded-[2rem] border border-white/40 bg-[radial-gradient(circle_at_top_left,_rgba(248,113,113,0.35),_transparent_32%),linear-gradient(135deg,_rgba(15,23,42,0.98),_rgba(127,29,29,0.95))] px-6 py-8 text-white shadow-[0_30px_80px_-35px_rgba(127,29,29,0.9)] sm:px-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.34em] text-white/70">CIATox-BA • Decision Support</p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">ToxiFlow em Next.js com catálogo escalável</h1>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-white/78 sm:text-base">
              Dados normalizados, componentes reutilizáveis e leitura em Supabase para que novos protocolos possam ser publicados sem mexer no frontend.
            </p>
          </div>
          <div className="grid gap-3 text-sm text-white/85 sm:grid-cols-3 lg:min-w-[420px]">
            <div className="rounded-2xl border border-white/15 bg-white/10 px-4 py-4 backdrop-blur">
              <p className="text-xs uppercase tracking-[0.24em] text-white/65">Substâncias</p>
              <p className="mt-2 text-2xl font-semibold text-white">{drugs.length}</p>
            </div>
            <div className="rounded-2xl border border-white/15 bg-white/10 px-4 py-4 backdrop-blur">
              <p className="text-xs uppercase tracking-[0.24em] text-white/65">Origem</p>
              <p className="mt-2 text-lg font-semibold text-white">Supabase-first</p>
            </div>
            <div className="rounded-2xl border border-white/15 bg-white/10 px-4 py-4 backdrop-blur">
              <p className="text-xs uppercase tracking-[0.24em] text-white/65">Design system</p>
              <p className="mt-2 text-lg font-semibold text-white">Tailwind</p>
            </div>
          </div>
        </div>
      </header>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-6">
          <SearchCard
            query={query}
            onQueryChange={handleQueryChange}
            results={searchResults}
            selectedDrug={selectedDrug}
            onSelectDrug={handleSelectDrug}
            showResults={showResults}
          />

          <DoseCalculatorCard
            selectedDrug={selectedDrug}
            weight={weight}
            intake={intake}
            intakeUnit={intakeUnit}
            elapsedHours={elapsedHours}
            onWeightChange={setWeight}
            onIntakeChange={setIntake}
            onIntakeUnitChange={setIntakeUnit}
            onElapsedHoursChange={setElapsedHours}
          />
        </div>

        <div className="space-y-6">
          <ToxicityPanel drug={selectedDrug} isReady={isReady} isToxic={isToxic} ingestedMg={ingestedMg} thresholdMg={thresholdMg} />
          <DrugGuidanceCard drug={selectedDrug} elapsedHours={Number.isFinite(elapsedValue) ? elapsedValue : null} />
        </div>
      </div>

      <footer className="rounded-[2rem] border border-slate-200 bg-white/80 px-6 py-5 text-sm leading-6 text-slate-600 shadow-[0_18px_40px_-35px_rgba(15,23,42,0.45)]">
        Ferramenta de apoio à decisão. Não substitui avaliação clínica, dados laboratoriais, formulações especiais ou contato com o CIATox em cenários graves.
      </footer>
    </div>
  );
}