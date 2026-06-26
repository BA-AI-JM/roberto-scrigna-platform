/**
 * #21 — portion-adjustment dropdown with the PR #23 magnitude options enabled.
 * The DOM interaction isn't mountable in the node env, so the "selecting →
 * mutation payload" contract is covered by resolveAdjustArgs.
 */

import { describe, test, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import {
  PortionAdjustMenu,
  PORTION_ADJUST_OPTIONS,
  ADJUST_TO_TARGET,
  resolveAdjustArgs,
} from "../portion-adjust-menu";

const CTX = { planId: "11111111-1111-1111-1111-111111111111", dayType: "training" };

describe("PORTION_ADJUST_OPTIONS", () => {
  test("offers four options: target + three relative magnitudes", () => {
    expect(PORTION_ADJUST_OPTIONS.map((o) => o.value)).toEqual([
      ADJUST_TO_TARGET,
      "increase-10",
      "increase-25",
      "decrease-10",
    ]);
  });
});

describe("resolveAdjustArgs — selecting maps to the adjustPortions payload", () => {
  test("target sends the exact original payload (no mode/scalePct)", () => {
    expect(resolveAdjustArgs(ADJUST_TO_TARGET, CTX)).toEqual({
      planId: CTX.planId,
      dayType: CTX.dayType,
    });
  });

  test("relative options send mode:'relative' + the right scalePct", () => {
    expect(resolveAdjustArgs("increase-10", CTX)).toEqual({
      planId: CTX.planId,
      dayType: CTX.dayType,
      mode: "relative",
      scalePct: 10,
    });
    expect(resolveAdjustArgs("increase-25", CTX)).toEqual({
      planId: CTX.planId,
      dayType: CTX.dayType,
      mode: "relative",
      scalePct: 25,
    });
    expect(resolveAdjustArgs("decrease-10", CTX)).toEqual({
      planId: CTX.planId,
      dayType: CTX.dayType,
      mode: "relative",
      scalePct: -10,
    });
  });

  test("unknown value resolves to null (never fires)", () => {
    expect(resolveAdjustArgs("nope", CTX)).toBeNull();
  });
});

describe("PortionAdjustMenu render", () => {
  test("renders the action-menu placeholder", () => {
    const html = renderToStaticMarkup(
      createElement(PortionAdjustMenu, {
        planId: CTX.planId,
        dayType: CTX.dayType,
        pending: false,
        onAdjust: () => {},
      })
    );
    expect(html).toContain("Aggiusta porzioni");
  });

  test("shows the pending label while a mutation is in flight", () => {
    const html = renderToStaticMarkup(
      createElement(PortionAdjustMenu, {
        planId: CTX.planId,
        dayType: CTX.dayType,
        pending: true,
        onAdjust: () => {},
      })
    );
    expect(html).toContain("Aggiustando…");
  });
});
