/**
 * 23 Conditional Guidance Blocks — Master Library
 *
 * Each block has:
 * - A unique ID and Italian title/content
 * - A condition function evaluated against the client's GuidanceBlockContext
 * - A category (body_composition, energy_balance, training, lifestyle, dietary, disclosure)
 * - A priority (1 = first shown, 3 = supplemental)
 *
 * Blocks are selected by selectGuidanceBlocks() in selector.ts.
 * Content is in Italian and uses Markdown. Template tokens ({bf_pct}, etc.)
 * are resolved by renderGuidanceBlock() before use.
 */

import type { ConditionalGuidanceBlock, GuidanceBlockContext } from "./types";

// ── Helper constants ──────────────────────────────────────────────────────────

/** Body fat thresholds for male */
const BF_MALE = { low: 12, fitness: 18, average: 25 } as const;
/** Body fat thresholds for female */
const BF_FEMALE = { low: 20, fitness: 25, average: 32 } as const;

// ── Block: Helpers ────────────────────────────────────────────────────────────

/** Check if client has high body fat (above "average" threshold) */
function isHighBodyFat(ctx: GuidanceBlockContext): boolean {
  const { bodyComposition: bc, snapshot } = ctx;
  return snapshot.sex === "male"
    ? bc.bodyFatPct > BF_MALE.average
    : bc.bodyFatPct > BF_FEMALE.average;
}

/** Check if client has low/athletic body fat */
function isAthleticBodyFat(ctx: GuidanceBlockContext): boolean {
  const { bodyComposition: bc, snapshot } = ctx;
  return snapshot.sex === "male"
    ? bc.bodyFatPct <= BF_MALE.low
    : bc.bodyFatPct <= BF_FEMALE.low;
}

// ── MASTER BLOCK LIBRARY (23 blocks) ─────────────────────────────────────────

/**
 * Complete library of 23 conditional guidance blocks.
 * Grouped by category for readability; selector sorts by category + priority.
 */
export const GUIDANCE_BLOCKS: readonly ConditionalGuidanceBlock[] = [
  // ═══════════════════════════════════════════════════════════════════════════
  // CATEGORY: body_composition (6 blocks)
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "high_bf_male",
    title: "Composizione Corporea: Priorità alla Riduzione del Grasso",
    category: "body_composition",
    priority: 1,
    content: `Con una percentuale di grasso corporeo superiore al ${BF_MALE.average}% si trovano nella fascia "sopra la media". **La priorità assoluta in questa fase è la riduzione della massa grassa preservando la massa magra.**

Questo piano è stato costruito per creare un deficit calorico controllato, mantenendo un apporto proteico elevato (≥ 2,0 g/kg di peso corporeo) per proteggere il tessuto muscolare durante la fase di dimagrimento.

**Aspettative realistiche:**
- Ritmo ottimale di perdita di peso: 0,5–1,0% del peso corporeo a settimana
- Perdita di grasso target: 0,3–0,7 kg/settimana
- Monitorare mensilmente le circonferenze (vita, fianchi, addome) oltre al peso

⚠️ *Evitare deficit eccessivi (>500 kcal/giorno) per più di 4–6 settimane consecutive senza una settimana di mantenimento (diet break).*`,
    condition: (ctx) =>
      ctx.snapshot.sex === "male" && ctx.bodyComposition.bodyFatPct > BF_MALE.average,
  },

  {
    id: "high_bf_female",
    title: "Composizione Corporea: Priorità alla Riduzione del Grasso",
    category: "body_composition",
    priority: 1,
    content: `Con una percentuale di grasso corporea superiore al ${BF_FEMALE.average}% si trovano nella fascia "sopra la media". **La priorità in questa fase è ridurre la massa grassa proteggendo la massa magra.**

Il piano applica un deficit calorico moderato con distribuzione dei macronutrienti ottimizzata per le caratteristiche metaboliche femminili, mantenendo un apporto proteico adeguato (≥ 1,8 g/kg) e carboidrati periodizzati.

**Indicatori di progresso principali:**
- Peso corporeo (media settimanale, non giornaliera)
- Circonferenze (vita, fianchi, cosce, braccia)
- Progressione dei carichi in allenamento
- Livello di energia e qualità del sonno

⚠️ *Il ciclo mestruale influisce sulla ritenzione idrica e sul peso: confrontare sempre le stesse fasi del ciclo per dati coerenti.*`,
    condition: (ctx) =>
      ctx.snapshot.sex === "female" &&
      ctx.bodyComposition.bodyFatPct > BF_FEMALE.average,
  },

  {
    id: "athletic_composition",
    title: "Composizione Corporea Atletica: Ottimizzazione della Performance",
    category: "body_composition",
    priority: 1,
    content: `La composizione corporea attuale rientra nella fascia **atletica/fitness** — un ottimo punto di partenza per massimizzare la performance e la ricomposizione corporea.

A questo livello di grasso corporeo, il corpo è particolarmente responsivo all'allenamento e alla nutrizione. Le priorità nutrizionali sono:

1. **Supportare la performance** — carboidrati adeguati nelle giornate di allenamento
2. **Massimizzare la sintesi proteica** — distribuzione proteica uniforme nei pasti (0,4 g/kg per pasto)
3. **Gestire il recupero** — finestra post-allenamento prioritaria

Il piano è strutturato per mantenere o migliorare ulteriormente la composizione corporea, con margine per ricomposizione (perdita di grasso + aumento di massa magra simultanea).`,
    condition: (ctx) => isAthleticBodyFat(ctx),
  },

  {
    id: "significant_lean_mass",
    title: "Massa Magra Elevata: Fabbisogno Proteico Aumentato",
    category: "body_composition",
    priority: 2,
    content: `Con una massa magra ≥ 70 kg, il fabbisogno proteico assoluto è significativamente più alto rispetto alla media. Le stime standard in g/kg di peso corporeo **sottostimano** il reale fabbisogno se il peso include una quota elevata di massa grassa.

**Calcolo proteico su massa magra:** I target di questo piano sono stati calcolati su base della **massa magra** (lean body mass), non del peso totale, per garantire la massima efficacia.

- Target proteico: 2,2–2,8 g per kg di **massa magra**
- Distribuire uniformemente su 4–6 pasti/giorno
- Privilegiare fonti ad alto valore biologico (uova, carne bianca, pesce, latticini magri, proteine del siero)`,
    condition: (ctx) => ctx.bodyComposition.leanMassKg >= 70,
  },

  {
    id: "low_bf_concern",
    title: "Percentuale di Grasso Bassa: Monitoraggio Speciale",
    category: "body_composition",
    priority: 1,
    content: `La percentuale di grasso corporeo attuale si colloca nella fascia **essenziale/molto bassa**. A questo livello è fondamentale monitorare attentamente segnali di stress metabolico.

**Indicatori da sorvegliare:**
- Qualità del sonno (peggioramento = segnale di deficit eccessivo)
- Livelli di energia e concentrazione durante gli allenamenti
- Forza e progressione dei carichi (stallo = possibile ipocaloria)
- Per le donne: regolarità del ciclo mestruale

**Raccomandazione:** Questo piano è calibrato per mantenere o aumentare leggermente la massa magra, non per ridurre ulteriormente il grasso. Evitare deficit aggiuntivi auto-imposti.`,
    condition: (ctx) => {
      const { bodyComposition: bc, snapshot } = ctx;
      return snapshot.sex === "male"
        ? bc.bodyFatPct < 10
        : bc.bodyFatPct < 16;
    },
  },

  {
    id: "overweight_metabolic",
    title: "Salute Metabolica: Strategia Integrata",
    category: "body_composition",
    priority: 2,
    content: `Con un peso corporeo elevato rispetto all'altezza, la gestione della salute metabolica è parte integrante del piano nutrizionale. Oltre alla composizione corporea, questo approccio mira a migliorare:

- **Sensibilità insulinica** — attraverso la distribuzione ottimale dei carboidrati e l'attività fisica
- **Profilo lipidico** — con scelte alimentari anti-infiammatorie
- **Pressione sanguigna** — riduzione del sodio in eccesso, aumento del potassio (frutta, verdura)

⚠️ *Se sono presenti condizioni metaboliche diagnosticate (diabete tipo 2, ipertensione, dislipidemia), condividere questo piano con il proprio medico curante prima di iniziare.*`,
    condition: (ctx) => {
      const { snapshot } = ctx;
      const bmi =
        snapshot.weightKg / Math.pow(snapshot.heightCm / 100, 2);
      return bmi > 30 || ctx.bodyComposition.bodyFatPct > 35;
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CATEGORY: energy_balance (4 blocks)
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "caloric_deficit_guidance",
    title: "Fase di Deficit Calorico: Come Gestire la Dieta",
    category: "energy_balance",
    priority: 1,
    content: `Questo piano prevede un **deficit calorico controllato**. Alcune indicazioni pratiche per ottimizzare i risultati:

**Cosa aspettarsi:**
- Le prime 1–2 settimane: perdita di peso accelerata (acqua e glicogeno) — normale
- Settimane 3+: rallentamento fisiologico — normale e atteso
- Fluttuazioni quotidiane di ±1–2 kg — legate all'idratazione, non al grasso

**Strategie per rispettare il piano:**
1. Pesarsi sempre nella stessa condizione (mattina, a digiuno, dopo l'igiene)
2. Calcolare la **media settimanale** del peso — è l'unico dato rilevante
3. Preparare i pasti in anticipo (meal prep domenicale)
4. Non saltare i pasti — aumenta il rischio di abbuffate compensatorie

**Segnale di allarme:** se la perdita di peso si azzera per 3+ settimane consecutive, segnalare al coach per un aggiustamento.`,
    condition: (ctx) => ctx.isDeficit,
  },

  {
    id: "caloric_surplus_guidance",
    title: "Fase di Surplus Calorico: Aumentare la Massa Magra",
    category: "energy_balance",
    priority: 1,
    content: `Questo piano prevede un **surplus calorico** per favorire l'aumento della massa muscolare. Il surplus è calcolato per essere "lean bulk" — crescita muscolare con minimo accumulo di grasso.

**Aspettative realistiche:**
- Aumento di peso ottimale: 0,2–0,5% del peso corporeo a settimana
- Per un atleta da 80 kg: 0,16–0,4 kg/settimana
- Rapporto muscolo/grasso guadagnato: dipende da training, sonno, stress e genetica

**Gestire il surplus:**
- Il peso può aumentare di 1–2 kg nella prima settimana (glicogeno + acqua) — normale
- Se il peso aumenta > 0,7 kg/settimana per 2+ settimane consecutive, ridurre le calorie di 100–150 kcal
- Monitorare le plicometrie mensili per controllare l'accumulo di grasso

**Fondamentale:** l'allenamento con sovraccarichi è il segnale che dirige le calorie extra verso il muscolo. Senza stimolo allenante adeguato, il surplus va in grasso.`,
    condition: (ctx) => ctx.isSurplus,
  },

  {
    id: "maintenance_guidance",
    title: "Fase di Mantenimento: Consolidare i Risultati",
    category: "energy_balance",
    priority: 1,
    content: `Questo piano è calibrato per il **mantenimento** — un obiettivo spesso sottovalutato ma fondamentale per la salute metabolica a lungo termine.

**Perché il mantenimento è importante:**
- Normalizza gli ormoni della fame (leptina, grelina) dopo fasi di deficit
- Ripristina le riserve di glicogeno muscolare
- Riduce il rischio di effetto yo-yo nei cicli successivi
- Crea la base metabolica per la prossima fase (cut o bulk)

**Come misurare il successo del mantenimento:**
- Peso stabile (±1–2 kg) nelle ultime 4 settimane
- Progressione nei carichi di allenamento
- Buona qualità del sonno ed energia stabile durante il giorno

Questo è anche il momento ideale per migliorare le abitudini alimentari senza la pressione del deficit.`,
    condition: (ctx) => !ctx.isDeficit && !ctx.isSurplus,
  },

  {
    id: "high_caloric_target",
    title: "Target Calorico Elevato: Gestione Pratica",
    category: "energy_balance",
    priority: 2,
    content: `Con un fabbisogno calorico medio superiore a 3.000 kcal/giorno, raggiungere il target con alimenti interi può richiedere pianificazione. Alcune strategie pratiche:

**Aumentare il volume calorico senza aumentare il volume di cibo:**
- Olio d'oliva extravergine (aggiunto a fine cottura) — 90 kcal/cucchiaio
- Frutta secca (noci, mandorle, anacardi) — 550–600 kcal/100g
- Avocado — grassi sani ad alta densità calorica
- Miele o sciroppo di riso nelle colazioni post-allenamento

**Distribuire le calorie strategicamente:**
- Giorni di allenamento: più carboidrati (pre e post workout)
- Giorni di riposo: meno carboidrati, grassi leggermente superiori
- Pasto pre-nanna: caseina o ricotta (proteina a lento rilascio)`,
    condition: (ctx) => ctx.avgWeeklyTdeeKcal > 3000,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CATEGORY: training (4 blocks)
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "high_frequency_training",
    title: "Allenamento ad Alta Frequenza: Nutrizione di Supporto",
    category: "training",
    priority: 1,
    content: `Con **5 o più sessioni di allenamento a settimana**, la nutrizione peri-workout diventa critica per sostenere la performance e il recupero.

**Priorità nutrizionali per alta frequenza:**

| Momento | Nutrienti | Esempio |
|---------|-----------|---------|
| Pre-allenamento (1–2h prima) | Carboidrati complessi + proteine | Riso + pollo |
| Intra-workout (>90 min) | Carboidrati semplici + elettroliti | Banana + acqua con sali |
| Post-allenamento (entro 60 min) | Proteine + carboidrati | Shake whey + frutta |

**Recupero inter-sessione:**
- Dormire almeno 7–8 ore è non negoziabile
- Giorni consecutivi di allenamento: privilegiare carboidrati serali per rifornire il glicogeno
- Se la performance cala nelle sessioni PM, aumentare i carboidrati del pasto precedente`,
    condition: (ctx) => ctx.trainingDaysPerWeek >= 5,
  },

  {
    id: "low_frequency_training",
    title: "Allenamento a Bassa Frequenza: Massimizzare Ogni Sessione",
    category: "training",
    priority: 1,
    content: `Con **1–2 sessioni di allenamento a settimana**, ogni sessione ha un peso specifico maggiore. La nutrizione deve essere ottimizzata per massimizzare lo stimolo anabolico di ogni singolo allenamento.

**Strategia nutrizionale:**
- Caricare i carboidrati il giorno prima dell'allenamento (glicogeno pieno = performance migliore)
- Pasto pre-workout ricco di carboidrati complessi e proteine (2–3 ore prima)
- Recupero post-workout esteso: continuare ad assumere proteine nelle 24–48 ore successive
- Nei giorni di riposo: mantenere il target proteico è fondamentale anche senza stimolo allenante

**Considerazione importante:** con bassa frequenza, la progressione dei carichi richiede più tempo. Questo è normale e non deve essere interpretato come fallimento del piano nutrizionale.`,
    condition: (ctx) => ctx.trainingDaysPerWeek <= 2,
  },

  {
    id: "training_beginner",
    title: "Principiante: Periodo d'Oro per la Crescita",
    category: "training",
    priority: 2,
    content: `I primi 1–2 anni di allenamento sono il **"periodo d'oro"**: il corpo risponde agli stimoli allenanti in modo drammaticamente superiore rispetto agli atleti più esperti.

**Cosa significa per la nutrizione:**
- Anche in deficit moderato, un principiante può guadagnare massa muscolare (ricomposizione corporea)
- Il target proteico è comunque fondamentale — non scendere sotto 1,8 g/kg
- La consistenza nel piano nutrizionale è più importante della perfezione

**Focus principale:**
1. Imparare a pesare gli alimenti e tracciare i macros (anche solo per 4–6 settimane per calibrare l'occhio)
2. Identificare i pasti che "funzionano" e ripeterli (standardizzare la dieta riduce la fatica decisionale)
3. Non ossessionarsi con micro-ottimizzazioni — le fondamenta sono la priorità`,
    condition: (ctx) =>
      ctx.allenamento !== undefined &&
      ctx.allenamento.experienceYears < 1,
  },

  {
    id: "advanced_athlete",
    title: "Atleta Avanzato: Precisione e Periodizzazione",
    category: "training",
    priority: 2,
    content: `Con oltre 5 anni di esperienza di allenamento, il corpo è adattato agli stimoli standard. La progressione richiede **maggiore precisione** nella nutrizione e nella periodizzazione.

**Strategie avanzate incluse in questo piano:**
- **Periodizzazione calorica settimanale** — calorie più alte nelle giornate di allenamento intenso
- **Timing proteico ottimizzato** — distribuzione su 5–6 pasti per massimizzare la MPS (sintesi proteica muscolare)
- **Ciclizzazione dei carboidrati** — refeed strategici se in deficit prolungato
- **Monitoraggio della performance** — il calo nei carichi è il primo indicatore di ipocaloria eccessiva

**Nota sul plateau:** negli atleti avanzati, guadagni di 1–2 kg di massa magra all'anno sono fisiologici e ottimi. La perdita di grasso in fase di cut sarà più lenta rispetto al principiante — è normale.`,
    condition: (ctx) =>
      ctx.allenamento !== undefined &&
      ctx.allenamento.experienceYears >= 5,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CATEGORY: lifestyle (5 blocks)
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "poor_sleep",
    title: "Sonno Insufficiente: Impatto sulla Composizione Corporea",
    category: "lifestyle",
    priority: 1,
    content: `I dati del questionario indicano un sonno medio **inferiore a 7 ore per notte**. Questo è uno dei fattori che più influenzano negativamente la composizione corporea, indipendentemente dall'alimentazione.

**Effetti del sonno insufficiente:**
- ↑ Grelina (ormone della fame) — aumento degli episodi di fame
- ↓ Leptina (ormone della sazietà) — minor segnale di stop
- ↑ Cortisolo cronico — catabolismo muscolare e accumulo viscerale
- ↓ GH notturno — ridotta sintesi proteica e recupero muscolare
- ↑ Preferenza per alimenti ipercalorici (+300–500 kcal/giorno in media)

**Azione prioritaria:** prima di ottimizzare la dieta, ottimizzare il sonno. Anche solo 30–60 minuti aggiuntivi di sonno hanno effetti misurabili sulla composizione corporea.

*Strategie immediate: fissare un orario di sveglia fisso (anche nel weekend), eliminare schermi 1 ora prima, abbassare la temperatura della camera a 18–20°C.*`,
    condition: (ctx) =>
      ctx.stileVita !== undefined && ctx.stileVita.sleepHours < 7,
  },

  {
    id: "high_stress",
    title: "Stress Elevato: Nutrizione Adattogena",
    category: "lifestyle",
    priority: 1,
    content: `Un livello di stress percepito **elevato** aumenta il cortisolo cronico, che interferisce con la composizione corporea e il recupero dall'allenamento.

**Come lo stress elevato influenza la nutrizione:**
- Aumenta il craving per alimenti ipercalorici e zuccherati
- Riduce la sensibilità insulinica (più difficile utilizzare i carboidrati)
- Favorisce l'accumulo di grasso viscerale (addome)
- Può causare disturbi gastrointestinali che riducono l'assorbimento dei nutrienti

**Adattamenti del piano:**
- Carboidrati leggermente più elevati (il glucosio modula il cortisolo)
- Priorità agli omega-3 (anti-infiammatori) — presente nel piano
- Magnesio glicato serale (da valutare come integrazione)

*Nota del coach:* se lo stress ha cause strutturali (lavoro, relazioni, finanze), nessun piano nutrizionale può compensarlo completamente. Il lavoro sulla riduzione dello stress ha un ROI superiore a qualsiasi ottimizzazione dietetica.`,
    condition: (ctx) =>
      ctx.stileVita !== undefined &&
      (ctx.stileVita.stressLevel ?? 0) >= 7,
  },

  {
    id: "sedentary_occupation",
    title: "Lavoro Sedentario: Compensare con l'Attività Quotidiana",
    category: "lifestyle",
    priority: 2,
    content: `Un lavoro prevalentemente **sedentario** (ufficio, smart working, guida) riduce significativamente il NEAT — la componente più variabile del dispendio energetico quotidiano.

**NEAT (Non-Exercise Activity Thermogenesis)** è tutto il movimento che non è allenamento: camminare, stare in piedi, fare le scale, gesticolare. Negli individui sedentari può essere 400–800 kcal/giorno in meno rispetto a chi ha un lavoro fisico.

**Strategie pratiche per aumentare il NEAT:**
- Fissare un obiettivo di passi giornalieri (minimo 8.000)
- Riunioni in piedi o camminando dove possibile
- Fare le scale invece dell'ascensore
- Pausa attiva di 5 minuti ogni 90 minuti di lavoro
- Parcheggiare più lontano o scendere una fermata prima

⚠️ *Il piano ha già considerato il livello di attività sedentario nel calcolo del TDEE — non compensare mangiando di meno per aumentare il deficit.*`,
    condition: (ctx) => ctx.snapshot.occupationalLevel === "sedentary",
  },

  {
    id: "low_daily_steps",
    title: "Bassa Attività Quotidiana: Aumentare il Movimento",
    category: "lifestyle",
    priority: 2,
    content: `Il conteggio passi attuale è **inferiore a 6.000 passi/giorno**, una soglia associata a rischi metabolici aumentati. L'aumento dei passi è uno degli interventi più efficaci e sostenibili per migliorare la composizione corporea.

**Perché i passi contano:**
- Ogni 1.000 passi aggiuntivi = circa 40–50 kcal bruciate
- Camminare aumenta la sensibilità insulinica per le ore successive
- L'attività continuata a bassa intensità usa preferenzialmente i grassi come carburante
- Riduce lo stress e migliora il sonno

**Obiettivo progressivo:**
- Settimane 1–2: raggiungere i 5.000 passi/giorno
- Settimane 3–4: raggiungere i 7.000 passi/giorno
- Obiettivo finale: 8.000–10.000 passi/giorno

*Una passeggiata di 30 minuti = circa 3.000–4.000 passi aggiuntivi.*`,
    condition: (ctx) => ctx.snapshot.dailySteps < 6000,
  },

  {
    id: "high_activity_compensation",
    title: "Attività Fisica Intensa: Nutrizione di Recupero",
    category: "lifestyle",
    priority: 2,
    content: `Con un lavoro fisicamente impegnativo **e** un programma di allenamento, il dispendio energetico totale è molto elevato. Il rischio principale è la **sotto-alimentazione cronica**.

**Segnali di avvertimento da monitorare:**
- Stanchezza cronica o difficoltà a recuperare tra le sessioni
- Calo della forza o delle prestazioni atletiche
- Irritabilità, difficoltà di concentrazione
- Frequenti malattie o infezioni (sistema immunitario compromesso)

**Strategia nutrizionale:**
- Non ridurre le calorie sotto il target calcolato nei giorni di lavoro fisico pesante
- Garantire un pasto ricco di proteine e carboidrati entro 2 ore dal termine del lavoro
- L'idratazione è critica — perdere anche solo il 2% del peso in acqua riduce le prestazioni del 10–20%`,
    condition: (ctx) =>
      ctx.snapshot.occupationalLevel === "heavy" ||
      ctx.snapshot.occupationalLevel === "very_heavy",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CATEGORY: dietary (3 blocks)
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "allergen_adaptations",
    title: "Adattamenti per Allergie e Intolleranze",
    category: "dietary",
    priority: 1,
    content: `Il piano alimentare è stato adattato per escludere i gruppi allergenici e/o gli alimenti problematici indicati nel questionario. Le sostituzioni proteiche e di macro sono state calcolate per mantenere l'equivalenza nutrizionale.

**Principali sostituzioni alimentari:**
- **Senza latticini:** latte vegetale (soia, avena, mandorla), tofu, tempeh, alternative al formaggio
- **Senza glutine:** riso, patate, quinoa, grano saraceno, mais, avena certificata gluten-free
- **Senza uova:** legumi + cereali, proteine vegetali complete (combinazione complementare)
- **Senza pesce/crostacei:** linee guida sugli omega-3 tramite integratori algali

⚠️ *Leggere sempre le etichette dei prodotti confezionati: anche tracce di allergeni possono essere pericolose in caso di allergie IgE-mediate. In caso di celiachia, verificare la certificazione gluten-free di ogni prodotto.*`,
    condition: (ctx) =>
      (ctx.excludedAllergens !== undefined &&
        ctx.excludedAllergens.length > 0) ||
      (ctx.stileVita?.allergies !== undefined &&
        ctx.stileVita.allergies.length > 0),
  },

  {
    id: "high_protein_rationale",
    title: "Apporto Proteico Elevato: Perché e Come Gestirlo",
    category: "dietary",
    priority: 2,
    content: `Questo piano prevede un **apporto proteico superiore a 2,0 g/kg di peso corporeo** al giorno. Questo livello è supportato da ampie evidenze scientifiche per obiettivi di composizione corporea.

**Perché proteine elevate:**
- Massimizzano la sintesi proteica muscolare (MPS)
- Aumentano il senso di sazietà (effetto termogenico 20–30%)
- Riducono la perdita muscolare durante il deficit calorico
- Supportano il recupero muscolare post-allenamento

**Come raggiungere il target senza difficoltà:**
- Distribuire uniformemente su 4–6 pasti (0,4–0,6 g/kg per pasto)
- Includere una fonte proteica in ogni pasto principale
- Spuntini proteici: yogurt greco, ricotta, uova sode, affettato magro
- Integrare con whey protein se difficile raggiungere il target con soli alimenti interi

**Sicurezza:** livelli fino a 3 g/kg/die sono sicuri in individui sani con funzionalità renale normale.`,
    condition: (ctx) => {
      const proteinPerKg =
        (ctx.avgWeeklyTdeeKcal * 0.3) / 4 / ctx.snapshot.weightKg;
      return proteinPerKg > 2.0;
    },
  },

  {
    id: "carb_cycling_explanation",
    title: "Ciclizzazione dei Carboidrati: Logica del Piano",
    category: "dietary",
    priority: 2,
    content: `Il piano prevede **diversi livelli di apporto calorico e di carboidrati** in base al tipo di giornata. Questa strategia — nota come ciclizzazione dei carboidrati — ottimizza la composizione corporea e la performance atletica.

**Logica della ciclizzazione:**
| Tipo di giornata | Carboidrati | Calorie | Obiettivo |
|-----------------|------------|---------|-----------|
| Allenamento intenso | Alti | Maggiori | Performance + recupero |
| Allenamento leggero | Medi | Standard | Mantenimento glicogeno |
| Riposo | Bassi | Minori | Mobilizzazione del grasso |
| Refeed (se presente) | Molto alti | Alti | Reset ormonale, leptina |

**Come seguire il piano correttamente:**
- Identificare il tipo di giornata prima dei pasti principali
- Non "trasferire" calorie da un giorno all'altro (ogni giornata è indipendente)
- In caso di allenamento pomeridiano, privilegiare i carboidrati a pranzo piuttosto che la mattina`,
    condition: (ctx) => ctx.dayTypes.length > 1,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CATEGORY: disclosure (1 block — always included)
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "mandatory_disclosure",
    title: "Note Importanti e Avvertenze",
    category: "disclosure",
    priority: 1,
    content: `**Questo piano nutrizionale è stato elaborato da Roberto Scrigna, Biologo Nutrizionista, su base delle informazioni fornite dal cliente al momento della valutazione.**

---

**Validità e limiti del piano:**
- Il piano è valido per le condizioni di salute, peso e stile di vita indicati alla data di emissione
- Variazioni significative (>5% del peso corporeo, cambiamenti di allenamento o stile di vita) richiedono una revisione del piano
- Non sostituisce il parere del medico curante per condizioni mediche diagnosticate

**Aggiornamento e check-in:**
- Programmare check-in periodici come indicato nella sezione Monitoraggio
- Segnalare tempestivamente effetti avversi, stanchezza anomala o cali di performance

**Privacy:** i dati personali e le misurazioni sono trattati in conformità al GDPR (Reg. UE 2016/679). Consultare l'informativa privacy completa per i dettagli.

---

*Questo documento è riservato al cliente indicato in copertina e non deve essere condiviso o utilizzato da terzi senza autorizzazione scritta di Roberto Scrigna.*`,
    condition: () => true, // Always included
  },
] as const;
