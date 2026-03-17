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
  const selectedSynonyms = Array.isArray(selectedDrug?.synonyms) ? selectedDrug.synonyms : [];

  return (
    <SectionCard
      eyebrow="Busca"
      title="Buscar substância"
      description="Digite 2 letras ou mais."
    >
      <div>
        <input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Ex.: Ácido valproico, clonazepam, paracetamol"
          className="w-full rounded-2xl border border-slate-200 bg-white/95 px-4 py-3.5 text-[15px] text-slate-950 outline-none ring-0 transition placeholder:text-slate-400 focus:border-red-400 focus:shadow-[0_0_0_4px_rgba(248,113,113,0.12)] min-[390px]:py-4 min-[390px]:text-base"
        />

        {showResults ? (
          <div className="mt-2 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_22px_44px_-24px_rgba(15,23,42,0.42)]">
            {results.length ? (
              <div className="max-h-64 overflow-y-auto min-[390px]:max-h-72">
                {results.map((drug) => (
                  <button
                    key={drug.slug}
                    type="button"
                    onClick={() => onSelectDrug(drug)}
                    className="flex w-full items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 text-left transition last:border-b-0 hover:bg-slate-50 min-[390px]:py-3.5"
                  >
                    <span>
                      <span className="block text-[15px] font-medium text-slate-900 min-[390px]:text-base">{drug.name}</span>
                      {Array.isArray(drug.synonyms) && drug.synonyms.length ? <span className="mt-1 block text-xs text-slate-500">{drug.synonyms.slice(0, 2).join(" • ")}</span> : null}
                    </span>
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">{drug.category}</span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="px-4 py-3 text-sm text-slate-500">Nenhuma substância encontrada.</div>
            )}
          </div>
        ) : null}
      </div>

      {selectedDrug ? (
        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 min-[390px]:py-4">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[15px] font-semibold text-slate-950 min-[390px]:text-base">{selectedDrug.name}</h3>
            <span className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-700">{selectedDrug.category}</span>
          </div>
          {selectedSynonyms.length ? <p className="mt-2 text-xs text-slate-500">{selectedSynonyms.slice(0, 3).join(" • ")}</p> : null}
          <p className="mt-2 text-sm leading-5 text-slate-600">
            {selectedDrug.isDoseUnknown ? "Dose imprevisível: conduzir pela clínica." : `Dose tóxica: ${selectedDrug.toxicDose ?? "não informada"}.`}
            {selectedDrug.halfLife ? ` Meia-vida: ${selectedDrug.halfLife}.` : ""}
          </p>
        </div>
      ) : null}
    </SectionCard>
  );
}