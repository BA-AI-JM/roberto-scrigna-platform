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

/** Auto-filled merge tokens (the `{{...}}` slots filled per client at generation). */
export const MERGE_TOKENS = [
  "client_full_name",
  "client_codice_fiscale",
  "client_residence",
  "professional_name",
  "generated_date",
] as const;

export type MergeToken = (typeof MERGE_TOKENS)[number];

/** Seed content for the v1 engagement letter (IT-03 template; tokens + placeholders). */
export const ENGAGEMENT_LETTER_IT = {
  docKind: "engagement_letter" as const,
  name: "Lettera di Incarico Professionale",
  language: "it",
  versionLabel: "v1",
  bodyMd: `# Lettera di Incarico Professionale
### Contratto di prestazione d'opera intellettuale (artt. 2229 e ss. c.c.)

**Tra**

**{{professional_name}}**, [PLACEHOLDER: biologo nutrizionista / dietista], iscritto/a all'Albo/Ordine [PLACEHOLDER: ordine] n. [PLACEHOLDER: numero iscrizione], P.IVA [PLACEHOLDER: partita IVA], con studio in [PLACEHOLDER: indirizzo studio] (di seguito il "**Professionista**")

**e**

**{{client_full_name}}**, C.F. {{client_codice_fiscale}}, residente in {{client_residence}} (di seguito il "**Cliente**")

si conviene e si stipula quanto segue.

---

## 1. Oggetto dell'incarico
Il Cliente conferisce al Professionista l'incarico di erogare la seguente prestazione: valutazione nutrizionale, elaborazione di piano alimentare personalizzato, sedute di monitoraggio e follow-up, educazione alimentare.

## 2. Modalità di svolgimento
La prestazione sarà svolta presso [PLACEHOLDER: studio / da remoto / piattaforma/app], con il seguente percorso: prima valutazione, consegna del piano entro [PLACEHOLDER: N] giorni, controlli con cadenza [PLACEHOLDER: cadenza]. Il Professionista opera con diligenza professionale (art. 1176 c.c.), restando l'obbligazione di **mezzi e non di risultato**.

## 3. Limiti della prestazione e rapporto con la professione medica
La prestazione **non costituisce atto medico**. Il Professionista **non formula diagnosi di patologie né prescrive terapie farmacologiche**. In presenza di condizioni patologiche, l'intervento nutrizionale sarà effettuato esclusivamente **nell'ambito di un inquadramento medico** e/o previo invito al Cliente a consultare il proprio medico. Il Cliente si impegna a segnalare patologie, terapie, allergie e intolleranze.

## 4. Obblighi del Cliente
Il Cliente si impegna a: fornire informazioni veritiere e complete sul proprio stato di salute; seguire le indicazioni concordate; comunicare tempestivamente variazioni dello stato di salute; corrispondere il compenso pattuito.

## 5. Compenso e modalità di pagamento
Il compenso è pari a € [PLACEHOLDER: importo] [per il percorso / per seduta], oltre oneri di legge ed eventuale [PLACEHOLDER: cassa/IVA], così articolato: [PLACEHOLDER: articolazione]. Pagamento mediante [PLACEHOLDER: metodo] entro [PLACEHOLDER: termine]. Il Professionista emette regolare fattura.

## 6. Durata, disdetta e recesso
L'incarico ha durata [PLACEHOLDER: durata]. Gli appuntamenti possono essere disdetti con preavviso di [PLACEHOLDER: N] ore; in difetto è dovuto [PLACEHOLDER: penale]. Ciascuna parte può recedere ai sensi dell'art. 2237 c.c.; in caso di recesso del Cliente è dovuto il compenso per l'attività svolta e le spese sostenute.

## 7. Riservatezza e protezione dei dati
Il Professionista tratta i dati del Cliente, inclusi i dati relativi alla salute, nel rispetto del GDPR e del Codice Privacy, secondo l'**Informativa** e i **Consensi** che costituiscono parte integrante del presente incarico. Il Professionista è tenuto al **segreto professionale**.

## 8. Responsabilità
Il Professionista risponde nei limiti di legge per l'attività svolta con la dovuta diligenza. È esclusa ogni responsabilità per danni derivanti da informazioni incomplete o non veritiere fornite dal Cliente o dalla mancata osservanza delle indicazioni. Il Professionista dichiara di essere coperto da **polizza di responsabilità professionale n. [PLACEHOLDER: numero polizza]** presso [PLACEHOLDER: assicuratore].

## 9. Proprietà dei materiali
I piani alimentari e i materiali elaborati sono destinati all'uso personale del Cliente e non possono essere ceduti o divulgati a terzi senza autorizzazione del Professionista.

## 10. Legge applicabile e foro competente
Il presente contratto è regolato dalla **legge italiana**. Per ogni controversia è competente in via esclusiva il Foro di [PLACEHOLDER: foro] [salvo foro del consumatore ove applicabile ex art. 66-bis Codice del Consumo].

## 11. Clausole finali
Eventuali modifiche dovranno essere concordate per iscritto. Per quanto non previsto si rinvia al Codice Civile e alla normativa deontologica applicabile.

---

Luogo e data: {{generated_date}}

*Ai sensi degli artt. 1341–1342 c.c., il Cliente approva specificamente le clausole: 2 (obbligazione di mezzi), 3 (limiti), 6 (recesso/disdetta), 8 (responsabilità), 10 (foro competente).*

*Documento da sottoscrivere tramite firma elettronica (eIDAS).*`,
} as const;
