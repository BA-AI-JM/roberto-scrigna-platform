/**
 * Urgent-feedback form + list — static render (initial state, hidden injury
 * fields, the not-a-chat copy, past-submissions list + empty state).
 */
import { describe, test, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { UrgentFeedbackForm, UrgentSubmissionsList } from "../urgent-feedback-form";
import type { UrgentSubmission } from "@/lib/feedback/types";

const noop = async () => {};

describe("UrgentFeedbackForm (initial)", () => {
  test("renders the kind selector + message, with injury fields hidden for feedback", () => {
    const html = renderToStaticMarkup(createElement(UrgentFeedbackForm, { onSubmit: noop }));
    expect(html).toContain("Di cosa si tratta?");
    expect(html).toContain("Feedback urgente");
    expect(html).toContain("Infortunio");
    expect(html).toContain("Descrivi la situazione");
    expect(html).toContain("Invia al coach");
    expect(html).toContain("Non è una chat"); // sets the right expectation
    expect(html).not.toContain("Zona interessata"); // injury fields hidden until 'infortunio'
  });
});

describe("UrgentSubmissionsList", () => {
  const subs: UrgentSubmission[] = [
    { id: "s1", kind: "infortunio", message: "Dolore al ginocchio", status: "aperto", createdAt: "2026-06-20T10:00:00Z", injury: { area: "ginocchio destro", severity: "moderata", onsetDate: "2026-06-20" } },
    { id: "s2", kind: "feedback", message: "Tutto ok ma stanco", status: "gestito", createdAt: "2026-06-10T10:00:00Z" },
  ];

  test("renders past submissions with status badges + injury summary", () => {
    const html = renderToStaticMarkup(createElement(UrgentSubmissionsList, { submissions: subs, loading: false, error: false }));
    expect(html).toContain("Le tue segnalazioni");
    expect(html).toContain("Dolore al ginocchio");
    expect(html).toContain("Aperto");
    expect(html).toContain("Gestito");
    expect(html).toContain("ginocchio destro");
    expect(html).toContain("Moderata");
  });

  test("renders the warm empty state", () => {
    const html = renderToStaticMarkup(createElement(UrgentSubmissionsList, { submissions: [], loading: false, error: false }));
    expect(html).toContain("Nessuna segnalazione");
  });
});
