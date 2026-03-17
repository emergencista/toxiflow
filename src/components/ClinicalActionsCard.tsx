"use client";

import { useMemo, useState } from "react";

import { SectionCard } from "@/components/SectionCard";
import { getCharcoalCopy, getLavageCopy } from "@/lib/drug-utils";
import type { Drug } from "@/lib/types";

type AdministrationRoute = "oral" | "parenteral";
type ModalKind = "charcoal" | "flumazenil" | "antidote" | "decontamination" | "nac" | null;

type ClinicalActionsCardProps = {
  drug: Drug | null;
  administrationRoute: AdministrationRoute;
  elapsedHours: number | null;
  weightKg: number | null;
  isToxic: boolean;
};

const charcoalChecklist = [
  "Via aérea não protegida",
  "Íleo, obstrução ou perfuração suspeita",
  "Alto risco de aspiração",
  "Cáustico, hidrocarboneto ou substância não adsorvível"
];

const flumazenilChecklist = [
  "Uso crônico de benzodiazepínico",
  "História de convulsão ou epilepsia",
  "Coingestão pró-convulsivante",
  "QRS alargado ou arritmia importante",
  "Coma de origem desconhecida ou intoxicação mista"
];

function ActionButton({
  label,
  tone,
  onClick
}: {
  label: string;
  tone: "dark" | "blue" | "red";
  onClick: () => void;
}) {
  const toneClass =
    tone === "red"
      ? "bg-[linear-gradient(135deg,#dc2626_0%,#ef4444_100%)] hover:brightness-110"
      : tone === "blue"
        ? "bg-[linear-gradient(135deg,#2563eb_0%,#0ea5e9_100%)] hover:brightness-110"
        : "bg-[linear-gradient(135deg,#1e293b_0%,#334155_100%)] hover:brightness-110";

  return (
    <button type="button" onClick={onClick} className={`w-full rounded-2xl px-4 py-3 text-[13px] font-semibold text-white shadow-[0_14px_28px_-18px_rgba(15,23,42,0.45)] transition min-[390px]:text-sm ${toneClass}`}>
      {label}
    </button>
  );
}

function ChecklistRow({
  label,
  selected,
  onToggle
}: {
  label: string;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left text-[13px] transition min-[390px]:text-sm ${
        selected ? "border-blue-400 bg-blue-50 text-slate-950" : "border-slate-200 bg-slate-50 text-slate-700"
      }`}
    >
      <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-md border ${selected ? "border-blue-500 bg-blue-500 text-white" : "border-slate-300 bg-white text-transparent"}`}>
        ✓
      </span>
      <span>{label}</span>
    </button>
  );
}

export function ClinicalActionsCard({
  drug,
  administrationRoute,
  elapsedHours,
  weightKg,
  isToxic
}: ClinicalActionsCardProps) {
  const [modalKind, setModalKind] = useState<ModalKind>(null);
  const [charcoalFlags, setCharcoalFlags] = useState<string[]>([]);
  const [flumazenilFlags, setFlumazenilFlags] = useState<string[]>([]);
  const [charcoalOpen, setCharcoalOpen] = useState(false);
  const [flumazenilOpen, setFlumazenilOpen] = useState(false);

  const isOral = administrationRoute === "oral";
  const antidoteName = drug?.antidote?.name ?? null;
  const isFlumazenil = Boolean(antidoteName && antidoteName.toLowerCase().includes("flumazenil"));
  const isNac = Boolean(antidoteName && antidoteName.toLowerCase().includes("acetilciste"));
  const canUseCharcoalChecklist = Boolean(drug && isOral && elapsedHours != null && elapsedHours <= 2 && drug.activatedCharcoal !== "contraindicated");
  const shouldConsiderLavage = Boolean(drug && isOral && isToxic && elapsedHours != null && elapsedHours <= 1 && drug.lavage === "consider");

  const condutaResumo = useMemo(() => {
    const fazerAgora: string[] = [];
    const naoFazerAgora: string[] = [];
    const pendencias: string[] = [];

    if (!drug) {
      return { fazerAgora, naoFazerAgora, pendencias };
    }

    if (canUseCharcoalChecklist) {
      if (charcoalFlags.length > 0) {
        naoFazerAgora.push("Carvão ativado enquanto houver fator de risco marcado.");
      } else if (weightKg && weightKg > 0) {
        fazerAgora.push(`Carvão ativado: 1 g/kg (dose estimada ${weightKg.toFixed(0)} g).`);
      } else {
        pendencias.push("Informar peso para calcular dose de carvão ativado (1 g/kg).");
      }
    }

    if (isFlumazenil) {
      if (flumazenilFlags.length > 0) {
        naoFazerAgora.push("Flumazenil neste cenário com contraindicação marcada.");
      } else {
        fazerAgora.push("Flumazenil pode ser considerado se houver depressão clínica relevante.");
      }
    }

    if (shouldConsiderLavage) {
      fazerAgora.push("Discutir lavagem gástrica imediata com o CIATox.");
    }

    if (isNac) {
      if (weightKg && weightKg > 0) {
        fazerAgora.push(
          `Iniciar N-acetilcisteína (21h): ${Math.round(weightKg * 150)} mg / ${Math.round(weightKg * 50)} mg / ${Math.round(weightKg * 100)} mg.`
        );
      } else {
        pendencias.push("Informar peso para calcular protocolo de N-acetilcisteína (21h).");
      }
    }

    if (drug.antidote && !isFlumazenil && !isNac) {
      fazerAgora.push(`Avaliar antídoto ${drug.antidote.name} conforme indicação clínica.`);
    }

    if (!canUseCharcoalChecklist && isOral) {
      pendencias.push(getCharcoalCopy(drug.activatedCharcoal, elapsedHours));
    }

    return { fazerAgora, naoFazerAgora, pendencias };
  }, [
    canUseCharcoalChecklist,
    charcoalFlags.length,
    drug,
    elapsedHours,
    flumazenilFlags.length,
    isFlumazenil,
    isNac,
    isOral,
    shouldConsiderLavage,
    weightKg,
  ]);

  const decisaoFinal = useMemo(() => {
    if (condutaResumo.naoFazerAgora.length > 0) {
      return {
        tone: "danger" as const,
        icon: "🚫",
        label: "Não fazer agora",
      };
    }

    if (condutaResumo.pendencias.length > 0) {
      return {
        tone: "warning" as const,
        icon: "⚠️",
        label: "Pendente: complete os dados",
      };
    }

    if (condutaResumo.fazerAgora.length > 0) {
      return {
        tone: "success" as const,
        icon: "✅",
        label: "Pode fazer agora",
      };
    }

    return {
      tone: "info" as const,
      icon: "ℹ️",
      label: "Revise os dados clínicos",
    };
  }, [condutaResumo]);

  const modalConfig = useMemo(() => {
    if (!drug || !modalKind) {
      return null;
    }

    if (modalKind === "charcoal") {
      return {
        title: "Carvão ativado",
        description: "Se houver qualquer item abaixo, reavalie antes de indicar.",
        items: charcoalChecklist,
        selected: charcoalFlags,
        onToggle: (item: string) =>
          setCharcoalFlags((current) => (current.includes(item) ? current.filter((entry) => entry !== item) : [...current, item])),
        confirmLabel: "Checar segurança",
        onConfirm: () => setModalKind(null)
      };
    }

    if (modalKind === "flumazenil") {
      return {
        title: "Flumazenil",
        description: "Se houver qualquer item abaixo, o flumazenil deve ser evitado.",
        items: flumazenilChecklist,
        selected: flumazenilFlags,
        onToggle: (item: string) =>
          setFlumazenilFlags((current) => (current.includes(item) ? current.filter((entry) => entry !== item) : [...current, item])),
        confirmLabel: "Checar segurança",
        onConfirm: () => setModalKind(null)
      };
    }

    if (modalKind === "antidote") {
      return {
        title: drug.antidote?.name ?? "Antídoto",
        description: drug.antidote?.indication ?? "Usar conforme clínica e protocolo local.",
        items: [] as string[],
        selected: [] as string[],
        onToggle: () => {},
        confirmLabel: "Fechar",
        onConfirm: () => setModalKind(null)
      };
    }

    if (modalKind === "decontamination") {
      return {
        title: shouldConsiderLavage ? "Descontaminação imediata" : "Descontaminação",
        description: shouldConsiderLavage
          ? "Discutir abordagem mais agressiva com o CIATox."
          : getLavageCopy(drug.lavage),
        items: [] as string[],
        selected: [] as string[],
        onToggle: () => {},
        confirmLabel: "Fechar",
        onConfirm: () => setModalKind(null)
      };
    }

    if (modalKind === "nac") {
      return {
        title: "N-acetilcisteína",
        description:
          weightKg && weightKg > 0
            ? `Protocolo 21 h: ataque ${Math.round(weightKg * 150)} mg, segunda etapa ${Math.round(weightKg * 50)} mg, terceira etapa ${Math.round(weightKg * 100)} mg.`
            : "Informe o peso para calcular as 3 etapas.",
        items: [] as string[],
        selected: [] as string[],
        onToggle: () => {},
        confirmLabel: "Fechar",
        onConfirm: () => setModalKind(null)
      };
    }

    return {
      title: "Resumo rápido",
      description: isOral ? getCharcoalCopy(drug.activatedCharcoal, elapsedHours) : "Via parenteral: a descontaminação digestiva não é prioridade.",
      items: [] as string[],
      selected: [] as string[],
      onToggle: () => {},
      confirmLabel: "Fechar",
      onConfirm: () => setModalKind(null)
    };
  }, [charcoalFlags, drug, elapsedHours, flumazenilFlags, isOral, modalKind, shouldConsiderLavage, weightKg]);

  if (!drug) {
    return (
      <SectionCard eyebrow="Ações" title="Condutas" description="Libera após selecionar a substância.">
        <p className="rounded-2xl border border-dashed border-slate-300 px-4 py-4 text-sm leading-5 text-slate-500">
          Selecione a substância e preencha os dados para liberar a conduta.
        </p>
      </SectionCard>
    );
  }

  return (
    <>
      <SectionCard eyebrow="Conduta" title="Ações práticas" description="Critérios de decisão exibidos imediatamente.">
        <div className="grid gap-3">
          <div
            className={`rounded-2xl border px-4 py-4 ${
              decisaoFinal.tone === "danger"
                ? "border-red-300 bg-red-50"
                : decisaoFinal.tone === "warning"
                  ? "border-amber-300 bg-amber-50"
                  : decisaoFinal.tone === "success"
                    ? "border-emerald-300 bg-emerald-50"
                    : "border-blue-300 bg-blue-50"
            } sticky top-3 z-20 shadow-[0_10px_24px_-18px_rgba(15,23,42,0.45)] md:static md:z-auto md:shadow-none`}
          >
            <div className="flex items-center gap-3">
              <span className="text-3xl">{decisaoFinal.icon}</span>
              <p
                className={`text-base font-semibold leading-6 ${
                decisaoFinal.tone === "danger"
                  ? "text-red-950"
                  : decisaoFinal.tone === "warning"
                    ? "text-amber-950"
                    : decisaoFinal.tone === "success"
                      ? "text-emerald-950"
                      : "text-blue-950"
              }`}
              >
                {decisaoFinal.label}
              </p>
            </div>
            {condutaResumo.naoFazerAgora.length > 0 ? (
              <ul className="mt-3 list-disc space-y-1 pl-5 text-[13px] leading-5 text-red-950 min-[390px]:text-sm">
                {condutaResumo.naoFazerAgora.map((item) => (
                  <li key={`dont-${item}`}>{item}</li>
                ))}
              </ul>
            ) : null}

            {condutaResumo.fazerAgora.length > 0 ? (
              <ul className="mt-3 list-disc space-y-1 pl-5 text-[13px] leading-5 text-emerald-950 min-[390px]:text-sm">
                {condutaResumo.fazerAgora.map((item) => (
                  <li key={`do-${item}`}>{item}</li>
                ))}
              </ul>
            ) : null}

            {condutaResumo.pendencias.length > 0 ? (
              <ul className="mt-3 list-disc space-y-1 pl-5 text-[13px] leading-5 text-amber-950 min-[390px]:text-sm">
                {condutaResumo.pendencias.map((item) => (
                  <li key={`pending-${item}`}>{item}</li>
                ))}
              </ul>
            ) : null}
          </div>

          {(isToxic || drug.isDoseUnknown) ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] leading-5 text-red-950 min-[390px]:text-sm">
              Caso de maior risco. Priorize suporte e CIATox.
            </div>
          ) : null}

          {canUseCharcoalChecklist ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50">
              <button
                type="button"
                onClick={() => setCharcoalOpen(!charcoalOpen)}
                className="flex w-full items-center justify-between gap-3 px-4 py-3"
              >
                <div className="flex items-center justify-between gap-3 flex-1">
                  <p className="text-left text-[13px] font-semibold text-slate-900 min-[390px]:text-sm">Detalhar critérios: Carvão ativado</p>
                  <span className={`rounded-full px-2 py-1 text-[11px] font-semibold shrink-0 ${charcoalFlags.length > 0 ? "bg-red-100 text-red-800" : "bg-emerald-100 text-emerald-800"}`}>
                    {charcoalFlags.length > 0 ? "NÃO FAZER" : "PODE FAZER"}
                  </span>
                </div>
                <span className={`text-xl transition ${charcoalOpen ? "rotate-180" : ""}`}>▼</span>
              </button>

              {charcoalOpen && (
                <div className="border-t border-slate-200 px-4 py-3">
                  <p className="text-[12px] leading-5 text-slate-600 min-[390px]:text-[13px]">Marque os itens presentes. A decisão atualiza na hora.</p>
                  <div className="mt-3 space-y-2">
                    {charcoalChecklist.map((item) => (
                      <ChecklistRow
                        key={`charcoal-${item}`}
                        label={item}
                        selected={charcoalFlags.includes(item)}
                        onToggle={() =>
                          setCharcoalFlags((current) => (current.includes(item) ? current.filter((entry) => entry !== item) : [...current, item]))
                        }
                      />
                    ))}
                  </div>

                  <div
                    className={`mt-3 rounded-xl border px-3 py-3 text-[13px] leading-5 min-[390px]:text-sm ${
                      charcoalFlags.length > 0
                        ? "border-red-200 bg-red-50 text-red-950"
                        : "border-emerald-200 bg-emerald-50 text-emerald-950"
                    }`}
                  >
                    {charcoalFlags.length > 0
                      ? "Não fazer carvão ativado neste momento."
                      : weightKg && weightKg > 0
                        ? `Pode fazer carvão ativado: 1 g/kg (${weightKg.toFixed(0)} g).`
                        : "Pode fazer carvão, mas informe peso para dose exata."}
                  </div>
                </div>
              )}
            </div>
          ) : null}

          {isFlumazenil ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50">
              <button
                type="button"
                onClick={() => setFlumazenilOpen(!flumazenilOpen)}
                className="flex w-full items-center justify-between gap-3 px-4 py-3"
              >
                <div className="flex items-center justify-between gap-3 flex-1">
                  <p className="text-left text-[13px] font-semibold text-slate-900 min-[390px]:text-sm">Detalhar critérios: Flumazenil</p>
                  <span className={`rounded-full px-2 py-1 text-[11px] font-semibold shrink-0 ${flumazenilFlags.length > 0 ? "bg-red-100 text-red-800" : "bg-emerald-100 text-emerald-800"}`}>
                    {flumazenilFlags.length > 0 ? "NÃO FAZER" : "PODE CONSIDERAR"}
                  </span>
                </div>
                <span className={`text-xl transition ${flumazenilOpen ? "rotate-180" : ""}`}>▼</span>
              </button>

              {flumazenilOpen && (
                <div className="border-t border-slate-200 px-4 py-3">
                  <p className="text-[12px] leading-5 text-slate-600 min-[390px]:text-[13px]">Marque os itens presentes para definir segurança do uso.</p>
                  <div className="mt-3 space-y-2">
                    {flumazenilChecklist.map((item) => (
                      <ChecklistRow
                        key={`flumazenil-${item}`}
                        label={item}
                        selected={flumazenilFlags.includes(item)}
                        onToggle={() =>
                          setFlumazenilFlags((current) => (current.includes(item) ? current.filter((entry) => entry !== item) : [...current, item]))
                        }
                      />
                    ))}
                  </div>

                  <div
                    className={`mt-3 rounded-xl border px-3 py-3 text-[13px] leading-5 min-[390px]:text-sm ${
                      flumazenilFlags.length > 0
                        ? "border-red-200 bg-red-50 text-red-950"
                        : "border-emerald-200 bg-emerald-50 text-emerald-950"
                    }`}
                  >
                    {flumazenilFlags.length > 0
                      ? "Não fazer: evitar flumazenil neste cenário."
                      : "Pode considerar: sem contraindicação marcada no checklist."}
                  </div>
                </div>
              )}
            </div>
          ) : null}

          <div className="grid gap-2">
            <ActionButton
              label={shouldConsiderLavage ? "Lavagem gástrica" : "Descontaminação"}
              tone={shouldConsiderLavage ? "red" : "blue"}
              onClick={() => setModalKind("decontamination")}
            />

            {drug.antidote ? (
              <ActionButton
                label={isFlumazenil ? "Detalhes do flumazenil" : isNac ? "N-acetilcisteína" : drug.antidote.name}
                tone={isFlumazenil ? "red" : "blue"}
                onClick={() => {
                  if (isFlumazenil) {
                    setModalKind("flumazenil");
                    return;
                  }

                  if (isNac) {
                    setModalKind("nac");
                    return;
                  }

                  setModalKind("antidote");
                }}
              />
            ) : null}
          </div>
        </div>
      </SectionCard>

      {modalConfig ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4 backdrop-blur-sm" onClick={() => setModalKind(null)}>
          <div className="w-full max-w-md rounded-[1.3rem] bg-white p-4 shadow-[0_24px_80px_-30px_rgba(15,23,42,0.7)] min-[390px]:rounded-[1.4rem] min-[390px]:p-5" onClick={(event) => event.stopPropagation()}>
            <h3 className="text-lg font-semibold text-slate-950 min-[390px]:text-xl">{modalConfig.title}</h3>
            <p className="mt-2 text-[13px] leading-5 text-slate-600 min-[390px]:text-sm">{modalConfig.description}</p>

            {modalKind === "antidote" && drug.antidote?.dose ? <p className="mt-3 rounded-2xl bg-slate-50 px-3 py-3 text-[13px] leading-5 text-slate-700 min-[390px]:text-sm">{drug.antidote.dose}</p> : null}
            {modalKind === "decontamination" ? (
              <div className="mt-3 space-y-2 rounded-2xl bg-slate-50 px-3 py-3 text-[13px] leading-5 text-slate-700 min-[390px]:text-sm">
                <p>Via: {isOral ? "oral" : "parenteral"}</p>
                <p>{isOral ? getCharcoalCopy(drug.activatedCharcoal, elapsedHours) : "Via parenteral: a descontaminação digestiva não é prioridade."}</p>
                {shouldConsiderLavage ? <p>Considerar porque houve ingestão relevante e muito precoce.</p> : null}
              </div>
            ) : null}

            {modalConfig.items.length ? (
              <div className="mt-4 space-y-2">
                {modalConfig.items.map((item) => (
                  <ChecklistRow
                    key={item}
                    label={item}
                    selected={modalConfig.selected.includes(item)}
                    onToggle={() => modalConfig.onToggle(item)}
                  />
                ))}
              </div>
            ) : null}

            <div className="mt-5 grid grid-cols-2 gap-3">
              <button type="button" onClick={() => setModalKind(null)} className="rounded-2xl bg-slate-200 px-4 py-3 text-[13px] font-semibold text-slate-700 min-[390px]:text-sm">
                Cancelar
              </button>
              <button type="button" onClick={modalConfig.onConfirm} className="rounded-2xl bg-blue-600 px-4 py-3 text-[13px] font-semibold text-white min-[390px]:text-sm">
                {modalConfig.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}