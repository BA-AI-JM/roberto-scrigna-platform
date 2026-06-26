"use client";

/**
 * Integratori (#23) — default-zero supplement editor.
 *
 * Coach picks from the static 71-item library (grouped + searchable), edits
 * dose/timing/notes per patient, adds custom items, applies the core set, and
 * removes. No auto-assignment. Append/edit/remove logic is in the pure helpers;
 * this is the shadcn/ui surface.
 */

import { useMemo, useState } from "react";
import { checkSupplementInteractions } from "@/services/supplements";
import type { SupplementEntry } from "@/pdf/types";
import { SUPPLEMENT_LIBRARY } from "@/data/supplements/library";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  coreSetEntries,
  customEntry,
  libraryItemToEntry,
  filterLibrary,
  groupByMacro,
} from "./supplement-helpers";

const MACROS = groupByMacro([...SUPPLEMENT_LIBRARY]).map((g) => g.macro);

const INTERACTION_COLORS: Record<string, { bg: string; border: string; text: string; label: string }> = {
  warning: { bg: "#fef9c3", border: "#fde047", text: "#854d0e", label: "Attenzione" },
  info: { bg: "#eff6ff", border: "#bfdbfe", text: "#1d4ed8", label: "Timing" },
  synergy: { bg: "#f0fdf4", border: "#bbf7d0", text: "#15803d", label: "Sinergia" },
};

export interface SupplementsEditorProps {
  supplements: SupplementEntry[];
  onUpdate: (index: number, field: keyof SupplementEntry, value: string) => void;
  onRemove: (index: number) => void;
  onAddEntries: (entries: SupplementEntry[]) => void;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

export function SupplementsEditor({
  supplements,
  onUpdate,
  onRemove,
  onAddEntries,
}: SupplementsEditorProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [macro, setMacro] = useState<string>("all");
  const [search, setSearch] = useState("");

  const interactions = checkSupplementInteractions(supplements);

  const groups = useMemo(() => {
    let items = filterLibrary(search);
    if (macro !== "all") items = items.filter((i) => i.macroCategory === macro);
    return groupByMacro(items);
  }, [search, macro]);

  const coreRemaining = coreSetEntries(supplements);

  return (
    <div className="flex flex-col gap-4">
      {/* Interaction / synergy notes */}
      {interactions.length > 0 && (
        <div className="grid gap-2">
          {interactions.map((note, i) => {
            const c = INTERACTION_COLORS[note.severity] ?? INTERACTION_COLORS.info!;
            return (
              <div
                key={i}
                style={{
                  padding: "10px 14px",
                  background: c.bg,
                  border: `1px solid ${c.border}`,
                  borderRadius: "10px",
                  color: c.text,
                  fontSize: "13px",
                  lineHeight: 1.5,
                }}
              >
                <span
                  style={{
                    display: "inline-block",
                    padding: "1px 8px",
                    borderRadius: "10px",
                    background: "#ffffff",
                    fontSize: "11px",
                    fontWeight: 700,
                    marginRight: "8px",
                  }}
                >
                  {c.label}
                </span>
                <span style={{ fontWeight: 600 }}>{note.supplements.join(" + ")}:</span>{" "}
                {note.message}
              </div>
            );
          })}
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => setPickerOpen((o) => !o)}>
          {pickerOpen ? "Chiudi libreria" : "Aggiungi dalla libreria"}
        </Button>
        <Button variant="outline" size="sm" onClick={() => onAddEntries([customEntry()])}>
          Aggiungi personalizzato
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onAddEntries(coreSetEntries(supplements))}
          disabled={coreRemaining.length === 0}
        >
          Set di base
        </Button>
      </div>

      {/* Library picker */}
      {pickerOpen && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Libreria integratori</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap gap-2">
                <div className="min-w-[180px] flex-1">
                  <Input
                    placeholder="Cerca per nome…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <Select value={macro} onValueChange={setMacro}>
                  <SelectTrigger className="w-[230px]">
                    <SelectValue placeholder="Categoria" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tutte le categorie</SelectItem>
                    {MACROS.map((m) => (
                      <SelectItem key={m} value={m}>
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex max-h-80 flex-col gap-3 overflow-y-auto">
                {groups.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nessun integratore trovato.</p>
                ) : (
                  groups.map((g) => (
                    <div key={g.macro}>
                      <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
                        {g.macro}
                      </div>
                      <div className="flex flex-col gap-2">
                        {g.items.map((item) => (
                          <div
                            key={item.id}
                            className="flex items-start justify-between gap-3 rounded-lg border p-2"
                          >
                            <div className="flex flex-col">
                              <span className="text-sm font-semibold">{item.name}</span>
                              {item.brandExample && (
                                <span className="text-xs text-muted-foreground">
                                  {item.brandExample}
                                </span>
                              )}
                              <span className="text-xs text-muted-foreground">
                                {item.dose || "Dose da specificare"} · {item.timing}
                              </span>
                              <span className="text-xs italic text-muted-foreground">
                                {item.italianNotes}
                              </span>
                            </div>
                            <Button
                              size="sm"
                              onClick={() => onAddEntries([libraryItemToEntry(item)])}
                            >
                              Aggiungi
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Items / empty state */}
      {supplements.length === 0 ? (
        <Card>
          <CardContent className="py-6">
            <p className="text-sm text-muted-foreground">
              Nessun integratore — aggiungi dalla libreria o crea un integratore
              personalizzato.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {supplements.map((s, i) => (
            <Card key={i}>
              <CardContent className="pt-4">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span
                    className="rounded-full px-2 py-0.5 text-xs font-semibold"
                    style={
                      s.isCustom
                        ? { background: "#fef3c7", color: "#92400e" }
                        : { background: "#dbeafe", color: "#1d4ed8" }
                    }
                  >
                    {s.isCustom ? "Personalizzato" : "Libreria"}
                  </span>
                  <Button variant="ghost" size="sm" onClick={() => onRemove(i)}>
                    Rimuovi
                  </Button>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label="Nome">
                    <Input
                      value={s.name}
                      onChange={(e) => onUpdate(i, "name", e.target.value)}
                      placeholder="Nome integratore"
                    />
                  </Field>
                  <Field label="Dose">
                    <Input
                      value={s.dosage}
                      onChange={(e) => onUpdate(i, "dosage", e.target.value)}
                      placeholder={s.dosage === "" ? "Dose da specificare" : "Dose"}
                    />
                  </Field>
                  <Field label="Timing">
                    <Input
                      value={s.timing}
                      onChange={(e) => onUpdate(i, "timing", e.target.value)}
                      placeholder="es. con i pasti"
                    />
                  </Field>
                  <Field label="Note">
                    <Input
                      value={s.notes ?? ""}
                      onChange={(e) => onUpdate(i, "notes", e.target.value)}
                      placeholder="Note per il paziente"
                    />
                  </Field>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

export default SupplementsEditor;
