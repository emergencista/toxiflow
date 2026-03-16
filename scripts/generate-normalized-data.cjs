const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const LEGACY_PATH = path.join(ROOT, "database.js");
const OUTPUT_JSON_PATH = path.join(ROOT, "src", "data", "drugs.json");
const OUTPUT_SQL_PATH = path.join(ROOT, "supabase", "seed.sql");

const CATEGORY_RULES = [
  ["Anticonvulsivantes", /valpro|carbamaz|fenit|fenobarb|primidon|topiramat|eslicar|oxcarbaz|clobazam|clonazepam/i],
  ["Benzodiazepínicos", /alprazolam|bromazepam|clobazam|clonazepam|clordiazepox|diazepam|estazolam|etizolam|flunitrazepam|flurazepam|lorazepam|lormetazepam|loprazolam|midazolam|nitrazepam|oxazepam|prazepam|temazepam|triazolam/i],
  ["Opioides", /buprenorfina|codeina|dihidrocodeina|fentanil|hidromorfona|metadona|morfina|oxicodona|pentazocina|petidina|tapentadol|tramadol/i],
  ["Antidepressivos", /amitriptilina|clomipramina|desipramina|desvenlafaxina|doxepina|duloxetina|escitalopram|fluoxetina|fluvoxamina|imipramina|lofepramina|maprotilina|nortriptilina|paroxetina|reboxetina|sertralina|trimipramina|venlafaxina|bupropiona|citalopram/i],
  ["Antipsicóticos", /clorpromazina|clorprotixeno|clozapina|haloperidol|levomepromazina|perfenazina|periciazina|pimozida|pipotiazina|promazina|quetiapina|risperidona|tioridazina/i],
  ["Anti-inflamatórios", /aas|acetilsalic|aceclofenaco|acemetacina|azapropazona|bronfenaco|carprofeno|cetoprofeno|cetorolaco|dexcetoprofeno|dexibuprofeno|diclofenaco|diflunisal|etodolaco|fenbufeno|fenoprofeno|flurbiprofeno|ibuprofeno|indometacina|lornoxicam|meloxicam|nabumetona|naproxeno|piroxicam|sulindaco|tenoxicam|tolmetino|tiaprofen/i],
  ["Antibióticos", /aciclovir|amoxicilina|ampicilina|azitromicina|ciprofloxacino|claritromicina|eritromicina|famciclovir|levofloxacino|moxifloxacino|norfloxacino|ofloxacino|telitromicina|valaciclovir/i],
  ["Anti-hipertensivos", /amilorida|amlodipina|atenolol|benazepril|betaxolol|bisoprolol|candesartana|captopril|carvedilol|celiprolol|cilazapril|clonidina|enalapril|eplerenona|eprosartana|espironolactona|felodipina|fosinopril|furosemida|hidroclorotiazida|imidapril|indapamida|irbesartana|lacidipina|lercanidipina|levobunolol|lisinopril|losartana|metildopa|metolazona|metoprolol|moexipril|nadolol|nebivolol|nicardipina|nifedipina|nimodipina|olmesartana|oxprenolol|perindopril|pindolol|propranolol|quinapril|ramipril|sotalol|telmisartana|timolol|torasemida|triamterene|valsartana|verapamil|xipamida|zofenopril/i],
  ["Hipoglicemiantes", /glibenclamida|gliclazida|glimepirida|glipizida|metformina/i],
  ["Anti-histamínicos", /bronfeniramina|ciclizina|cinarizina|ciproheptadina|clemastina|clorfeniramina|difenidramina|doxilamina|feniramina|hidroxizina|meclozina|prometazina|tripelenamina|triprolidina/i],
  ["Tóxicos diversos", /ferro|litio|nafazolina|oximetazolina|xilometazolina|paracetamol|digoxina/i]
];

const MANUAL_OVERRIDES = {
  "acido-valproico": {
    category: "Anticonvulsivantes",
    clinicalPresentation: "Depressão do SNC, hiperamonemia, hepatotoxicidade.",
    treatment: [
      "Suporte clínico e proteção de via aérea.",
      "Carvão ativado se ingestão muito recente e via aérea protegida."
    ],
    antidote: {
      name: "L-Carnitina",
      indication: "Hiperamonemia sintomática, encefalopatia ou hepatotoxicidade.",
      dose: "100 mg/kg IV em bolus (máx 6 g), seguido de 50 mg/kg IV a cada 8 h (máx 3 g)."
    },
    supportiveCare: "Monitorização neurológica, amônia, função hepática e suporte intensivo quando necessário.",
    guidelineRef: "EMCrit (IBCC) / CoreEM",
    notes: ["Toxicidade pode não ser linear com a dose ingerida."]
  },
  paracetamol: {
    category: "Analgésicos",
    clinicalPresentation: "Fase inicial pode ser assintomática; risco de hepatotoxicidade tardia.",
    treatment: [
      "Dosar nível sérico e aplicar nomograma de Rumack-Matthew quando indicado.",
      "Iniciar N-acetilcisteína conforme tempo de exposição e risco clínico."
    ],
    antidote: {
      name: "N-acetilcisteína",
      indication: "Nível acima da linha de tratamento, tempo desconhecido ou hepatotoxicidade suspeita.",
      dose: "Seguir protocolo intravenoso institucional."
    },
    supportiveCare: "Monitorar função hepática, INR, lactato e glicemia.",
    guidelineRef: "Rumack-Matthew / IBCC"
  },
  litio: {
    category: "Estabilizadores do humor",
    treatment: [
      "Suporte clínico e hidratação vigorosa.",
      "Considerar hemodiálise em toxicidade grave, neurológica ou com insuficiência renal."
    ],
    activatedCharcoal: "contraindicated",
    supportiveCare: "Monitorar litemia seriada, função renal e ECG.",
    guidelineRef: "EXTRIP / AACT"
  },
  ferro: {
    category: "Minerais",
    clinicalPresentation: "Irritação gastrointestinal importante, acidose e toxicidade sistêmica nos casos graves.",
    treatment: [
      "Carvão ativado é ineficaz.",
      "Avaliar radiografia abdominal e quelante conforme ferro sérico e quadro clínico."
    ],
    antidote: {
      name: "Desferroxamina",
      indication: "Toxicidade sistêmica, acidose, choque ou ferro sérico elevado.",
      dose: "Seguir protocolo institucional e monitorização intensiva."
    },
    activatedCharcoal: "contraindicated",
    guidelineRef: "AACT / Goldfrank"
  },
  "chumbinho-carbamato-organofosforado": {
    category: "Praguicidas",
    isDoseUnknown: true,
    alertMessage: "⚠️ Produto clandestino. Concentração imprevisível. NUNCA calcule dose por mg/kg. Guie-se pela clínica!",
    clinicalPresentation:
      "Toxidrome Colinérgica: SLUDGE/DUMBELS (Miose, Sialorreia, Broncorréia, Bradicardia, Fasciculações).",
    treatment: [
      "Suporte de VA (Cuidado: muita secreção).",
      "Descontaminação cutânea imediata se exposição dérmica.",
      "Lavagem Gástrica APENAS se via aérea protegida (IOT)."
    ],
    antidote: {
      name: "Atropina (Foco muscarínico)",
      indication: "Broncorréia (secreção pulmonar), broncoespasmo e bradicardia grave.",
      dose: "1 a 3 mg IV. DOBRAR a dose a cada 5 min (2, 4, 8, 16mg...) até ATROPINIZAÇÃO (secagem de secreções)."
    },
    activatedCharcoal: "conditional",
    lavage: "consider",
    supportiveCare: "Monitorização respiratória intensiva, secreções e sinais colinérgicos contínuos.",
    guidelineRef: "CoreEM / emDOCs"
  },
  glibenclamida: {
    category: "Hipoglicemiantes",
    clinicalPresentation: "Risco de hipoglicemia grave, recorrente e prolongada, inclusive após melhora transitória.",
    treatment: [
      "Suporte clínico com monitorização glicêmica seriada.",
      "Corrigir hipoglicemia com glicose EV e considerar octreotide para evitar rebote hipoglicêmico."
    ],
    antidote: {
      name: "Octreotide",
      indication: "Hipoglicemia recorrente/persistente por sulfonilureia, especialmente após necessidade repetida de glicose EV.",
      dose: "50 a 100 mcg SC/IV a cada 6-8 horas, ajustando conforme glicemia."
    },
    supportiveCare: "Observação prolongada e monitorização glicêmica frequente devido ao risco de recorrência.",
    guidelineRef: "AACT / toxicologia clínica"
  }
};

function normalizeAccents(value) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function slugify(value) {
  return normalizeAccents(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function inferCategory(drug) {
  const haystack = [drug.n, ...(drug.syn ?? [])].join(" ");
  const match = CATEGORY_RULES.find(([, pattern]) => pattern.test(normalizeAccents(haystack.toLowerCase())));
  return match ? match[0] : "Toxicologia clínica";
}

function isSulfonylurea(drug) {
  const haystack = normalizeAccents([drug.n, ...(drug.syn ?? [])].join(" ").toLowerCase());
  return /glibenclamida|gliclazida|glimepirida|glipizida|sulfonilureia/.test(haystack);
}

function inferClinicalPresentation(drug) {
  if (isSulfonylurea(drug)) {
    return "Risco de hipoglicemia grave, recorrente e prolongada, mesmo após aparente melhora inicial.";
  }

  if (drug.support) {
    return drug.support;
  }

  if (drug.ant?.toLowerCase().includes("naloxona")) {
    return "Depressão respiratória e rebaixamento do nível de consciência são os riscos centrais.";
  }

  if (drug.ant?.toLowerCase().includes("flumazenil")) {
    return "Predomina depressão do SNC, com risco de convulsão na reversão: flumazenil é contraindicado em uso crônico de BZD, epilepsia, coingestão pró-convulsivante, coma de origem desconhecida ou intoxicação mista.";
  }

  return null;
}

function inferTreatment(drug) {
  const treatment = ["Suporte clínico e proteção de via aérea."];

  if (drug.ca) {
    treatment.push(`Carvão ativado: ${drug.ca}.`);
  } else {
    treatment.push("Avaliar descontaminação caso a caso, conforme tempo e formulação.");
  }

  if (drug.lg && String(drug.lg).toUpperCase().includes("SIM")) {
    treatment.push("Lavagem gástrica apenas em cenários excepcionais de apresentação muito precoce.");
  }

  if (isSulfonylurea(drug)) {
    treatment.push("Hipoglicemia por sulfonilureia: iniciar glicose EV e considerar octreotide para prevenir recorrência.");
  }

  if (drug.ant?.toLowerCase().includes("flumazenil")) {
    treatment.push("Flumazenil NUNCA deve ser uso empírico em coma de origem desconhecida ou suspeita de intoxicação mista.");
  }

  return treatment;
}

function inferActivatedCharcoal(drug) {
  if (drug.noCharcoal || (drug.ca && String(drug.ca).toUpperCase().includes("NÃO"))) {
    return "contraindicated";
  }

  if (drug.ca && String(drug.ca).toUpperCase().includes("SIM")) {
    return "recommended";
  }

  return "conditional";
}

function inferLavage(drug) {
  if (drug.lg && String(drug.lg).toUpperCase().includes("SIM")) {
    return "consider";
  }

  return "not-routine";
}

function buildAntidote(drug) {
  if (isSulfonylurea(drug)) {
    return {
      name: "Octreotide",
      indication: "Hipoglicemia recorrente ou persistente após glicose EV em intoxicação por sulfonilureias.",
      dose: "Adulto: 50 a 100 mcg SC/IV a cada 6-8 h, com monitorização seriada da glicemia."
    };
  }

  if (!drug.ant) {
    return null;
  }

  return {
    name: drug.ant,
    indication: "Conforme quadro clínico, gravidade e protocolo toxicológico.",
    dose: null
  };
}

function toDrug(drug) {
  const baseSlug = slugify(drug.n);
  const override = MANUAL_OVERRIDES[baseSlug] ?? {};

  return {
    slug: baseSlug,
    name: drug.n,
    category: override.category ?? inferCategory(drug),
    synonyms: drug.syn ?? [drug.n],
    toxicDose: override.isDoseUnknown ? null : typeof drug.d === "number" && drug.unit ? `> ${drug.d} ${drug.unit}/kg` : null,
    toxicDoseValue: override.isDoseUnknown ? null : typeof drug.d === "number" ? drug.d : null,
    toxicDoseUnit: override.isDoseUnknown ? null : drug.unit ?? null,
    halfLife: drug.mv ?? null,
    isDoseUnknown: Boolean(override.isDoseUnknown ?? drug.isDoseUnknown),
    alertMessage: override.alertMessage ?? drug.alertMessage ?? null,
    clinicalPresentation: override.clinicalPresentation ?? inferClinicalPresentation(drug),
    treatment: override.treatment ?? inferTreatment(drug),
    antidote: override.antidote ?? buildAntidote(drug),
    activatedCharcoal: override.activatedCharcoal ?? inferActivatedCharcoal(drug),
    lavage: override.lavage ?? inferLavage(drug),
    supportiveCare: override.supportiveCare ?? drug.support ?? "Suporte clínico (ABCDE) e monitorização.",
    guidelineRef: override.guidelineRef ?? drug.ref ?? null,
    notes: override.notes ?? [drug.mv ? `Meia-vida informada no legado: ${drug.mv}.` : null].filter(Boolean)
  };
}

function dedupeSlugs(drugs) {
  const seen = new Map();

  return drugs.map((drug) => {
    const count = seen.get(drug.slug) ?? 0;
    seen.set(drug.slug, count + 1);

    if (count === 0) {
      return drug;
    }

    return {
      ...drug,
      slug: `${drug.slug}-${count + 1}`
    };
  });
}

function escapeSql(value) {
  return String(value).replace(/'/g, "''");
}

function toSqlLiteral(value) {
  if (value == null) {
    return "null";
  }

  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "null";
  }

  return `'${escapeSql(value)}'`;
}

function toJsonSql(value) {
  return `'${escapeSql(JSON.stringify(value))}'::jsonb`;
}

function buildSeedSql(drugs) {
  const rows = drugs
    .map(
      (drug) => `(
  ${toSqlLiteral(drug.slug)},
  ${toSqlLiteral(drug.name)},
  ${toSqlLiteral(drug.category)},
  ${toJsonSql(drug.synonyms)},
  ${toSqlLiteral(drug.toxicDose)},
  ${toSqlLiteral(drug.toxicDoseValue)},
  ${toSqlLiteral(drug.toxicDoseUnit)},
  ${toSqlLiteral(drug.halfLife)},
  ${toSqlLiteral(drug.isDoseUnknown)},
  ${toSqlLiteral(drug.alertMessage)},
  ${toSqlLiteral(drug.clinicalPresentation)},
  ${toJsonSql(drug.treatment)},
  ${drug.antidote ? toJsonSql(drug.antidote) : "null"},
  ${toSqlLiteral(drug.activatedCharcoal)},
  ${toSqlLiteral(drug.lavage)},
  ${toSqlLiteral(drug.supportiveCare)},
  ${toSqlLiteral(drug.guidelineRef)},
  ${toJsonSql(drug.notes)}
)`
    )
    .join(",\n");

  return `insert into public.drugs (
  slug,
  name,
  category,
  synonyms,
  toxic_dose_text,
  toxic_dose_value,
  toxic_dose_unit,
  half_life,
  is_dose_unknown,
  alert_message,
  clinical_presentation,
  treatment,
  antidote,
  activated_charcoal,
  lavage,
  supportive_care,
  guideline_ref,
  notes
)
values
${rows}
on conflict (slug) do update set
  name = excluded.name,
  category = excluded.category,
  synonyms = excluded.synonyms,
  toxic_dose_text = excluded.toxic_dose_text,
  toxic_dose_value = excluded.toxic_dose_value,
  toxic_dose_unit = excluded.toxic_dose_unit,
  half_life = excluded.half_life,
  is_dose_unknown = excluded.is_dose_unknown,
  alert_message = excluded.alert_message,
  clinical_presentation = excluded.clinical_presentation,
  treatment = excluded.treatment,
  antidote = excluded.antidote,
  activated_charcoal = excluded.activated_charcoal,
  lavage = excluded.lavage,
  supportive_care = excluded.supportive_care,
  guideline_ref = excluded.guideline_ref,
  notes = excluded.notes,
  updated_at = timezone('utc'::text, now());\n`;
}

function main() {
  const source = fs.readFileSync(LEGACY_PATH, "utf8");
  const match = source.match(/window\.database\s*=\s*(\[[\s\S]*?\n\s*\];)/);

  if (!match) {
    throw new Error("Legacy database array not found in database.js");
  }

  const legacyData = Function(`return ${match[1]}`)();
  const normalized = dedupeSlugs(legacyData.map(toDrug)).sort((left, right) => left.name.localeCompare(right.name, "pt-BR"));

  fs.mkdirSync(path.dirname(OUTPUT_JSON_PATH), { recursive: true });
  fs.mkdirSync(path.dirname(OUTPUT_SQL_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_JSON_PATH, `${JSON.stringify(normalized, null, 2)}\n`);
  fs.writeFileSync(OUTPUT_SQL_PATH, buildSeedSql(normalized));

  console.log(`Generated ${normalized.length} normalized drug records.`);
}

main();