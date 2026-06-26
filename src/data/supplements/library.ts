/**
 * Static supplement library (#23 supplements foundation).
 *
 * Generated from Roberto's "Supplement Database EN" homework sheet (71 products).
 * The ~50 granular source categories are grouped into 12 macro-areas. Supplements
 * live in the plan bundle JSONB (daily_targets.plan_bundle.supplements) — this is
 * the read-only catalogue a coach picks from; nothing here is auto-assigned (new
 * plans seed ZERO supplements, Roberto's explicit default). Mirrors the
 * data/meals/food-map.ts convention: a typed array + id lookup.
 */

/** The 12 macro-areas grouping the granular source categories. */
export type SupplementMacroCategory =
  | "Performance & Body Composition"
  | "Micronutrients"
  | "Anti-inflammatory & Cardiovascular"
  | "Female Health & Hormonal"
  | "Hormonal Support"
  | "Hydration & Electrolytes"
  | "Joint & Connective Tissue"
  | "Liver & Antioxidant"
  | "Sleep & Recovery"
  | "Pre-workout & Cognitive"
  | "Gut & Digestive Health"
  | "Stress & Metabolic";

export interface SupplementLibraryItem {
  /** Stable slug id — stored as SupplementEntry.libraryId on a plan. */
  id: string;
  macroCategory: SupplementMacroCategory;
  name: string;
  /** Example brand/product (may be empty). */
  brandExample: string;
  /** Suggested dose; EMPTY when the source said "Dosage to be specified". */
  dose: string;
  timing: string;
  purpose: string;
  /** Whether the coach may edit the dose (all true in the current source). */
  editableDose: boolean;
  /** Original Italian-language notes from the source. */
  italianNotes: string;
}

export const SUPPLEMENT_LIBRARY: readonly SupplementLibraryItem[] = [
  { id: "creatine-monohydrate", macroCategory: "Performance & Body Composition", name: "Creatine monohydrate", brandExample: "100% pure creatine monohydrate; preferably Creapure", dose: "3–6 g per day", timing: "With a meal. On ON days, preferably post-workout.", purpose: "Power and recovery. Powder or tablets are both acceptable.", editableDose: true, italianNotes: "Creatina Monoidrato" },
  { id: "whey-protein-isolate", macroCategory: "Performance & Body Composition", name: "Whey protein isolate", brandExample: "", dose: "As needed to reach the prescribed protein target", timing: "According to meal plan or protein target distribution", purpose: "Used to reach daily protein intake.", editableDose: true, italianNotes: "Proteine del siero del latte isolate" },
  { id: "vitamin-d", macroCategory: "Micronutrients", name: "Vitamin D", brandExample: "Dibase 10,000 IU/mL", dose: "5 drops per day, corresponding approximately to 2,000–4,000 IU", timing: "With a meal", purpose: "Alternative: 20 minutes of daily sun exposure, preferably in the morning.", editableDose: true, italianNotes: "Vitamina D" },
  { id: "beta-alanine", macroCategory: "Performance & Body Composition", name: "Beta-alanine", brandExample: "", dose: "3–6 g per day", timing: "With a meal. To reduce paresthesia: 3 × 2 g or 2 × 3 g.", purpose: "Lactate-buffering / high-intensity endurance support. May cause paresthesia.", editableDose: true, italianNotes: "Beta Alanina" },
  { id: "omega-3-high-in-epa-dha", macroCategory: "Anti-inflammatory & Cardiovascular", name: "Omega-3 high in EPA + DHA", brandExample: "IFOS-certified; Enervit and Named as product examples", dose: "2 capsules per day", timing: "With a meal", purpose: "EPA + DHA support.", editableDose: true, italianNotes: "Omega 3 ad alto dosaggio EPA+DHA" },
  { id: "slow-release-vitamin-c", macroCategory: "Micronutrients", name: "Slow-release vitamin C", brandExample: "C-Tard", dose: "500 mg per day", timing: "In the morning", purpose: "Antioxidant support.", editableDose: true, italianNotes: "Vitamina C a lento rilascio" },
  { id: "mamma-sana", macroCategory: "Female Health & Hormonal", name: "Mamma Sana", brandExample: "Metagenics", dose: "1 tablet per day", timing: "Not specified", purpose: "Female health / pregnancy-support product.", editableDose: true, italianNotes: "Mamma Sana" },
  { id: "vitamin-b12", macroCategory: "Micronutrients", name: "Vitamin B12", brandExample: "B-DYN, Metagenics", dose: "1 capsule per day", timing: "Not specified", purpose: "Vitamin B12 support.", editableDose: true, italianNotes: "Vitamina B12 B-DYN" },
  { id: "zinc", macroCategory: "Micronutrients", name: "Zinc", brandExample: "ZincoDyn, Metagenics", dose: "2 tablets per day", timing: "In the morning before breakfast", purpose: "Zinc support.", editableDose: true, italianNotes: "Zinco" },
  { id: "iron-bisglycinate", macroCategory: "Micronutrients", name: "Iron bisglycinate", brandExample: "Ferrodyn, Metagenics", dose: "1 tablet in the morning + 1 g vitamin C", timing: "Morning; optionally within 30 minutes before or after workout start/end", purpose: "Iron support. Protocol duration: 8–12 weeks.", editableDose: true, italianNotes: "Ferro Bisglicinato" },
  { id: "chasteberry-vitex-agnus-castus", macroCategory: "Female Health & Hormonal", name: "Chasteberry / Vitex agnus-castus", brandExample: "Solgar", dose: "1–3 capsules per day, equivalent to approximately 400–1,200 mg extract", timing: "Not specified", purpose: "Premenstrual syndrome support.", editableDose: true, italianNotes: "Agnocasto" },
  { id: "fem-xp", macroCategory: "Female Health & Hormonal", name: "Fem XP", brandExample: "Vitamincompany", dose: "2 tablets per day", timing: "Not specified", purpose: "Menstrual cycle support.", editableDose: true, italianNotes: "Fem XP" },
  { id: "inositol-or-myo-inositol", macroCategory: "Female Health & Hormonal", name: "Inositol or myo-inositol", brandExample: "", dose: "4–6 g per day", timing: "Before breakfast", purpose: "Menstrual cycle support.", editableDose: true, italianNotes: "Inositolo / Myo-inositolo" },
  { id: "soy-isoflavones", macroCategory: "Female Health & Hormonal", name: "Soy isoflavones", brandExample: "Genirose Plus, Solgar", dose: "2 tablets per day", timing: "Not specified", purpose: "Perimenopause support.", editableDose: true, italianNotes: "Genirose Plus - Isoflavoni di Soia" },
  { id: "tongkat-ali", macroCategory: "Hormonal Support", name: "Tongkat Ali", brandExample: "", dose: "200–600 mg per day", timing: "Not specified", purpose: "Testosterone-booster support.", editableDose: true, italianNotes: "Tongkat Ali" },
  { id: "diur-out-2-0", macroCategory: "Hydration & Electrolytes", name: "Diur Out 2.0", brandExample: "Vitamincompany", dose: "2 tablets per day", timing: "Not specified", purpose: "Drainage / fluid-balance support.", editableDose: true, italianNotes: "Drenante" },
  { id: "glucosamine", macroCategory: "Joint & Connective Tissue", name: "Glucosamine", brandExample: "", dose: "2 g per day, split into 2 × 1 g doses", timing: "With main meals", purpose: "Joint support.", editableDose: true, italianNotes: "Glucosamina" },
  { id: "hydrolyzed-collagen", macroCategory: "Joint & Connective Tissue", name: "Hydrolyzed collagen", brandExample: "", dose: "10 g", timing: "1 hour before rehabilitation or reconditioning work", purpose: "Connective tissue support.", editableDose: true, italianNotes: "Collagene Idrolizzato" },
  { id: "chondroitin", macroCategory: "Joint & Connective Tissue", name: "Chondroitin", brandExample: "", dose: "1 g per day", timing: "With a meal", purpose: "Joint support.", editableDose: true, italianNotes: "Condroitina" },
  { id: "boswellia-serrata", macroCategory: "Joint & Connective Tissue", name: "Boswellia serrata", brandExample: "", dose: "2.4–3.6 g per day, split into 2–3 doses", timing: "With meals", purpose: "Joint anti-inflammatory support.", editableDose: true, italianNotes: "Boswellia Serrata" },
  { id: "injoint", macroCategory: "Joint & Connective Tissue", name: "Injoint", brandExample: "Vitamincompany; alternatives: Tendisulfur Run or Arthromine, Yamamoto Nutrition", dose: "2 tablets once daily", timing: "Not specified", purpose: "Joint support.", editableDose: true, italianNotes: "Injoint / alternatives" },
  { id: "folic-acid", macroCategory: "Micronutrients", name: "Folic acid", brandExample: "Metafolin, Solgar", dose: "200–400 mcg per day", timing: "Not specified", purpose: "Folate support.", editableDose: true, italianNotes: "Acido Folico" },
  { id: "bromelain", macroCategory: "Anti-inflammatory & Cardiovascular", name: "Bromelain", brandExample: "", dose: "500–2,000 mg", timing: "With a meal", purpose: "Anti-inflammatory support.", editableDose: true, italianNotes: "Bromelina" },
  { id: "curcudyn-forte", macroCategory: "Anti-inflammatory & Cardiovascular", name: "Curcudyn Forte", brandExample: "Metagenics", dose: "1–2 tablets per day", timing: "Not specified", purpose: "Anti-inflammatory support.", editableDose: true, italianNotes: "Curcudyn Forte" },
  { id: "milk-thistle-extract", macroCategory: "Liver & Antioxidant", name: "Milk thistle extract", brandExample: "Legalon", dose: "420–600 mg silymarin per day, split into 2–3 doses", timing: "Not specified", purpose: "Hepatoprotective support.", editableDose: true, italianNotes: "Cardo Mariano / Silimarina" },
  { id: "n-acetylcysteine-nac", macroCategory: "Liver & Antioxidant", name: "N-acetylcysteine (NAC)", brandExample: "", dose: "600 mg twice daily", timing: "Not specified", purpose: "Antioxidant, mucolytic and hepatoprotective support.", editableDose: true, italianNotes: "N-Acetilcisteina" },
  { id: "metaclear", macroCategory: "Liver & Antioxidant", name: "Metaclear", brandExample: "Metagenics", dose: "2 tablets per day for 6–8 weeks; contains 160 mg silymarin", timing: "Not specified", purpose: "Hepatoprotective support.", editableDose: true, italianNotes: "Metaclear" },
  { id: "nattokinase", macroCategory: "Anti-inflammatory & Cardiovascular", name: "Nattokinase", brandExample: "Nattokinase Pure Professional", dose: "100 mg per day or 2,000 FU", timing: "Not specified", purpose: "Blood pressure and coagulation support.", editableDose: true, italianNotes: "Nattokinase" },
  { id: "complete-multivitamin", macroCategory: "Micronutrients", name: "Complete multivitamin", brandExample: "MetaViva, Metagenics as preferred option", dose: "1 tablet per day", timing: "With a meal", purpose: "General micronutrient support.", editableDose: true, italianNotes: "Multivitaminico completo" },
  { id: "magnesium-l-threonate-or-bisglycinate", macroCategory: "Sleep & Recovery", name: "Magnesium L-threonate or bisglycinate", brandExample: "", dose: "200–400 mg elemental magnesium", timing: "30–60 minutes before sleep", purpose: "Sleep and sleep-quality support. Check the actual magnesium content of the purchased supplement.", editableDose: true, italianNotes: "Magnesio L-Treonato oppure Bisglicinato" },
  { id: "l-theanine", macroCategory: "Sleep & Recovery", name: "L-theanine", brandExample: "", dose: "200–400 mg", timing: "45 minutes before training or before sleep", purpose: "Sleep and sleep-quality support; also usable pre-workout.", editableDose: true, italianNotes: "L Teanina" },
  { id: "melatonin", macroCategory: "Sleep & Recovery", name: "Melatonin", brandExample: "", dose: "500 mcg to 5 mg", timing: "Before sleep", purpose: "Find the effective dose individually, starting from the lowest dose.", editableDose: true, italianNotes: "Melatonina" },
  { id: "gaba", macroCategory: "Sleep & Recovery", name: "GABA", brandExample: "", dose: "Effective dose: 3,000–5,000 mg. Suggested start: 1,000 mg, then adjust according to response.", timing: "1 hour before sleep", purpose: "Sleep and sleep-quality support.", editableDose: true, italianNotes: "GABA" },
  { id: "sis-electrolytes-tabs", macroCategory: "Hydration & Electrolytes", name: "SIS Electrolytes Tabs", brandExample: "SIS", dose: "1 tablet in 500 mL or 2 tablets in 1 L water", timing: "As needed for rehydration", purpose: "Electrolytes for rehydration.", editableDose: true, italianNotes: "SIS Electrolytes Tabs" },
  { id: "sis-go-electrolytes", macroCategory: "Hydration & Electrolytes", name: "SIS GO Electrolytes", brandExample: "SIS", dose: "30–60 g per L of water", timing: "As needed for rehydration", purpose: "Electrolytes with carbohydrates for rehydration.", editableDose: true, italianNotes: "SIS GO ELECTROLYTES" },
  { id: "caffeine", macroCategory: "Pre-workout & Cognitive", name: "Caffeine", brandExample: "", dose: "100–300 mg", timing: "45–60 minutes before the most intense training sessions", purpose: "Start with the lowest dose and progressively increase according to perceived activation. Pay attention to evening use and sleep disruption.", editableDose: true, italianNotes: "Caffeina" },
  { id: "evopump-or-pump-no-booster-alternatives", macroCategory: "Pre-workout & Cognitive", name: "Evopump or pump/no-booster alternatives", brandExample: "Evopump, HSN Nutrition; alternatives: GHOST PUMP, PLATINUM PUMP Optimum Nutrition, Origin by Myprotein", dose: "20–30 g", timing: "45–60 minutes before cardiometabolic training", purpose: "NO-booster / pump support.", editableDose: true, italianNotes: "Evopump / NO BOOSTER" },
  { id: "beet-it-3000", macroCategory: "Pre-workout & Cognitive", name: "Beet It 3000", brandExample: "Beet It", dose: "6.4–12.8 mg nitrate/kg body mass; approximately 40–70 mL", timing: "1 hour before cardiometabolic training; may be diluted in 100–200 mL water", purpose: "Nitrate support for cardiometabolic training.", editableDose: true, italianNotes: "Beet it 3000" },
  { id: "maurten-bicarb", macroCategory: "Pre-workout & Cognitive", name: "Maurten Bicarb", brandExample: "Maurten", dose: "0.2–0.3 g/kg body mass", timing: "Not specified", purpose: "Bicarbonate buffering support.", editableDose: true, italianNotes: "Maurten - Bicarb" },
  { id: "alpha-gpc", macroCategory: "Pre-workout & Cognitive", name: "Alpha-GPC", brandExample: "", dose: "300 mg", timing: "30–60 minutes before important workouts, sparring or tests", purpose: "Cognitive / neuromuscular support.", editableDose: true, italianNotes: "Alpha-GPC" },
  { id: "ginkgo-biloba", macroCategory: "Pre-workout & Cognitive", name: "Ginkgo biloba", brandExample: "", dose: "120–240 mg", timing: "1 hour before a cognitive task", purpose: "Cognitive support.", editableDose: true, italianNotes: "Ginkgo Biloba" },
  { id: "nicotine-gum", macroCategory: "Pre-workout & Cognitive", name: "Nicotine gum", brandExample: "Nicorette gum", dose: "1 chewing gum", timing: "1 hour before sparring or intense training", purpose: "Stimulant support for sparring or intense training.", editableDose: true, italianNotes: "Nicorette gomme" },
  { id: "bacopa-monnieri", macroCategory: "Pre-workout & Cognitive", name: "Bacopa monnieri", brandExample: "", dose: "300 mg extract", timing: "1 hour before training", purpose: "Cognitive support.", editableDose: true, italianNotes: "Bacopa Monnieri" },
  { id: "l-citrulline", macroCategory: "Pre-workout & Cognitive", name: "L-citrulline", brandExample: "", dose: "6–8 g", timing: "1 hour before cardiometabolic training", purpose: "NO / pump support.", editableDose: true, italianNotes: "L-Citrullina" },
  { id: "sis-beta-fuel", macroCategory: "Pre-workout & Cognitive", name: "SIS Beta Fuel", brandExample: "SIS", dose: "", timing: "To be specified", purpose: "Carbohydrate fueling product.", editableDose: true, italianNotes: "SIS BETA FUEL: indicare dosaggio" },
  { id: "sis-go-electrolytes-2", macroCategory: "Pre-workout & Cognitive", name: "SIS GO Electrolytes", brandExample: "SIS", dose: "", timing: "To be specified", purpose: "Electrolytes with carbohydrate support.", editableDose: true, italianNotes: "SIS GO ELECTROLYTES: indicare dosaggio" },
  { id: "glutamine", macroCategory: "Gut & Digestive Health", name: "Glutamine", brandExample: "", dose: "10 g per day, split into 2 × 5 g doses", timing: "Morning and evening", purpose: "Gut support.", editableDose: true, italianNotes: "Glutammina" },
  { id: "vsl-3", macroCategory: "Gut & Digestive Health", name: "VSL#3", brandExample: "VSL#3", dose: "1 sachet per day for 10 days; in more severe cases 2 sachets per day for 5 days", timing: "Not specified", purpose: "Constipation and diarrhea support.", editableDose: true, italianNotes: "VSL#3" },
  { id: "probactiol-duo", macroCategory: "Gut & Digestive Health", name: "Probactiol Duo", brandExample: "Metagenics", dose: "2 tablets per day", timing: "Not specified", purpose: "Lactic-acid bacteria / probiotic support.", editableDose: true, italianNotes: "Probactiol Duo" },
  { id: "probactiol-bifido", macroCategory: "Gut & Digestive Health", name: "Probactiol Bifido", brandExample: "Metagenics", dose: "2 tablets per day", timing: "Not specified", purpose: "Probiotic support for constipation.", editableDose: true, italianNotes: "Probactiol Bifido" },
  { id: "soluble-fiber-inulin-or-psyllium-fiber", macroCategory: "Gut & Digestive Health", name: "Soluble fiber: inulin or psyllium fiber", brandExample: "Daily Fibre Support, Intoleran as alternative", dose: "5–10 g", timing: "In the evening before sleep or with meals", purpose: "Prebiotic support for bowel regularity.", editableDose: true, italianNotes: "Prebiotici - Fibra Solubile" },
  { id: "akkermansia", macroCategory: "Gut & Digestive Health", name: "Akkermansia", brandExample: "", dose: "1 tablet per day", timing: "Not specified", purpose: "IBS-C / IBS-D support.", editableDose: true, italianNotes: "Akkermansia" },
  { id: "bacillus-subtilis", macroCategory: "Gut & Digestive Health", name: "Bacillus subtilis", brandExample: "", dose: "Approximately 10 billion CFU/day; around 3–4 capsules", timing: "Not specified", purpose: "Prevention of Staphylococcus aureus infection.", editableDose: true, italianNotes: "Bacillus Subtilis" },
  { id: "digestive-enzyme-products", macroCategory: "Gut & Digestive Health", name: "Digestive enzyme products", brandExample: "Metadigest Total, Metagenics; Xanacid Digest; Enzymasic, Yamamoto", dose: "1–3 tablets per meal", timing: "With meals", purpose: "Digestive enzyme support.", editableDose: true, italianNotes: "Metadigest Total / Xanacid Digest / Enzymasic" },
  { id: "fodmix", macroCategory: "Gut & Digestive Health", name: "Fodmix", brandExample: "Intoleran", dose: "1–3 tablets per meal", timing: "With meals", purpose: "FODMAP digestive enzyme support.", editableDose: true, italianNotes: "Fodmix" },
  { id: "dao-plus", macroCategory: "Gut & Digestive Health", name: "DAO Plus", brandExample: "Intoleran", dose: "1 tablet per meal", timing: "With meals", purpose: "Histamine digestive enzyme support.", editableDose: true, italianNotes: "Dao Plus" },
  { id: "candex", macroCategory: "Gut & Digestive Health", name: "Candex", brandExample: "Metagenics", dose: "3 tablets per day, 1 per meal", timing: "With meals", purpose: "Gut cleanse / SIBO support.", editableDose: true, italianNotes: "Candex" },
  { id: "peppermint-oil", macroCategory: "Gut & Digestive Health", name: "Peppermint oil", brandExample: "", dose: "0.1–0.2 mL oil at 33–50%, or 450–750 mg", timing: "Not specified", purpose: "Abdominal cramp support.", editableDose: true, italianNotes: "Menta Piperita" },
  { id: "d-mannose", macroCategory: "Gut & Digestive Health", name: "D-mannose", brandExample: "", dose: "2 g per day", timing: "Not specified", purpose: "Prevention of urinary tract infections.", editableDose: true, italianNotes: "D-Mannosio" },
  { id: "cranberry-extract", macroCategory: "Gut & Digestive Health", name: "Cranberry extract", brandExample: "Cistiflor contains D-mannose + cranberry", dose: "120 mg per day", timing: "Not specified", purpose: "Prevention of urinary tract infections.", editableDose: true, italianNotes: "Estratto di Mirtilli Rossi" },
  { id: "pilorex", macroCategory: "Gut & Digestive Health", name: "Pilorex", brandExample: "", dose: "1 capsule before breakfast and 1 capsule before bedtime", timing: "Before breakfast and before bedtime", purpose: "Gastric support.", editableDose: true, italianNotes: "Pilorex" },
  { id: "esoxx-one", macroCategory: "Gut & Digestive Health", name: "Esoxx ONE", brandExample: "", dose: "1 stick sachet", timing: "After meals or before bedtime", purpose: "Protective film for gastroesophageal reflux.", editableDose: true, italianNotes: "Esoxx ONE" },
  { id: "maalox-reflurapid", macroCategory: "Gut & Digestive Health", name: "Maalox Reflurapid", brandExample: "", dose: "2–4 tablets", timing: "After meals or before bedtime", purpose: "Antacid support.", editableDose: true, italianNotes: "Maalox Reflurapid" },
  { id: "kolorex-forte", macroCategory: "Gut & Digestive Health", name: "Kolorex Forte", brandExample: "Named", dose: "1 capsule twice daily", timing: "Not specified", purpose: "Anti-Candida support.", editableDose: true, italianNotes: "Kolorex Forte" },
  { id: "rhodiola-rosea", macroCategory: "Stress & Metabolic", name: "Rhodiola rosea", brandExample: "", dose: "250–600 mg extract", timing: "Not specified", purpose: "Stress-adaptation support.", editableDose: true, italianNotes: "Rhodiola Rosea" },
  { id: "ashwagandha-ksm-66", macroCategory: "Stress & Metabolic", name: "Ashwagandha KSM-66", brandExample: "Tsunami Nutrition", dose: "300–500 mg root extract", timing: "With a meal in the evening", purpose: "Stress-adaptation support.", editableDose: true, italianNotes: "Ashwagandha KSM-66" },
  { id: "panax-ginseng", macroCategory: "Stress & Metabolic", name: "Panax ginseng", brandExample: "", dose: "400 mg extract", timing: "Not specified", purpose: "Stress-adaptation support.", editableDose: true, italianNotes: "Panax Ginseng" },
  { id: "ceylon-cinnamon", macroCategory: "Stress & Metabolic", name: "Ceylon cinnamon", brandExample: "", dose: "1–6 g per day", timing: "Not specified", purpose: "Insulin-mimetic support.", editableDose: true, italianNotes: "Cannella Ceylon" },
  { id: "berberine", macroCategory: "Stress & Metabolic", name: "Berberine", brandExample: "Berberol", dose: "1–2 g per day", timing: "Before meals", purpose: "Insulin sensitivity support.", editableDose: true, italianNotes: "Berberina" },
  { id: "alpha-lipoic-acid", macroCategory: "Stress & Metabolic", name: "Alpha-lipoic acid", brandExample: "", dose: "600 mg twice daily", timing: "Not specified", purpose: "Insulin-mimetic / antioxidant support.", editableDose: true, italianNotes: "Acido Alfa Lipoico" },
  { id: "red-yeast-rice", macroCategory: "Anti-inflammatory & Cardiovascular", name: "Red yeast rice", brandExample: "", dose: "600 mg twice daily", timing: "Not specified", purpose: "Cholesterol reduction support.", editableDose: true, italianNotes: "Riso Rosso Fermentato" },
];

/**
 * Roberto's default CORE SET — the only baseline a coach might quick-add. New
 * plans still seed ZERO supplements; this is opt-in.
 */
export const CORE_SET: readonly string[] = [
  "whey-protein-isolate",
  "creatine-monohydrate",
  "vitamin-d",
  "complete-multivitamin",
];

const BY_ID: ReadonlyMap<string, SupplementLibraryItem> = new Map(
  SUPPLEMENT_LIBRARY.map((s) => [s.id, s])
);

/** Look up a library item by id. */
export function getSupplement(id: string): SupplementLibraryItem | undefined {
  return BY_ID.get(id);
}

/** Resolve the CORE_SET ids to their library items (order preserved). */
export function coreSetItems(): SupplementLibraryItem[] {
  return CORE_SET.map((id) => BY_ID.get(id)).filter((x): x is SupplementLibraryItem => !!x);
}
