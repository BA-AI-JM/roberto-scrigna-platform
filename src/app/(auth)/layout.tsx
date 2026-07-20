/**
 * Auth shell — T3 Wave A (concept 5, operator-approved).
 * Split identity layout: atmospheric practice panel left (lg+), form column right.
 * Both themes resolve from the semantic tokens; the left panel is deliberately
 * theme-invariant (the practice's deep-teal atmosphere is the brand moment).
 * Photography slot: the panel background upgrades to studio-light imagery when
 * Roberto's assets land (HITL Q8) — the gradient carries it until then.
 */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <aside
        className="relative hidden flex-col justify-between p-12 text-[#EDF5F0] lg:flex"
        style={{
          background:
            "radial-gradient(120% 90% at 20% 0%, #22453A 0%, #17332B 45%, #10241E 100%)",
        }}
      >
        <div className="font-display text-[21px] font-semibold">Scrigna</div>
        <blockquote className="font-display max-w-[420px] text-[32px] font-medium italic leading-[1.35]">
          «Ogni numero che vedi qui dentro è passato dal mio giudizio.»
          <div className="mt-4 text-[13px] not-italic opacity-70">
            Roberto Scrigna — Nutrizione Sportiva
          </div>
        </blockquote>
        <div className="text-[13px] opacity-60">Bologna · dal 2019</div>
      </aside>
      <main className="flex items-center justify-center bg-background px-6 py-12">
        <div className="w-full max-w-[400px]">{children}</div>
      </main>
    </div>
  );
}
