/**
 * Legal document templates + content hashing (Requirement #29, Stage 1).
 *
 * #29 is Tier 2: the app GENERATES and VERSIONS the engagement letter; the
 * actual signing is delegated to an eIDAS e-signature provider in a later stage
 * (see src/server/esign/provider.ts). This module holds the canonical
 * engagement-letter template (the seed for v1), derived from Roberto's real
 * IT-03 "Lettera di Incarico Professionale".
 *
 * Two kinds of gap in the template:
 *   - `{{merge_token}}` — auto-filled per client at generation time (patient and
 *     professional details). See MERGE_TOKENS.
 *   - `[PLACEHOLDER: ...]` — Roberto's own legal fields he must supply ONCE; they
 *     are baked into the published template version (Albo number, P.IVA, studio
 *     address, fees, etc.). Flagged so the gaps are explicit until he provides them.
 *
 * Publishing flows through `legal.createVersion` / `legal.seedDefaultEngagementLetter`
 * so `content_hash` is always computed by `hashDocumentBody` (one place, SHA-256
 * over the TEMPLATE body — not the per-client filled letter).
 */

import { createHash } from "node:crypto";

/** SHA-256 (hex) of a template body — the single source of the content hash. */
export function hashDocumentBody(body: string): string {
  return createHash("sha256").update(body, "utf8").digest("hex");
}

/**
 * Auto-filled merge tokens (the `{{...}}` slots filled at generation).
 *  - client_* / professional_name / generated_date: per-client + per-letter values.
 *  - the rest are the practitioner PRACTICE-PROFILE fields (#29): Roberto enters
 *    them once in settings and every letter fills them (partner_practice_profile).
 * An empty value renders as "[DA COMPLETARE: <label>]" (see MERGE_TOKEN_LABELS).
 */
export const MERGE_TOKENS = [
  // per-client / per-letter
  "client_full_name",
  "client_codice_fiscale",
  "client_residence",
  "professional_name",
  "generated_date",
  // practitioner practice profile
  "professione",
  "albo_ordine",
  "albo_number",
  "partita_iva",
  "codice_fiscale",
  "studio_address",
  "delivery_mode",
  "plan_delivery_days",
  "cadenza",
  "fee_importo",
  "cassa_iva",
  "fee_articolazione",
  "payment_metodo",
  "payment_termine",
  "durata",
  "cancellation_notice_hours",
  "penale",
  "numero_polizza",
  "assicuratore",
  "foro",
] as const;

export type MergeToken = (typeof MERGE_TOKENS)[number];

/**
 * Human labels for each token — used both to render an unfilled slot as a clear
 * "[DA COMPLETARE: <label>]" gap and by the settings UI for the practice-profile
 * form. The practitioner-detail labels are the field names the frontend renders.
 */
export const MERGE_TOKEN_LABELS: Record<MergeToken, string> = {
  client_full_name: "Nome cliente",
  client_codice_fiscale: "Codice Fiscale cliente",
  client_residence: "Residenza cliente",
  professional_name: "Nome professionista",
  generated_date: "Data",
  professione: "Professione (es. Biologo Nutrizionista / Dietista)",
  albo_ordine: "Albo/Ordine di iscrizione",
  albo_number: "Numero di iscrizione all'Albo",
  partita_iva: "Partita IVA",
  codice_fiscale: "Codice Fiscale professionista",
  studio_address: "Indirizzo dello studio",
  delivery_mode: "Modalità di svolgimento (studio / da remoto / piattaforma)",
  plan_delivery_days: "Giorni per la consegna del piano",
  cadenza: "Cadenza dei controlli",
  fee_importo: "Compenso (€)",
  cassa_iva: "Cassa previdenziale / IVA",
  fee_articolazione: "Articolazione del compenso",
  payment_metodo: "Metodo di pagamento",
  payment_termine: "Termine di pagamento",
  durata: "Durata dell'incarico",
  cancellation_notice_hours: "Preavviso di disdetta (ore)",
  penale: "Penale per mancata disdetta",
  numero_polizza: "Numero polizza RC professionale",
  assicuratore: "Compagnia assicurativa",
  foro: "Foro competente",
};

/** Seed content for the v1 engagement letter (IT-03 template; tokens + placeholders). */
export const ENGAGEMENT_LETTER_IT = {
  docKind: "engagement_letter" as const,
  name: "Lettera di Incarico Professionale",
  language: "it",
  versionLabel: "v1",
  bodyMd: `# Lettera di Incarico Professionale
### Contratto di prestazione d'opera intellettuale (artt. 2229 e ss. c.c.)

**Tra**

**{{professional_name}}**, {{professione}}, iscritto/a all'Albo/Ordine {{albo_ordine}} n. {{albo_number}}, P.IVA {{partita_iva}}, C.F. {{codice_fiscale}}, con studio in {{studio_address}} (di seguito il "**Professionista**")

**e**

**{{client_full_name}}**, C.F. {{client_codice_fiscale}}, residente in {{client_residence}} (di seguito il "**Cliente**")

si conviene e si stipula quanto segue.

---

## 1. Oggetto dell'incarico
Il Cliente conferisce al Professionista l'incarico di erogare la seguente prestazione: valutazione nutrizionale, elaborazione di piano alimentare personalizzato, sedute di monitoraggio e follow-up, educazione alimentare.

## 2. Modalità di svolgimento
La prestazione sarà svolta presso {{delivery_mode}}, con il seguente percorso: prima valutazione, consegna del piano entro {{plan_delivery_days}} giorni, controlli con cadenza {{cadenza}}. Il Professionista opera con diligenza professionale (art. 1176 c.c.), restando l'obbligazione di **mezzi e non di risultato**.

## 3. Limiti della prestazione e rapporto con la professione medica
La prestazione **non costituisce atto medico**. Il Professionista **non formula diagnosi di patologie né prescrive terapie farmacologiche**. In presenza di condizioni patologiche, l'intervento nutrizionale sarà effettuato esclusivamente **nell'ambito di un inquadramento medico** e/o previo invito al Cliente a consultare il proprio medico. Il Cliente si impegna a segnalare patologie, terapie, allergie e intolleranze.

## 4. Obblighi del Cliente
Il Cliente si impegna a: fornire informazioni veritiere e complete sul proprio stato di salute; seguire le indicazioni concordate; comunicare tempestivamente variazioni dello stato di salute; corrispondere il compenso pattuito.

## 5. Compenso e modalità di pagamento
Il compenso è pari a € {{fee_importo}} [per il percorso / per seduta], oltre oneri di legge ed eventuale {{cassa_iva}}, così articolato: {{fee_articolazione}}. Pagamento mediante {{payment_metodo}} entro {{payment_termine}}. Il Professionista emette regolare fattura.

## 6. Durata, disdetta e recesso
L'incarico ha durata {{durata}}. Gli appuntamenti possono essere disdetti con preavviso di {{cancellation_notice_hours}} ore; in difetto è dovuto {{penale}}. Ciascuna parte può recedere ai sensi dell'art. 2237 c.c.; in caso di recesso del Cliente è dovuto il compenso per l'attività svolta e le spese sostenute.

## 7. Riservatezza e protezione dei dati
Il Professionista tratta i dati del Cliente, inclusi i dati relativi alla salute, nel rispetto del GDPR e del Codice Privacy, secondo l'**Informativa** e i **Consensi** che costituiscono parte integrante del presente incarico. Il Professionista è tenuto al **segreto professionale**.

## 8. Responsabilità
Il Professionista risponde nei limiti di legge per l'attività svolta con la dovuta diligenza. È esclusa ogni responsabilità per danni derivanti da informazioni incomplete o non veritiere fornite dal Cliente o dalla mancata osservanza delle indicazioni. Il Professionista dichiara di essere coperto da **polizza di responsabilità professionale n. {{numero_polizza}}** presso {{assicuratore}}.

## 9. Proprietà dei materiali
I piani alimentari e i materiali elaborati sono destinati all'uso personale del Cliente e non possono essere ceduti o divulgati a terzi senza autorizzazione del Professionista.

## 10. Legge applicabile e foro competente
Il presente contratto è regolato dalla **legge italiana**. Per ogni controversia è competente in via esclusiva il Foro di {{foro}} [salvo foro del consumatore ove applicabile ex art. 66-bis Codice del Consumo].

## 11. Clausole finali
Eventuali modifiche dovranno essere concordate per iscritto. Per quanto non previsto si rinvia al Codice Civile e alla normativa deontologica applicabile.

---

Luogo e data: {{generated_date}}

*Ai sensi degli artt. 1341–1342 c.c., il Cliente approva specificamente le clausole: 2 (obbligazione di mezzi), 3 (limiti), 6 (recesso/disdetta), 8 (responsabilità), 10 (foro competente).*

*Documento da sottoscrivere tramite firma elettronica (eIDAS).*`,
} as const;
