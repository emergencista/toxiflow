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
    <button type="button" onClick={onClick} className={`w-full rounded-2xl px-4 py-3 text-sm font-semibold text-white shadow-[0_14px_28px_-18px_rgba(15,23,42,0.45)] transition ${toneClass}`}>
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
      className={`flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left text-sm transition ${
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
  const [feedbackMessage, setFeedbackMessage] = useState<{ tone: "info" | "danger" | "success"; text: string } | null>(null);

  const isOral = administrationRoute === "oral";
  const antidoteName = drug?.antidote?.name ?? null;
  const isFlumazenil = Boolean(antidoteName && antidoteName.toLowerCase().includes("flumazenil"));
  const isNac = Boolean(antidoteName && antidoteName.toLowerCase().includes("acetilciste"));
  const canUseCharcoalChecklist = Boolean(drug && isOral && elapsedHours != null && elapsedHours <= 2 && drug.activatedCharcoal !== "contraindicated");
  const shouldConsiderLavage = Boolean(drug && isOral && isToxic && elapsedHours != null && elapsedHours <= 1 && drug.lavage === "consider");

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
        onConfirm: () => {
          setModalKind(null);
          setFeedbackMessage(
            charcoalFlags.length > 0
                ? { tone: "danger", text: "Carvão contraindicado enquanto houver fator de risco marcado." }
              : {
                  tone: "success",
                  text: weightKg && weightKg > 0 ? `Carvão possível. Dose: ${weightKg.toFixed(0)} g (1 g/kg).` : "Carvão possível. Informe o peso para calcular 1 g/kg."
                }
          );
        }
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
        onConfirm: () => {
          setModalKind(null);
          setFeedbackMessage(
            flumazenilFlags.length > 0
              ? { tone: "danger", text: "Flumazenil contraindicado neste cenário. Evite uso empírico e discuta com o CIATox." }
              : { tone: "success", text: "Sem contraindicação marcada. Se houver depressão respiratória grave, discutir com o CIATox." }
          );
        }
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
      <SectionCard eyebrow="Conduta" title="Ações práticas" description="Toque para ver a orientação.">
        <div className="grid gap-3">
          {(isToxic || drug.isDoseUnknown) ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-5 text-red-950">
              Caso de maior risco. Priorize suporte e CIATox.
            </div>
          ) : null}

          <div className="grid gap-2">
            <ActionButton
              label="Carvão ativado"
              tone="dark"
              onClick={() => {
                if (!canUseCharcoalChecklist) {
                  setFeedbackMessage({ tone: "info", text: isOral ? getCharcoalCopy(drug.activatedCharcoal, elapsedHours) : "Via parenteral: carvão ativado não é prioridade." });
                  return;
                }

                setModalKind("charcoal");
              }}
            />

            <ActionButton
              label={shouldConsiderLavage ? "Lavagem gástrica" : "Descontaminação"}
              tone={shouldConsiderLavage ? "red" : "blue"}
              onClick={() => setModalKind("decontamination")}
            />

            {drug.antidote ? (
              <ActionButton
                label={isFlumazenil ? "Segurança do flumazenil" : isNac ? "N-acetilcisteína" : drug.antidote.name}
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

          {feedbackMessage ? (
            <div
              className={`rounded-2xl border px-4 py-3 text-sm leading-5 ${
                feedbackMessage.tone === "danger"
                  ? "border-red-200 bg-red-50 text-red-950"
                  : feedbackMessage.tone === "success"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-950"
                    : "border-blue-200 bg-blue-50 text-blue-950"
              }`}
            >
              {feedbackMessage.text}
            </div>
          ) : null}
        </div>
      </SectionCard>

      {modalConfig ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4 backdrop-blur-sm" onClick={() => setModalKind(null)}>
          <div className="w-full max-w-md rounded-[1.4rem] bg-white p-5 shadow-[0_24px_80px_-30px_rgba(15,23,42,0.7)]" onClick={(event) => event.stopPropagation()}>
            <h3 className="text-xl font-semibold text-slate-950">{modalConfig.title}</h3>
            <p className="mt-2 text-sm leading-5 text-slate-600">{modalConfig.description}</p>

            {modalKind === "antidote" && drug.antidote?.dose ? <p className="mt-3 rounded-2xl bg-slate-50 px-3 py-3 text-sm leading-5 text-slate-700">{drug.antidote.dose}</p> : null}
            {modalKind === "decontamination" ? (
              <div className="mt-3 space-y-2 rounded-2xl bg-slate-50 px-3 py-3 text-sm leading-5 text-slate-700">
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
              <button type="button" onClick={() => setModalKind(null)} className="rounded-2xl bg-slate-200 px-4 py-3 text-sm font-semibold text-slate-700">
                Cancelar
              </button>
              <button type="button" onClick={modalConfig.onConfirm} className="rounded-2xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white">
                {modalConfig.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}