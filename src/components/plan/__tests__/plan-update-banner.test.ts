/**
 * #25 UI surfacing — PlanUpdateBanner + its pure matchers. Covers the
 * notification→plan matching (unread + metadata.planId), the kcal-percent and
 * next-version formatting, and the SSR-rendered banner (shows when a suggestion
 * matches, hidden otherwise).
 */

import { describe, test, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import {
  PlanUpdateBanner,
  findPlanUpdateSuggestion,
  formatKcalReductionPct,
  suggestedNextVersionLabel,
  type PlanNotificationLite,
  type PlanUpdateSuggestion,
} from "../plan-update-banner";

const PLAN_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_PLAN = "22222222-2222-4222-8222-222222222222";

const suggested = (over: Partial<PlanNotificationLite> = {}): PlanNotificationLite => ({
  id: "n1",
  trigger: "plan_update_suggested",
  read: false,
  metadata: { planId: PLAN_ID, clientId: "c1", weightChangePct: -0.11, suggestedKcalReductionPct: -0.085 },
  ...over,
});

describe("findPlanUpdateSuggestion (#25)", () => {
  test("matches an unread suggestion for this plan and converts the pct", () => {
    const res = findPlanUpdateSuggestion([suggested()], PLAN_ID);
    expect(res).toEqual<PlanUpdateSuggestion>({
      notificationId: "n1",
      planId: PLAN_ID,
      kcalReductionPct: 8.5,
    });
  });

  test("ignores notifications for a different plan", () => {
    expect(findPlanUpdateSuggestion([suggested()], OTHER_PLAN)).toBeNull();
  });

  test("ignores read notifications", () => {
    expect(findPlanUpdateSuggestion([suggested({ read: true })], PLAN_ID)).toBeNull();
  });

  test("ignores other triggers", () => {
    expect(
      findPlanUpdateSuggestion([suggested({ trigger: "weight_deviation" })], PLAN_ID)
    ).toBeNull();
  });

  test("no notifications / blank planId → null", () => {
    expect(findPlanUpdateSuggestion(undefined, PLAN_ID)).toBeNull();
    expect(findPlanUpdateSuggestion([suggested()], "")).toBeNull();
  });

  test("missing suggestedKcalReductionPct defaults to 0%", () => {
    const res = findPlanUpdateSuggestion(
      [suggested({ metadata: { planId: PLAN_ID } })],
      PLAN_ID
    );
    expect(res?.kcalReductionPct).toBe(0);
  });
});

describe("formatters (#25)", () => {
  test("formatKcalReductionPct trims trailing zeros", () => {
    expect(formatKcalReductionPct(8.5)).toBe("8.5");
    expect(formatKcalReductionPct(8)).toBe("8");
    expect(formatKcalReductionPct(8.49)).toBe("8.5");
  });

  test("suggestedNextVersionLabel counts the chain (original → v1.1)", () => {
    expect(suggestedNextVersionLabel(1)).toBe("v1.1");
    expect(suggestedNextVersionLabel(2)).toBe("v1.2");
    expect(suggestedNextVersionLabel(0)).toBe("v1.1");
  });
});

describe("PlanUpdateBanner render (#25)", () => {
  const sugg: PlanUpdateSuggestion = { notificationId: "n1", planId: PLAN_ID, kcalReductionPct: 8.5 };

  test("renders the suggestion copy + regenerate button when a suggestion exists", () => {
    const html = renderToStaticMarkup(
      createElement(PlanUpdateBanner, {
        suggestion: sugg,
        nextVersionLabel: "v1.1",
        onRegenerate: () => {},
      })
    );
    expect(html).toContain("Aggiornamento piano suggerito");
    expect(html).toContain("ridurre kcal ~8.5%");
    expect(html).toContain("rigenerare (v1.1)");
    expect(html).toContain("Rigenera (v1.1)");
    expect(html).toContain("plan-update-banner");
  });

  test("renders nothing when there is no suggestion", () => {
    const html = renderToStaticMarkup(
      createElement(PlanUpdateBanner, {
        suggestion: null,
        nextVersionLabel: "v1.1",
        onRegenerate: () => {},
      })
    );
    expect(html).toBe("");
  });

  test("regenerate button reflects the pending state", () => {
    const html = renderToStaticMarkup(
      createElement(PlanUpdateBanner, {
        suggestion: sugg,
        nextVersionLabel: "v1.1",
        isRegenerating: true,
        onRegenerate: () => {},
      })
    );
    expect(html).toContain("Rigenerazione…");
    expect(html).toContain("disabled");
  });

  test("onRegenerate is the wired handler (smoke)", () => {
    // The button's onClick is onRegenerate; SSR can't click, but assert the prop
    // is accepted and the banner renders an enabled button by default.
    const onRegenerate = vi.fn();
    const html = renderToStaticMarkup(
      createElement(PlanUpdateBanner, { suggestion: sugg, nextVersionLabel: "v1.1", onRegenerate })
    );
    expect(html).not.toContain("disabled");
    expect(onRegenerate).not.toHaveBeenCalled();
  });
});
