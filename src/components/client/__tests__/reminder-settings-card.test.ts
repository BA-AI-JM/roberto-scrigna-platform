/**
 * ReminderSettingsForm — static render: pre-filled values, the effective-cadence
 * summary, the accessible switch, and the disabled (reminders-off) state.
 */
import { describe, test, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { ReminderSettingsForm } from "../reminder-settings-card";

const noop = async () => {};

describe("ReminderSettingsForm", () => {
  test("renders pre-filled from the initial settings + plain-Italian cadence", () => {
    const html = renderToStaticMarkup(
      createElement(ReminderSettingsForm, { initial: { checkInEveryDays: 14, bodyCompEveryDays: 28, enabled: true }, onSave: noop })
    );
    expect(html).toContain('value="14"');
    expect(html).toContain('value="28"');
    expect(html).toContain('role="switch"');
    expect(html).toContain('aria-checked="true"');
    expect(html).toContain("Check-in ogni 14 giorni");
    expect(html).toContain("Composizione corporea ogni 28 giorni");
    expect(html).toContain("Salva promemoria");
  });

  test("reflects the disabled state: switch off, inputs inactive, summary off", () => {
    const html = renderToStaticMarkup(
      createElement(ReminderSettingsForm, { initial: { checkInEveryDays: 14, bodyCompEveryDays: 28, enabled: false }, onSave: noop })
    );
    expect(html).toContain('aria-checked="false"');
    expect(html).toContain("disabled"); // the cadence number inputs are disabled
    expect(html).toContain("Promemoria disattivati");
  });
});
