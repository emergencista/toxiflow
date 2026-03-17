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

function mergeSynonyms(drug, override) {
  const values = [...(drug.syn ?? []), ...(override.synonyms ?? [])].filter((entry) => typeof entry === "string");
  const deduped = [];
  const seen = new Set();

  for (const entry of values) {
    const trimmed = entry.trim();
    if (!trimmed) {
      continue;
    }

    const key = normalizeAccents(trimmed.toLowerCase());
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(trimmed);
  }

  return deduped.length ? deduped : [drug.n];
}

const MANUAL_OVERRIDES = {
  aas: {
    category: "Salicilatos",
    synonyms: ["Salicilato", "Salicilatos", "Aspirina"],
    alertMessage: "Intubação em salicilismo grave pode piorar rapidamente a acidemia se a hiperventilação não for mantida.",
    clinicalPresentation: "Tinnitus, taquipneia, vômitos, hipertermia, alteração do sensório e distúrbio ácido-base misto (alcalose respiratória + acidose metabólica).",
    treatment: [
      "Dosar salicilato seriado, gasometria, glicemia, eletrólitos e função renal; tratar pela clínica e tendência do nível sérico.",
      "Iniciar alcalinização sérica/urinária com bicarbonato de sódio em intoxicação moderada a grave, mantendo potássio corrigido.",
      "Indicar hemodiálise se edema pulmonar, insuficiência renal, acidemia importante, alteração neurológica, piora clínica ou níveis muito elevados."
    ],
    antidote: {
      name: "Bicarbonato de sódio",
      indication: "Salicilismo sintomático, acidemia, níveis elevados ou necessidade de alcalinização urinária.",
      dose: "Bolus inicial conforme protocolo local, seguido de infusão para manter pH sérico/urinário em faixa alvo e potássio adequado."
    },
    supportiveCare: "Evitar acidemia, corrigir hipoglicemia mesmo com glicemia normal-baixa e considerar diálise precocemente nos casos graves.",
    guidelineRef: "AACT / EXTRIP / Goldfrank",
    notes: [
      "Carvão ativado pode ser útil mesmo após 1 h em apresentações maciças ou formulações entéricas.",
      "Nível sérico isolado não exclui gravidade, especialmente em intoxicação crônica."
    ]
  },
  "acido-valproico": {
    category: "Anticonvulsivantes",
    synonyms: ["Valproato", "Valproato de sódio", "Depakene", "Anticonvulsivante"],
    clinicalPresentation: "Depressão do SNC, hiperamonemia, acidose metabólica, hepatotoxicidade e edema cerebral nos casos graves.",
    treatment: [
      "Suporte clínico e proteção de via aérea.",
      "Carvão ativado se ingestão recente e considerar doses múltiplas se formulação de liberação prolongada ou grande carga corporal.",
      "Considerar terapia extracorpórea em coma, choque, acidose grave, edema cerebral ou concentrações muito elevadas."
    ],
    antidote: {
      name: "L-Carnitina",
      indication: "Hiperamonemia sintomática, encefalopatia ou hepatotoxicidade.",
      dose: "100 mg/kg IV em bolus (máx 6 g), seguido de 50 mg/kg IV a cada 8 h (máx 3 g)."
    },
    supportiveCare: "Monitorização neurológica, amônia, enzimas hepáticas, lactato e suporte intensivo quando necessário.",
    guidelineRef: "EMCrit (IBCC) / CoreEM / EXTRIP",
    notes: [
      "Toxicidade não é linear com a dose ingerida.",
      "Formulações XR podem cursar com pico tardio e deterioração após observação inicial."
    ]
  },
  carbamazepina: {
    category: "Anticonvulsivantes",
    synonyms: ["Anticonvulsivante", "Tegretol"],
    alertMessage: "QRS alargado, coma e convulsões são marcadores de gravidade em intoxicação por carbamazepina.",
    clinicalPresentation: "Nistagmo, ataxia, rebaixamento do nível de consciência, convulsões, hipotensão e alargamento de QRS por bloqueio de canal de sódio.",
    treatment: [
      "Monitorizar ECG seriado e nível de consciência; considerar múltiplas doses de carvão ativado se apresentação grave e sem íleo.",
      "Administrar bicarbonato de sódio se houver alargamento de QRS, instabilidade ventricular ou hipotensão com padrão de bloqueio de canal de sódio.",
      "Discutir terapia extracorpórea em intoxicação grave refratária, coma profundo ou instabilidade hemodinâmica persistente."
    ],
    antidote: {
      name: "Bicarbonato de sódio",
      indication: "QRS alargado, arritmias ventriculares, choque ou bloqueio de canal de sódio clinicamente relevante.",
      dose: "Bolus IV repetidos conforme ECG e pH, seguindo protocolo institucional."
    },
    supportiveCare: "Observação prolongada, vigilância para recorrência e suporte intensivo se houver depressão do SNC ou instabilidade.",
    guidelineRef: "AACT / EXTRIP / Goldfrank",
    notes: ["Absorção pode ser tardia, principalmente em formulações XR."]
  },
  oxcarbazepina: {
    category: "Anticonvulsivantes",
    synonyms: ["Anticonvulsivante", "Trileptal"],
    clinicalPresentation: "Sonolência, tontura, vômitos, ataxia e, nos casos graves, convulsões, coma e hiponatremia.",
    treatment: [
      "Suporte clínico, monitorização neurológica e ECG; dosar sódio sérico e repetir se houver deterioração clínica.",
      "Carvão ativado se apresentação precoce e via aérea protegida.",
      "Corrigir hiponatremia sintomática conforme gravidade e evitar correção excessivamente rápida."
    ],
    supportiveCare: "Observar evolução do estado mental e eletrólitos por risco de hiponatremia tardia.",
    guidelineRef: "Goldfrank / toxicologia clínica",
    notes: ["Em geral é menos cardiotóxica que a carbamazepina, mas pode cursar com hiponatremia relevante."]
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
    synonyms: ["Lítio", "Carbolitium", "Estabilizador do humor"],
    clinicalPresentation: "Tremor grosseiro, ataxia, confusão, delirium, convulsões, nefrotoxicidade e sintomas gastrointestinais, sobretudo na intoxicação aguda.",
    treatment: [
      "Suporte clínico e hidratação vigorosa com cristalóide, monitorando diurese e função renal.",
      "Carvão ativado é ineficaz; considerar irrigação intestinal em ingestões maciças de formulação de liberação prolongada.",
      "Considerar hemodiálise em toxicidade grave, sinais neurológicos relevantes, disfunção renal ou níveis séricos persistentes/elevados."
    ],
    activatedCharcoal: "contraindicated",
    supportiveCare: "Monitorar litemia seriada, função renal, eletrólitos e ECG; a evolução clínica pesa mais que um valor isolado.",
    guidelineRef: "EXTRIP / AACT",
    notes: ["Pacientes em uso crônico podem ser graves com níveis relativamente menores."]
  },
  "carbonato-litio": {
    category: "Estabilizadores do humor",
    synonyms: ["Lítio", "Carbonato de lítio", "Carbolitium", "Estabilizador do humor"],
    clinicalPresentation: "Tremor grosseiro, ataxia, confusão, delirium, convulsões, nefrotoxicidade e sintomas gastrointestinais, sobretudo na intoxicação aguda.",
    treatment: [
      "Suporte clínico e hidratação vigorosa com cristalóide, monitorando diurese e função renal.",
      "Carvão ativado é ineficaz; considerar irrigação intestinal em ingestões maciças de formulação de liberação prolongada.",
      "Considerar hemodiálise em toxicidade grave, sinais neurológicos relevantes, disfunção renal ou níveis séricos persistentes/elevados."
    ],
    activatedCharcoal: "contraindicated",
    supportiveCare: "Monitorar litemia seriada, função renal, eletrólitos e ECG; a evolução clínica pesa mais que um valor isolado.",
    guidelineRef: "EXTRIP / AACT",
    notes: ["Pacientes em uso crônico podem ser graves com níveis relativamente menores."]
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
  },
  amitriptilina: {
    category: "Antidepressivos tricíclicos",
    synonyms: ["Antidepressivo tricíclico", "ATC", "Tricíclico"],
    alertMessage: "QRS > 100 ms sugere maior risco de convulsão; QRS > 160 ms aumenta risco de arritmia ventricular.",
    clinicalPresentation: "Síndrome anticolinérgica, rebaixamento do sensório, convulsões, hipotensão e alargamento de QRS por bloqueio de canal de sódio.",
    treatment: [
      "ECG seriado, monitorização intensiva e proteção precoce de via aérea nos casos com rebaixamento importante.",
      "Bicarbonato de sódio para QRS alargado, arritmia ventricular ou hipotensão; repetir conforme resposta clínica/ECG.",
      "Benzodiazepínico para convulsões e vasopressor se choque persistente após ressuscitação inicial."
    ],
    antidote: {
      name: "Bicarbonato de sódio",
      indication: "QRS alargado, arritmia ventricular, hipotensão ou convulsão em intoxicação por tricíclico.",
      dose: "Bolus IV repetidos até estreitamento do QRS e melhora hemodinâmica, conforme protocolo institucional."
    },
    supportiveCare: "Observação em monitor, corrigindo acidemia, hipoxemia e hipotensão agressivamente.",
    guidelineRef: "AACT / EMCrit (TCA) / Goldfrank",
    notes: ["Evitar antiarrítmicos classe IA e IC."]
  },
  nortriptilina: {
    category: "Antidepressivos tricíclicos",
    synonyms: ["Antidepressivo tricíclico", "ATC", "Tricíclico", "Pamelor"],
    alertMessage: "Alterações de ECG e hipotensão definem gravidade em tricíclicos, mesmo antes de grandes alterações laboratoriais.",
    clinicalPresentation: "Síndrome anticolinérgica, sonolência, convulsões, hipotensão e cardiotoxicidade por bloqueio de canal de sódio.",
    treatment: [
      "ECG seriado e monitorização intensiva nas primeiras horas.",
      "Bicarbonato de sódio para QRS alargado, arritmia ventricular ou instabilidade hemodinâmica.",
      "Benzodiazepínico para convulsões e vasopressor se necessário após correção de acidemia e volume."
    ],
    antidote: {
      name: "Bicarbonato de sódio",
      indication: "QRS alargado, arritmia ventricular, choque ou convulsões em intoxicação por tricíclico.",
      dose: "Bolus IV repetidos guiados por ECG e resposta hemodinâmica."
    },
    supportiveCare: "Monitorização contínua até normalização do ECG e estabilização clínica.",
    guidelineRef: "AACT / Goldfrank",
    notes: ["Embora menos anticolinérgica que a amitriptilina, a cardiotoxicidade continua sendo a prioridade." ]
  },
  clonazepam: {
    category: "Benzodiazepínicos",
    synonyms: ["Benzodiazepínico", "BZD", "Rivotril"],
    clinicalPresentation: "Sonolência, disartria, ataxia e, em coingestões, depressão respiratória e coma.",
    treatment: [
      "Suporte clínico e vigilância respiratória; intoxicação isolada costuma evoluir melhor que coingestões.",
      "Carvão ativado apenas se ingestão muito precoce e via aérea protegida.",
      "Flumazenil apenas em cenários muito selecionados, nunca de rotina em coma de causa incerta ou intoxicação mista."
    ],
    antidote: {
      name: "Flumazenil",
      indication: "Iatrogenia por benzodiazepínico ou paciente sabidamente não dependente, sem risco convulsivante e com depressão clínica relevante.",
      dose: "0,2 mg IV em doses tituladas, seguindo protocolo local e com monitorização contínua."
    },
    supportiveCare: "Monitorização respiratória e observação prolongada pela meia-vida longa.",
    guidelineRef: "AACT / Goldfrank",
    notes: ["Evitar flumazenil em uso crônico de BZD, epilepsia ou coingestão pró-convulsivante."]
  },
  diazepam: {
    category: "Benzodiazepínicos",
    synonyms: ["Benzodiazepínico", "BZD", "Valium"],
    clinicalPresentation: "Sonolência, ataxia, disartria e, nas exposições associadas, depressão respiratória e hipotensão.",
    treatment: [
      "Suporte clínico com atenção à via aérea e vigilância respiratória.",
      "Carvão ativado apenas se ingestão recente e via aérea protegida.",
      "Flumazenil apenas em casos muito selecionados, evitando uso empírico."
    ],
    antidote: {
      name: "Flumazenil",
      indication: "Situações selecionadas de reversão, sem contraindicações clássicas e com monitorização contínua.",
      dose: "0,2 mg IV titulados progressivamente conforme resposta clínica e protocolo local."
    },
    supportiveCare: "Observar recorrência de sedação, sobretudo após reversão com flumazenil.",
    guidelineRef: "AACT / Goldfrank",
    notes: ["O metabólito ativo prolonga o risco de ressurgimento da sedação."]
  },
  citalopram: {
    category: "ISRS",
    synonyms: ["ISRS", "Inibidor seletivo da recaptação de serotonina", "Serotoninérgico"],
    clinicalPresentation: "Náuseas, tremor, agitação, síndrome serotoninérgica; citalopram aumenta risco de convulsão e prolongamento de QT.",
    treatment: [
      "Monitorizar ECG seriado, especialmente nas primeiras horas, devido ao risco de QT longo e torsades.",
      "Benzodiazepínicos para agitação, tremor e convulsões; resfriamento externo se hipertermia.",
      "Ciproheptadina se síndrome serotoninérgica moderada/grave após medidas de suporte."
    ],
    antidote: {
      name: "Ciproheptadina",
      indication: "Síndrome serotoninérgica moderada a grave, sobretudo se persistir após benzodiazepínicos e suporte.",
      dose: "12 mg VO/NG de ataque, seguido de 2 mg a cada 2 h até resposta; manutenção 8 mg a cada 6 h."
    },
    supportiveCare: "Monitorização de ECG, temperatura, rigidez e status mental.",
    guidelineRef: "AACT / Goldfrank / EMCrit",
    notes: ["Citalopram e escitalopram são os ISRS com maior preocupação cardíaca aguda."]
  },
  escitalopram: {
    category: "ISRS",
    synonyms: ["ISRS", "Inibidor seletivo da recaptação de serotonina", "Serotoninérgico"],
    clinicalPresentation: "Náuseas, tremor, agitação, síndrome serotoninérgica e risco de QT prolongado em ingestões importantes.",
    treatment: [
      "ECG seriado e monitorização para arritmia, sobretudo em dose elevada.",
      "Benzodiazepínicos para agitação/convulsões e suporte térmico na hipertermia.",
      "Ciproheptadina se quadro serotoninérgico moderado ou grave."
    ],
    antidote: {
      name: "Ciproheptadina",
      indication: "Síndrome serotoninérgica moderada a grave.",
      dose: "12 mg VO/NG de ataque, seguido de 2 mg a cada 2 h até melhora; manutenção 8 mg a cada 6 h."
    },
    supportiveCare: "Monitorização de ECG e suporte sintomático intensivo se houver alteração autonômica importante.",
    guidelineRef: "AACT / Goldfrank"
  },
  fluoxetina: {
    category: "ISRS",
    synonyms: ["ISRS", "Inibidor seletivo da recaptação de serotonina", "Prozac"],
    clinicalPresentation: "Náuseas, vômitos, tremor, agitação e síndrome serotoninérgica; geralmente menos cardiotóxica que citalopram/escitalopram.",
    treatment: [
      "Suporte clínico e benzodiazepínicos para agitação, tremor ou convulsões.",
      "Ciproheptadina se síndrome serotoninérgica moderada a grave.",
      "Observar por tempo maior em intoxicações maciças devido à meia-vida longa."
    ],
    antidote: {
      name: "Ciproheptadina",
      indication: "Síndrome serotoninérgica moderada a grave.",
      dose: "12 mg VO/NG de ataque, depois 2 mg a cada 2 h até melhora clínica."
    },
    supportiveCare: "Acompanhar temperatura, rigidez, clônus e alterações autonômicas.",
    guidelineRef: "Goldfrank / EMCrit",
    notes: ["A meia-vida longa favorece persistência dos sintomas e interações serotoninérgicas tardias."]
  },
  paroxetina: {
    category: "ISRS",
    synonyms: ["ISRS", "Inibidor seletivo da recaptação de serotonina"],
    clinicalPresentation: "Náuseas, sonolência, tremor, agitação e síndrome serotoninérgica em exposições mais relevantes.",
    treatment: [
      "Suporte clínico e benzodiazepínicos para controle de agitação e tremor.",
      "Ciproheptadina se síndrome serotoninérgica moderada a grave.",
      "Monitorização clínica e ECG conforme gravidade e coingestões."
    ],
    antidote: {
      name: "Ciproheptadina",
      indication: "Síndrome serotoninérgica moderada a grave.",
      dose: "12 mg VO/NG de ataque, seguido de 2 mg a cada 2 h até resposta."
    },
    supportiveCare: "Reavaliar hipertermia, clônus e instabilidade autonômica de forma seriada.",
    guidelineRef: "Goldfrank / EMCrit"
  },
  sertralina: {
    category: "ISRS",
    synonyms: ["ISRS", "Inibidor seletivo da recaptação de serotonina"],
    clinicalPresentation: "Sintomas gastrointestinais, tremor, agitação e síndrome serotoninérgica; raramente cursa com cardiotoxicidade isolada significativa.",
    treatment: [
      "Suporte clínico e benzodiazepínicos conforme necessidade.",
      "Ciproheptadina se síndrome serotoninérgica moderada a grave.",
      "ECG e monitorização contínua se coingestão, convulsão ou alteração autonômica."
    ],
    antidote: {
      name: "Ciproheptadina",
      indication: "Síndrome serotoninérgica moderada a grave.",
      dose: "12 mg VO/NG de ataque, depois 2 mg a cada 2 h até melhora."
    },
    supportiveCare: "Monitorização sintomática até resolução de tremor, clônus e hiperatividade autonômica.",
    guidelineRef: "Goldfrank / EMCrit"
  },
  propranolol: {
    category: "Betabloqueadores",
    synonyms: ["Betabloqueador", "Beta-bloqueador"],
    alertMessage: "Propranolol tem maior risco de convulsão e alargamento de QRS do que outros betabloqueadores.",
    clinicalPresentation: "Bradicardia, hipotensão, choque, hipoglicemia, convulsões e cardiotoxicidade com QRS alargado em casos graves.",
    treatment: [
      "Ressuscitação hemodinâmica, atropina inicial e monitorização contínua.",
      "Glucagon para bradicardia/hipotensão sintomáticas; considerar insulina em altas doses com glicose se choque persistente.",
      "Bicarbonato de sódio se houver QRS alargado; vasopressores e emulsão lipídica podem ser necessários em casos refratários."
    ],
    antidote: {
      name: "Glucagon",
      indication: "Bradicardia, hipotensão ou choque por betabloqueador sintomático.",
      dose: "3 a 5 mg IV em bolus no adulto, podendo repetir/escalar até resposta; considerar infusão contínua após resposta inicial."
    },
    supportiveCare: "Monitorização de glicemia, ECG e perfusão periférica; discutir terapia extracorpórea/ECMO em choque refratário.",
    guidelineRef: "AACT / EMCrit / Goldfrank",
    notes: ["Insulina em altas doses é frequentemente mais eficaz que glucagon na falência circulatória refratária."]
  },
  atenolol: {
    category: "Betabloqueadores",
    synonyms: ["Betabloqueador", "Beta-bloqueador"],
    clinicalPresentation: "Bradicardia, hipotensão, tontura e, nos casos graves, choque e hipoglicemia.",
    treatment: [
      "Suporte hemodinâmico com monitorização contínua e atropina como medida inicial.",
      "Glucagon para sintomas significativos e considerar insulina em altas doses com glicose nos casos refratários.",
      "Vasopressores conforme resposta clínica e perfusão."
    ],
    antidote: {
      name: "Glucagon",
      indication: "Bradicardia e hipotensão sintomáticas por betabloqueador.",
      dose: "3 a 5 mg IV em bolus no adulto, titulando conforme resposta e protocolo local."
    },
    supportiveCare: "Monitorização de ECG, glicemia e sinais de choque, com observação prolongada se formulação de liberação modificada.",
    guidelineRef: "AACT / Goldfrank"
  },
  amlodipina: {
    category: "Bloqueadores de canal de cálcio",
    synonyms: ["Bloqueador de canal de cálcio", "BCC", "Anlodipino"],
    clinicalPresentation: "Hipotensão, choque vasodilatador, taquicardia ou bradicardia relativa, hiperglicemia e acidose lática em intoxicação grave.",
    treatment: [
      "Suporte hemodinâmico agressivo com cristalóide, vasopressor e monitorização contínua.",
      "Administrar cálcio EV como medida inicial e considerar insulina em altas doses com glicose se houver choque persistente.",
      "Emulsão lipídica ou ECMO podem ser discutidas em casos refratários."
    ],
    antidote: {
      name: "Insulina em altas doses com glicose",
      indication: "Choque ou hipoperfusão persistente por bloqueador de canal de cálcio apesar das medidas iniciais.",
      dose: "1 U/kg IV em bolus, seguido de 1 a 10 U/kg/h com dextrose e monitorização estreita de glicemia e potássio."
    },
    supportiveCare: "Monitorizar glicemia, potássio, lactato e perfusão continuamente.",
    guidelineRef: "AACT / EMCrit / Goldfrank",
    notes: ["A hiperglicemia sugere intoxicação significativa por bloqueador de canal de cálcio."]
  },
  diltiazem: {
    category: "Bloqueadores de canal de cálcio",
    synonyms: ["Bloqueador de canal de cálcio", "BCC"],
    clinicalPresentation: "Bradicardia, bloqueio AV, hipotensão, choque e hiperglicemia nas intoxicações importantes.",
    treatment: [
      "Suporte hemodinâmico e monitorização contínua em ambiente monitorizado.",
      "Cálcio EV como medida inicial, seguido de insulina em altas doses com glicose se persistir instabilidade.",
      "Vasopressores, pacing e terapias de resgate devem ser considerados conforme resposta."
    ],
    antidote: {
      name: "Insulina em altas doses com glicose",
      indication: "Choque, bradicardia ou hipoperfusão refratária por bloqueador de canal de cálcio.",
      dose: "1 U/kg IV em bolus, seguido de infusão titulada de 1 a 10 U/kg/h com suplementação de glicose."
    },
    supportiveCare: "Monitorização de ritmo, glicemia, potássio e perfusão; discutir marcapasso temporário se instabilidade elétrica importante.",
    guidelineRef: "AACT / EMCrit / Goldfrank"
  },
  dipirona: {
    category: "AINEs",
    synonyms: ["AINE", "Novalgina", "Metamizol"],
    clinicalPresentation: "Náuseas, vômitos, sonolência, hipotensão e, raramente, acidose metabólica, convulsões e disfunção renal em exposições maciças.",
    treatment: [
      "Suporte clínico, hidratação e monitorização renal/hemodinâmica.",
      "Carvão ativado se apresentação precoce e dose relevante.",
      "Tratar complicações específicas como hipotensão, convulsões ou acidose."
    ],
    supportiveCare: "Monitorizar função renal, estado mental e sinais de instabilidade circulatória.",
    guidelineRef: "Goldfrank / bula / toxicologia clínica",
    notes: ["Não há antídoto específico na intoxicação aguda por dipirona."]
  },
  ibuprofeno: {
    category: "AINEs",
    synonyms: ["AINE", "Anti-inflamatório", "Alivium"],
    clinicalPresentation: "Náuseas, vômitos, dor abdominal e sonolência; em overdose maciça pode haver acidose metabólica, convulsões e insuficiência renal.",
    treatment: [
      "Suporte clínico e hidratação, com monitorização renal e ácido-base.",
      "Carvão ativado se apresentação precoce e ingestão significativa.",
      "Tratar convulsões, acidose e instabilidade hemodinâmica conforme protocolos usuais."
    ],
    supportiveCare: "Observar função renal, diurese e evolução neurológica em intoxicações grandes.",
    guidelineRef: "AACT / Goldfrank",
    notes: ["A maioria das exposições leves evolui bem; gravidade aumenta em ingestões maciças."]
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
    synonyms: mergeSynonyms(drug, override),
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