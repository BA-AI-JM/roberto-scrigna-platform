/**
 * Scrigna hexagon mark — a faithful redraw of Roberto's logo mark
 * (scrigna-logo-DEF), authored inline so the outline hexagon themes via
 * `currentColor` (grey + brand-blue hexes are fixed brand colors). Swap for the
 * client's master vector here if he supplies one; the geometry + colors match.
 */
export function ScrignaMark({ className }: { className?: string }) {
  return (
    <svg viewBox="4.1 8.5 91.8 66.6" fill="none" className={className} aria-hidden="true">
      <polygon points="92.90,34.00 79.90,56.52 53.90,56.52 40.90,34.00 53.90,11.48 79.90,11.48" fill="#909090" />
      <polygon points="76.00,49.60 63.00,72.12 37.00,72.12 24.00,49.60 37.00,27.08 63.00,27.08" fill="#90c0f0" />
      <polygon
        points="59.10,34.00 46.10,56.52 20.10,56.52 7.10,34.00 20.10,11.48 46.10,11.48"
        fill="none"
        stroke="currentColor"
        strokeWidth="3.2"
        strokeLinejoin="round"
      />
    </svg>
  );
}
