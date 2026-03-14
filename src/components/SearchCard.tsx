import type { Drug } from "@/lib/types";

import { SectionCard } from "@/components/SectionCard";

type SearchCardProps = {
  query: string;
  onQueryChange: (value: string) => void;
  results: Drug[];
  selectedDrug: Drug | null;
  onSelectDrug: (drug: Drug) => void;
  showResults: boolean;
};

export function SearchCard({
  query,
  onQueryChange,
  results,
  selectedDrug,
  onSelectDrug,
  showResults
}: SearchCardProps) {
  return (
    <SectionCard
      eyebrow="Substância"
      title="Busque a intoxicação suspeita"
      description="Os cartões abaixo são reutilizáveis e alimentados pelo modelo de dados normalizado, prontos para escalar com dezenas de novos fármacos."
    >
      <div className="relative">
        <input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Ex.: Ácido valproico, clonazepam, paracetamol"
          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-4 text-base text-slate-950 outline-none ring-0 transition focus:border-red-400"
        />

        {showResults ? (
          <div className="absolute left-0 right-0 top-[calc(100%+10px)] z-20 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            {results.length ? (
              results.map((drug) => (
                <button
                  key={drug.slug}
                  type="button"
                  onClick={() => onSelectDrug(drug)}
                  className="flex w-full items-center justify-between border-b border-slate-100 px-4 py-3 text-left transition hover:bg-slate-50"
                >
                  <span className="font-medium text-slate-900">{drug.name}</span>
                  <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">{drug.category}</span>
                </button>
              ))
            ) : (
              <div className="px-4 py-3 text-sm text-slate-500">Nenhuma substância encontrada.</div>
            )}
          </div>
        ) : null}
      </div>

      {selectedDrug ? (
        <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-semibold text-slate-950">{selectedDrug.name}</h3>
            <span className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-700">{selectedDrug.category}</span>
          </div>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Dose tóxica de referência:{" "}
            <span className="font-semibold text-slate-900">{selectedDrug.isDoseUnknown ? "Concentração desconhecida: guiar pela clínica" : selectedDrug.toxicDose ?? "Não informada"}</span>
            {selectedDrug.halfLife ? <span> | Meia-vida: {selectedDrug.halfLife}</span> : null}
          </p>
        </div>
      ) : null}
    </SectionCard>
  );
}