"use client";

import { useDeferredValue, useState } from "react";

import { ClinicalActionsCard } from "@/components/ClinicalActionsCard";
import { DoseCalculatorCard } from "@/components/DoseCalculatorCard";
import { DrugGuidanceCard } from "@/components/DrugGuidanceCard";
import { SearchCard } from "@/components/SearchCard";
import { ToxicityPanel } from "@/components/ToxicityPanel";
import { calculateThresholdMg, convertToMg, isMatch, normalizeText } from "@/lib/drug-utils";
import type { Drug } from "@/lib/types";

type AdministrationRoute = "oral" | "parenteral";

type ToxiFlowDashboardProps = {
  drugs: Drug[];
};

export function ToxiFlowDashboard({ drugs }: ToxiFlowDashboardProps) {
  const ciatoxNumbers = [
    { label: "0800 284 4343", href: "tel:08002844343", note: "Ligação gratuita" },
    { label: "(71) 3103-4300", href: "tel:+557131034300", note: "Número direto" }
  ];
  const [query, setQuery] = useState("");
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [administrationRoute, setAdministrationRoute] = useState<AdministrationRoute>("oral");
  const [weight, setWeight] = useState("");
  const [intake, setIntake] = useState("");
  const [intakeUnit, setIntakeUnit] = useState("mg");
  const [elapsedHours, setElapsedHours] = useState("");
  const [isReferenceModalOpen, setReferenceModalOpen] = useState(false);
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
  const actionReady = Boolean(selectedDrug && (selectedDrug.isDoseUnknown ? Number.isFinite(elapsedValue) : isReady));

  function handleQueryChange(value: string) {
    setQuery(value);
    setSelectedSlug(null);
  }

  function handleSelectDrug(drug: Drug) {
    setSelectedSlug(drug.slug);
    setQuery(drug.name);
  }

  const referenceItems = [
    "AACT / EAPCCT Position Papers",
    "Goldfrank's Toxicologic Emergencies",
    "AHA Guidelines e ACLS",
    "Nomograma de Rumack-Matthew",
    "Protocolos locais do CIATox-BA"
  ];

  return (
    <>
      <div className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-4 px-3 py-3 pb-10 min-[390px]:px-4 min-[430px]:gap-5 min-[430px]:px-5 sm:py-5 md:max-w-3xl md:gap-6">
        <header className="card-enter relative overflow-hidden rounded-[1.75rem] border border-white/15 bg-[radial-gradient(circle_at_0%_0%,rgba(56,189,248,0.26),transparent_38%),radial-gradient(circle_at_96%_8%,rgba(251,113,133,0.24),transparent_34%),linear-gradient(175deg,#081127_0%,#0f172a_56%,#16253f_100%)] px-4 py-4.5 text-white shadow-[0_24px_56px_-28px_rgba(15,23,42,0.95)] min-[390px]:rounded-[1.85rem] min-[390px]:py-5 min-[430px]:px-5 sm:px-6 sm:py-6">
          <div className="absolute -right-8 -top-10 h-36 w-36 rounded-full bg-sky-300/20 blur-2xl" />
          <div className="absolute -bottom-12 -left-8 h-40 w-40 rounded-full bg-rose-300/15 blur-2xl" />
          <div className="flex items-start justify-between gap-3">
            <div>
              <span className="inline-flex items-center rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.18em] text-white/85 min-[390px]:text-[10px]">
                Triage Mode
              </span>
              <h1 className="mt-2 text-[1.42rem] font-extrabold tracking-tight min-[390px]:text-[1.56rem] min-[430px]:text-[1.66rem] md:text-[1.85rem]">ToxiFlow</h1>
              <p className="mt-1.5 text-[13px] text-white/78 min-[390px]:text-sm">Decisão toxicológica em segundos no plantão</p>
              <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.19em] text-white/85 min-[430px]:text-xs">{drugs.length} substâncias cadastradas</p>
            </div>
            <button
              type="button"
              onClick={() => setReferenceModalOpen(true)}
              className="rounded-xl border border-white/25 bg-white/10 px-2.5 py-2 text-[11px] font-semibold text-white transition hover:bg-white/20 min-[390px]:px-3 min-[390px]:text-xs"
            >
              Fontes
            </button>
          </div>
        </header>

        <div className="space-y-4 sm:space-y-5">
          <div className="transition-all duration-300 opacity-100">
            <SearchCard
              query={query}
              onQueryChange={handleQueryChange}
              results={searchResults}
              selectedDrug={selectedDrug}
              onSelectDrug={handleSelectDrug}
              showResults={showResults}
            />
          </div>

          <div className="transition-all duration-300 opacity-100">
            <DoseCalculatorCard
              selectedDrug={selectedDrug}
              administrationRoute={administrationRoute}
              weight={weight}
              intake={intake}
              intakeUnit={intakeUnit}
              elapsedHours={elapsedHours}
              onAdministrationRouteChange={setAdministrationRoute}
              onWeightChange={setWeight}
              onIntakeChange={setIntake}
              onIntakeUnitChange={setIntakeUnit}
              onElapsedHoursChange={setElapsedHours}
            />
          </div>

          <div className="transition-all duration-300 opacity-100">
            <ToxicityPanel drug={selectedDrug} isReady={isReady} isToxic={isToxic} ingestedMg={ingestedMg} thresholdMg={thresholdMg} />
          </div>

          <div className={`transition-all duration-300 ${actionReady ? "opacity-100" : "opacity-80"}`}>
            <ClinicalActionsCard
              drug={selectedDrug}
              administrationRoute={administrationRoute}
              elapsedHours={Number.isFinite(elapsedValue) ? elapsedValue : null}
              weightKg={Number.isFinite(weightValue) ? weightValue : null}
              isToxic={isToxic}
            />
          </div>

          <div className="transition-all duration-300 opacity-95">
            <DrugGuidanceCard drug={selectedDrug} elapsedHours={elapsedHours} />
          </div>

          <div className="card-enter rounded-[1.45rem] border border-white/80 bg-[linear-gradient(165deg,rgba(255,255,255,0.97)_0%,rgba(246,250,255,0.9)_100%)] px-4 py-4 shadow-[0_22px_52px_-32px_rgba(15,23,42,0.34)] min-[390px]:rounded-[1.55rem] min-[430px]:px-5 sm:px-5">
            <p className="text-center text-[11px] leading-4 text-slate-500 min-[390px]:text-xs">
              Ferramenta auxiliar. Em dúvida, escolha um número do CIATox.
            </p>
            <div className="mt-3 grid gap-2.5">
              {ciatoxNumbers.map((contact) => (
                <a
                  key={contact.href}
                  href={contact.href}
                  className={`flex w-full items-center justify-between rounded-[1.1rem] border px-4 py-3.5 text-left text-[13px] font-semibold transition min-[390px]:rounded-[1.15rem] min-[390px]:text-sm ${isToxic || selectedDrug?.isDoseUnknown ? "call-pulse call-urgent border-red-300 bg-[linear-gradient(135deg,#dc2626_0%,#ef4444_45%,#f97316_100%)] text-white shadow-[0_18px_36px_-16px_rgba(220,38,38,0.85)]" : "border-slate-700/20 bg-[linear-gradient(135deg,#0f172a_0%,#1e293b_100%)] text-white shadow-[0_14px_28px_-12px_rgba(15,23,42,0.74)] hover:brightness-110"}`}
                >
                  <span>{contact.label}</span>
                  <span className="text-[10px] font-medium uppercase tracking-[0.15em] text-white/80 min-[390px]:text-[11px]">{contact.note}</span>
                </a>
              ))}
            </div>
            <a href="https://instagram.com/biaandrade_c" target="_blank" rel="noreferrer" className="mt-3 block text-center text-xs font-semibold text-slate-600 transition hover:text-slate-900">
              @biaandrade_c
            </a>
          </div>
        </div>

        {isReferenceModalOpen ? (
          <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/75 px-4 backdrop-blur-sm" onClick={() => setReferenceModalOpen(false)}>
            <div className="w-full max-w-md rounded-[1.45rem] bg-white p-4.5 shadow-[0_30px_90px_-40px_rgba(15,23,42,0.75)] min-[390px]:rounded-[1.6rem] min-[390px]:p-5" onClick={(event) => event.stopPropagation()}>
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">Referências</p>
              <h2 className="mt-2 text-lg font-semibold text-slate-950 min-[390px]:text-xl">Fontes bibliográficas</h2>
              <p className="mt-2 text-[13px] leading-5 text-slate-600 min-[390px]:text-sm">As doses tóxicas são baseadas em consensos e textos de referência. Em caso de divergência, prevalece a orientação do CIATox local.</p>
              <ul className="mt-4 space-y-2">
                {referenceItems.map((item, index) => (
                  <li key={item} className="rounded-2xl bg-slate-50 px-3 py-3 text-sm text-slate-700">
                    <span className="mr-2 font-semibold text-red-700">{index + 1}.</span>
                    {item}
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => setReferenceModalOpen(false)}
                className="mt-4 w-full rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white"
              >
                Fechar
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </>
  );
}