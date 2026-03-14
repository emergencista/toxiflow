"use client";

import { startTransition, useMemo, useState } from "react";

import type { Drug, DrugDraft } from "@/lib/types";

type AdminPanelProps = {
  initialDrugs: Drug[];
  isConfigured: boolean;
};

const emptyDraft: DrugDraft = {
  name: "",
  category: "",
  synonyms: [],
  toxicDose: null,
  toxicDoseValue: null,
  toxicDoseUnit: "mg",
  halfLife: null,
  isDoseUnknown: false,
  alertMessage: null,
  clinicalPresentation: null,
  treatment: [],
  antidote: null,
  activatedCharcoal: "conditional",
  lavage: "not-routine",
  supportiveCare: null,
  guidelineRef: null,
  notes: []
};

function draftFromDrug(drug: Drug): DrugDraft {
  return {
    name: drug.name,
    category: drug.category,
    synonyms: drug.synonyms,
    toxicDose: drug.toxicDose,
    toxicDoseValue: drug.toxicDoseValue,
    toxicDoseUnit: drug.toxicDoseUnit,
    halfLife: drug.halfLife,
    isDoseUnknown: drug.isDoseUnknown,
    alertMessage: drug.alertMessage,
    clinicalPresentation: drug.clinicalPresentation,
    treatment: drug.treatment,
    antidote: drug.antidote,
    activatedCharcoal: drug.activatedCharcoal,
    lavage: drug.lavage,
    supportiveCare: drug.supportiveCare,
    guidelineRef: drug.guidelineRef,
    notes: drug.notes
  };
}

export function AdminPanel({ initialDrugs, isConfigured }: AdminPanelProps) {
  const [drugs, setDrugs] = useState(initialDrugs);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [adminToken, setAdminToken] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [query, setQuery] = useState("");
  const [form, setForm] = useState({
    ...emptyDraft,
    synonymsText: "",
    treatmentText: "",
    notesText: "",
    antidoteName: "",
    antidoteIndication: "",
    antidoteDose: ""
  });

  const filteredDrugs = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) {
      return drugs;
    }

    return drugs.filter((drug) => [drug.name, drug.category, ...drug.synonyms].join(" ").toLowerCase().includes(term));
  }, [drugs, query]);

  function resetForm() {
    setSelectedSlug(null);
    setForm({
      ...emptyDraft,
      synonymsText: "",
      treatmentText: "",
      notesText: "",
      antidoteName: "",
      antidoteIndication: "",
      antidoteDose: ""
    });
  }

  function selectDrug(drug: Drug) {
    setSelectedSlug(drug.slug);
    const draft = draftFromDrug(drug);
    setForm({
      ...draft,
      synonymsText: draft.synonyms.join(", "),
      treatmentText: draft.treatment.join("\n"),
      notesText: draft.notes.join("\n"),
      antidoteName: draft.antidote?.name ?? "",
      antidoteIndication: draft.antidote?.indication ?? "",
      antidoteDose: draft.antidote?.dose ?? ""
    });
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback(null);
    setIsSaving(true);

    const payload = {
      name: form.name,
      category: form.category,
      synonyms: form.synonymsText,
      toxicDose: form.isDoseUnknown ? null : form.toxicDose,
      toxicDoseValue: form.isDoseUnknown ? null : form.toxicDoseValue,
      toxicDoseUnit: form.isDoseUnknown ? null : form.toxicDoseUnit,
      halfLife: form.halfLife,
      isDoseUnknown: form.isDoseUnknown,
      alertMessage: form.alertMessage,
      clinicalPresentation: form.clinicalPresentation,
      treatment: form.treatmentText,
      antidote: form.antidoteName
        ? {
            name: form.antidoteName,
            indication: form.antidoteIndication,
            dose: form.antidoteDose
          }
        : null,
      activatedCharcoal: form.activatedCharcoal,
      lavage: form.lavage,
      supportiveCare: form.supportiveCare,
      guidelineRef: form.guidelineRef,
      notes: form.notesText
    };

    const endpoint = selectedSlug ? `/api/admin/drugs/${selectedSlug}` : "/api/admin/drugs";
    const method = selectedSlug ? "PUT" : "POST";

    try {
      const response = await fetch(endpoint, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`
        },
        body: JSON.stringify(payload)
      });

      const result = (await response.json()) as { drug?: Drug; error?: string };

      if (!response.ok || !result.drug) {
        throw new Error(result.error ?? "Falha ao salvar substância.");
      }

      startTransition(() => {
        setDrugs((current) => {
          const withoutOld = selectedSlug ? current.filter((drug) => drug.slug !== selectedSlug) : current;
          return [...withoutOld, result.drug as Drug].sort((left, right) => left.name.localeCompare(right.name, "pt-BR"));
        });
      });
      setFeedback(selectedSlug ? "Substância atualizada com sucesso." : "Substância cadastrada com sucesso.");
      selectDrug(result.drug);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Falha inesperada ao salvar.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete() {
    if (!selectedSlug) {
      return;
    }

    setFeedback(null);
    setIsSaving(true);

    try {
      const response = await fetch(`/api/admin/drugs/${selectedSlug}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${adminToken}`
        }
      });

      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(result.error ?? "Falha ao excluir substância.");
      }

      startTransition(() => {
        setDrugs((current) => current.filter((drug) => drug.slug !== selectedSlug));
      });
      setFeedback("Substância removida.");
      resetForm();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Falha inesperada ao excluir.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
      <section className="rounded-[2rem] border border-white/70 bg-white/85 p-6 shadow-[0_18px_60px_-30px_rgba(15,23,42,0.35)] backdrop-blur">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Painel CIATox-BA</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">Cadastro e edição de substâncias</h1>
          </div>
          <button type="button" onClick={resetForm} className="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-950 hover:text-slate-950">
            Nova substância
          </button>
        </div>

        <div className="mt-6 space-y-4">
          {!isConfigured ? (
            <div className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-4 text-sm leading-6 text-amber-950">
              O painel está pronto, mas os writes dependem de `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` e `TOXIFLOW_ADMIN_TOKEN` em `.env.local`.
            </div>
          ) : null}

          <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
            Token administrativo
            <input value={adminToken} onChange={(event) => setAdminToken(event.target.value)} type="password" className="rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-red-400" />
          </label>

          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
                Nome
                <input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-red-400" />
              </label>
              <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
                Categoria
                <input value={form.category} onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-red-400" />
              </label>
            </div>

            <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm font-medium text-slate-800">
              <input type="checkbox" checked={form.isDoseUnknown} onChange={(event) => setForm((current) => ({ ...current, isDoseUnknown: event.target.checked }))} className="size-4" />
              Substância de concentração desconhecida: bloquear cálculo por mg/kg
            </label>

            <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
              Sinônimos
              <input value={form.synonymsText} onChange={(event) => setForm((current) => ({ ...current, synonymsText: event.target.value }))} placeholder="Separados por vírgula" className="rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-red-400" />
            </label>

            {form.isDoseUnknown ? (
              <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
                Mensagem de alerta
                <textarea value={form.alertMessage ?? ""} onChange={(event) => setForm((current) => ({ ...current, alertMessage: event.target.value }))} rows={4} className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 outline-none transition focus:border-red-500" />
              </label>
            ) : (
              <div className="grid gap-4 md:grid-cols-[1fr_160px_160px]">
                <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
                  Dose tóxica textual
                  <input value={form.toxicDose ?? ""} onChange={(event) => setForm((current) => ({ ...current, toxicDose: event.target.value }))} placeholder="> 200 mg/kg" className="rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-red-400" />
                </label>
                <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
                  Valor numérico
                  <input value={form.toxicDoseValue ?? ""} onChange={(event) => setForm((current) => ({ ...current, toxicDoseValue: event.target.value === "" ? null : Number(event.target.value) }))} inputMode="decimal" className="rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-red-400" />
                </label>
                <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
                  Unidade
                  <select value={form.toxicDoseUnit ?? "mg"} onChange={(event) => setForm((current) => ({ ...current, toxicDoseUnit: event.target.value }))} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-red-400">
                    <option value="mg">mg</option>
                    <option value="g">g</option>
                    <option value="mcg">mcg</option>
                  </select>
                </label>
              </div>
            )}

            <div className="grid gap-4 md:grid-cols-2">
              <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
                Meia-vida
                <input value={form.halfLife ?? ""} onChange={(event) => setForm((current) => ({ ...current, halfLife: event.target.value }))} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-red-400" />
              </label>
              <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
                Referência
                <input value={form.guidelineRef ?? ""} onChange={(event) => setForm((current) => ({ ...current, guidelineRef: event.target.value }))} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-red-400" />
              </label>
            </div>

            <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
              Apresentação clínica
              <textarea value={form.clinicalPresentation ?? ""} onChange={(event) => setForm((current) => ({ ...current, clinicalPresentation: event.target.value }))} rows={4} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-red-400" />
            </label>

            <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
              Tratamento inicial
              <textarea value={form.treatmentText} onChange={(event) => setForm((current) => ({ ...current, treatmentText: event.target.value }))} rows={5} placeholder="Uma orientação por linha" className="rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-red-400" />
            </label>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
                Carvão ativado
                <select value={form.activatedCharcoal} onChange={(event) => setForm((current) => ({ ...current, activatedCharcoal: event.target.value as DrugDraft["activatedCharcoal"] }))} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-red-400">
                  <option value="recommended">Recomendado</option>
                  <option value="conditional">Condicional</option>
                  <option value="contraindicated">Contraindicado</option>
                </select>
              </label>
              <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
                Lavagem gástrica
                <select value={form.lavage} onChange={(event) => setForm((current) => ({ ...current, lavage: event.target.value as DrugDraft["lavage"] }))} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-red-400">
                  <option value="not-routine">Não rotineira</option>
                  <option value="consider">Considerar</option>
                  <option value="contraindicated">Contraindicada</option>
                </select>
              </label>
            </div>

            <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
              Suporte clínico
              <textarea value={form.supportiveCare ?? ""} onChange={(event) => setForm((current) => ({ ...current, supportiveCare: event.target.value }))} rows={3} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-red-400" />
            </label>

            <div className="grid gap-4 md:grid-cols-3">
              <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
                Antídoto
                <input value={form.antidoteName} onChange={(event) => setForm((current) => ({ ...current, antidoteName: event.target.value }))} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-red-400" />
              </label>
              <label className="flex flex-col gap-2 text-sm font-medium text-slate-700 md:col-span-2">
                Indicação do antídoto
                <input value={form.antidoteIndication} onChange={(event) => setForm((current) => ({ ...current, antidoteIndication: event.target.value }))} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-red-400" />
              </label>
            </div>

            <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
              Dose do antídoto
              <textarea value={form.antidoteDose} onChange={(event) => setForm((current) => ({ ...current, antidoteDose: event.target.value }))} rows={3} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-red-400" />
            </label>

            <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
              Notas adicionais
              <textarea value={form.notesText} onChange={(event) => setForm((current) => ({ ...current, notesText: event.target.value }))} rows={4} placeholder="Uma nota por linha" className="rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-red-400" />
            </label>

            <div className="flex flex-wrap items-center gap-3">
              <button disabled={isSaving || !isConfigured} type="submit" className="rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-slate-300">
                {isSaving ? "Salvando..." : selectedSlug ? "Atualizar substância" : "Cadastrar substância"}
              </button>
              {selectedSlug ? (
                <button disabled={isSaving || !isConfigured} type="button" onClick={handleDelete} className="rounded-full border border-red-300 px-5 py-3 text-sm font-semibold text-red-700 transition hover:border-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-300">
                  Excluir
                </button>
              ) : null}
            </div>

            {feedback ? <p className="text-sm leading-6 text-slate-700">{feedback}</p> : null}
          </form>
        </div>
      </section>

      <section className="rounded-[2rem] border border-white/70 bg-white/85 p-6 shadow-[0_18px_60px_-30px_rgba(15,23,42,0.35)] backdrop-blur">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Catálogo</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">Substâncias cadastradas</h2>
          </div>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por nome, categoria ou sinônimo" className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-red-400" />
        </div>

        <div className="mt-6 max-h-[72vh] space-y-3 overflow-y-auto pr-1">
          {filteredDrugs.map((drug) => (
            <button key={drug.slug} type="button" onClick={() => selectDrug(drug)} className={`w-full rounded-3xl border px-4 py-4 text-left transition ${selectedSlug === drug.slug ? "border-red-300 bg-red-50" : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"}`}>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base font-semibold text-slate-950">{drug.name}</h3>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">{drug.category}</span>
                {drug.isDoseUnknown ? <span className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-700">Dose desconhecida</span> : null}
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-600">{drug.isDoseUnknown ? drug.alertMessage : drug.toxicDose ?? "Sem dose tóxica informada"}</p>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}