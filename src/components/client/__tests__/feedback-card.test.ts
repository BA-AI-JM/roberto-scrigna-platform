/**
 * #2 Stage-1 — FeedbackCard (latest completed check-in shown first).
 */

import { describe, test, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { FeedbackCard, type FeedbackCheckin } from "../feedback-card";

const CHECKIN: FeedbackCheckin = {
  id: "c1",
  ai_summary: "Peso 78kg (+2kg) · ⚠️ Energia bassa · ✅ Buoni progressi",
  weight_kg: 78,
  weight_deviation_kg: 2,
  energy_level: 2,
  sleep_quality: 3,
  adherence_pct: 85,
  completed_at: "2026-06-20T10:00:00Z",
  created_at: "2026-06-20T09:00:00Z",
};

describe("FeedbackCard", () => {
  test("renders the latest check-in summary + metrics", () => {
    const html = renderToStaticMarkup(createElement(FeedbackCard, { checkin: CHECKIN }));
    expect(html).toContain("Ultimo feedback");
    expect(html).toContain("Buoni progressi"); // ai_summary
    expect(html).toContain("78 kg");
    expect(html).toContain("(+2)"); // weight deviation
    expect(html).toContain("Energia");
    expect(html).toContain("Aderenza");
    expect(html).toContain("85%");
  });

  test("renders coach review_notes when present (Stage-2 getLatestCompleted)", () => {
    const html = renderToStaticMarkup(
      createElement(FeedbackCard, {
        checkin: { ...CHECKIN, review_notes: "Aumentare i carboidrati nei giorni ON." },
      })
    );
    expect(html).toContain("Note del coach");
    expect(html).toContain("Aumentare i carboidrati nei giorni ON.");
  });

  test("renders an empty state when there is no completed check-in", () => {
    const html = renderToStaticMarkup(createElement(FeedbackCard, { checkin: null }));
    expect(html).toContain("Ultimo feedback");
    expect(html).toContain("Nessun check-in completato");
  });

  test("omits the deviation suffix when deviation is zero/absent", () => {
    const html = renderToStaticMarkup(
      createElement(FeedbackCard, {
        checkin: { ...CHECKIN, weight_deviation_kg: 0 },
      })
    );
    expect(html).toContain("78 kg");
    expect(html).not.toContain("(+0)");
  });
});
