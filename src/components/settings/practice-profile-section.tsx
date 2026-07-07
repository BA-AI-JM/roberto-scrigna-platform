"use client";

/**
 * #29 — Practice-profile settings. Roberto enters his practice details ONCE here
 * ("Dati professionali / Studio" on /settings) and every engagement letter
 * auto-fills them. 19 fields in 6 labelled groups, loaded via getPracticeProfile
 * and saved via updatePracticeProfile (through the practice-profile data seam —
 * one-line swap once PR #72 merges). Matches the existing /settings section UX.
 */

import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  fetchPracticeProfile, savePracticeProfile, PRACTICE_GROUPS, PRACTICE_FIELDS,
  type PracticeProfile, type PracticeField,
} from "@/lib/practice-profile/practice-profile-adapter";

type FormState = Record<PracticeField, string>;
const emptyForm = (): FormState =>
  Object.fromEntries(PRACTICE_FIELDS.map((k) => [k, ""])) as FormState;

const inputCls =
  "w-full rounded-lg border border-zinc-300 bg-white px-4 py-3 text-sm text-ink outline-none focus:border-brand focus:ring-1 focus:ring-brand";

export function PracticeProfileSection() {
  const query = useQuery({ queryKey: ["practiceProfile"], queryFn: fetchPracticeProfile, retry: false, refetchOnWindowFocus: false });
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saved, setSaved] = useState(false);

  // Hydrate the form when the profile loads (all-null → empty fields, no error).
  useEffect(() => {
    if (!query.data) return;
    const next = emptyForm();
    for (const k of PRACTICE_FIELDS) next[k] = (query.data as PracticeProfile)[k] ?? "";
    setForm(next);
  }, [query.data]);

  const save = useMutation({
    mutationFn: (f: FormState) => savePracticeProfile(f as Partial<PracticeProfile>),
    onSuccess: () => {
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      void query.refetch();
    },
  });

  const set = (k: PracticeField, v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    if (saved) setSaved(false);
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    save.mutate(form);
  };

  return (
    <section className="rounded-xl border-[0.5px] border-zinc-200 bg-white">
      <div className="border-b border-zinc-200 px-6 py-4">
        <h2 className="text-base font-medium text-ink">Dati professionali / Studio</h2>
        <p className="mt-0.5 text-xs text-zinc-500">
          Inseriti una volta, compilano automaticamente ogni lettera d&apos;incarico.
        </p>
      </div>

      {query.isLoading ? (
        <div className="space-y-3 px-6 py-6">
          <div className="h-4 w-40 animate-pulse rounded bg-zinc-100" />
          <div className="h-24 animate-pulse rounded-lg bg-zinc-100" />
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-7 px-6 py-6">
          {PRACTICE_GROUPS.map((group) => (
            <fieldset key={group.title}>
              <legend className="mb-3 text-sm font-medium text-brand-deep">{group.title}</legend>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {group.fields.map((f) => (
                  <div key={f.key} className={f.wide ? "sm:col-span-2" : undefined}>
                    <label htmlFor={`pp-${f.key}`} className="mb-1 block text-sm font-medium text-zinc-700">
                      {f.label}
                    </label>
                    <input
                      id={`pp-${f.key}`}
                      type="text"
                      value={form[f.key]}
                      onChange={(e) => set(f.key, e.target.value)}
                      placeholder={f.placeholder}
                      className={inputCls}
                    />
                  </div>
                ))}
              </div>
            </fieldset>
          ))}

          {saved && (
            <div role="status" className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
              Salvato.
            </div>
          )}
          {save.isError && (
            <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              Salvataggio non riuscito. Riprova.
            </div>
          )}

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={save.isPending}
              className="rounded-lg bg-brand px-5 py-2.5 text-sm font-medium text-white transition-[filter] hover:bg-brand-deep disabled:cursor-not-allowed disabled:opacity-50"
            >
              {save.isPending ? "Salvataggio…" : "Salva dati professionali"}
            </button>
            <span className="text-xs text-zinc-400">Le lettere useranno questi valori; i campi vuoti restano segnaposto.</span>
          </div>
        </form>
      )}
    </section>
  );
}
