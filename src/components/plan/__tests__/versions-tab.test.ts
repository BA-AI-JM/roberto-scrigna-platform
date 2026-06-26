import { describe, test, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { VersionsTab } from "../versions-tab";
import {
  statusLabel,
  buildCreateVersionInput,
  resolveRootPlanId,
  type PlanVersion,
} from "../version-helpers";

const versions: PlanVersion[] = [
  { id: "p2", versionLabel: "v2", status: "active", changeReason: "nuovo blocco", parentPlanId: "p1", createdAt: "2026-06-20T10:00:00Z" },
  { id: "p1b", versionLabel: "v1.1", status: "archived", changeReason: null, parentPlanId: "p1", createdAt: "2026-06-10T10:00:00Z" },
  { id: "p1", versionLabel: "v1", status: "archived", changeReason: null, parentPlanId: null, createdAt: "2026-06-01T10:00:00Z" },
];

describe("version-helpers", () => {
  test("statusLabel → Italian labels", () => {
    expect(statusLabel("active").label).toBe("Attivo");
    expect(statusLabel("archived").label).toBe("Archiviato");
    expect(statusLabel("draft").label).toBe("Bozza");
    expect(statusLabel("completed").label).toBe("Completato");
  });

  test("buildCreateVersionInput omits a blank reason (this is the createVersion payload)", () => {
    expect(buildCreateVersionInput("p1", "più proteine")).toEqual({ planId: "p1", changeReason: "più proteine" });
    expect(buildCreateVersionInput("p1", "  ")).toEqual({ planId: "p1" });
    expect(buildCreateVersionInput("p1", "")).toEqual({ planId: "p1" });
  });

  test("resolveRootPlanId: child → reroot to parent; root → null", () => {
    expect(resolveRootPlanId([{ id: "p2", parentPlanId: "p1" }], "p2")).toBe("p1");
    expect(resolveRootPlanId([{ id: "p1", parentPlanId: null }], "p1")).toBeNull();
    expect(resolveRootPlanId(versions, "p1")).toBeNull(); // p1 is root
  });
});

describe("VersionsTab render (node, renderToStaticMarkup)", () => {
  const noop = () => {};

  test("renders version labels + Italian status badges + regenerate button", () => {
    const html = renderToStaticMarkup(
      createElement(VersionsTab, {
        versions,
        loading: false,
        currentPlanId: "p2",
        isRegenerating: false,
        regenerateError: null,
        onRegenerate: noop,
        onOpenVersion: noop,
      })
    );
    expect(html).toContain("v2");
    expect(html).toContain("v1.1");
    expect(html).toContain("Attivo");
    expect(html).toContain("Archiviato");
    expect(html).toContain("Rigenera come nuova versione");
    expect(html).toContain("nuovo blocco"); // change_reason rendered
  });

  test("loading and empty states", () => {
    const loading = renderToStaticMarkup(
      createElement(VersionsTab, {
        versions: [], loading: true, currentPlanId: "x",
        isRegenerating: false, regenerateError: null, onRegenerate: noop, onOpenVersion: noop,
      })
    );
    expect(loading).toContain("Caricamento");

    const empty = renderToStaticMarkup(
      createElement(VersionsTab, {
        versions: [], loading: false, currentPlanId: "x",
        isRegenerating: false, regenerateError: null, onRegenerate: noop, onOpenVersion: noop,
      })
    );
    expect(empty).toContain("Nessuna versione");
  });

  test("regenerating state disables/relabels the button; error renders", () => {
    const html = renderToStaticMarkup(
      createElement(VersionsTab, {
        versions, loading: false, currentPlanId: "p2",
        isRegenerating: true, regenerateError: "Errore engine", onRegenerate: noop, onOpenVersion: noop,
      })
    );
    expect(html).toContain("Rigenerazione…");
    expect(html).toContain("Errore engine");
  });
});
