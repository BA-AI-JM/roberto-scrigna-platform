#!/usr/bin/env python3
"""T3.2 contrast gate (DIRECTION tension #2): every semantic pair AA-verified
against BOTH theme bases. Run: python3 scripts/check-contrast.py  → exit 1 on fail."""

def lum(hexc):
    h = hexc.lstrip("#"); r, g, b = (int(h[i:i+2], 16)/255 for i in (0, 2, 4))
    f = lambda c: c/12.92 if c <= 0.04045 else ((c+0.055)/1.055)**2.4
    r, g, b = f(r), f(g), f(b)
    return 0.2126*r + 0.7152*g + 0.0722*b

def ratio(a, b):
    la, lb = sorted((lum(a), lum(b)), reverse=True)
    return (la + 0.05) / (lb + 0.05)

# (label, fg, bg, min_ratio)  — 4.5 text, 3.0 large-text/UI
PAIRS = [
    # LIGHT
    ("L ink/canvas",        "#191b19", "#f8f7f4", 4.5),
    ("L ink/panel",         "#191b19", "#ffffff", 4.5),
    ("L ink-2/panel",       "#575c57", "#ffffff", 4.5),
    ("L ink-3/panel (lg)",  "#8b908a", "#ffffff", 3.0),
    ("L accent-fg/wash",    "#0c6b4d", "#e5f3ec", 4.5),
    ("L primary-fg/primary","#ffffff", "#159a6e", 3.0),
    ("L red/red-wash",      "#b23b2e", "#f9ece9", 4.5),
    ("L amber/amber-wash",  "#a05b10", "#f8f0e1", 4.5),
    ("L viz-kcal/panel",    "#b07018", "#ffffff", 3.0),
    ("L viz-p/panel",       "#3b6fb5", "#ffffff", 3.0),
    ("L viz-f/panel",       "#3e8e5a", "#ffffff", 3.0),
    # DARK
    ("D ink/canvas",        "#f1f0ea", "#151714", 4.5),
    ("D ink/panel",         "#f1f0ea", "#1d201c", 4.5),
    ("D ink-2/panel",       "#a9aea5", "#1d201c", 4.5),
    ("D ink-3/panel (lg)",  "#8b9088", "#1d201c", 3.0),
    ("D accent-fg/wash",    "#7fd6b4", "#12352a", 4.5),
    ("D primary-fg/primary","#0c1f18", "#2fb585", 4.5),
    ("D red/red-wash",      "#e0705f", "#39201b", 4.5),
    ("D amber/amber-wash",  "#d89a4a", "#33270f", 4.5),
    ("D viz-kcal/panel",    "#d89a4a", "#1d201c", 3.0),
    ("D viz-p/panel",       "#7fa6dd", "#1d201c", 3.0),
    ("D viz-f/panel",       "#6fbe8c", "#1d201c", 3.0),
]

fails = 0
for label, fg, bg, need in PAIRS:
    r = ratio(fg, bg)
    mark = "PASS" if r >= need else "FAIL"
    if r < need: fails += 1
    print(f"{mark}  {label:26s} {r:5.2f}:1  (min {need})")
print(f"\n{len(PAIRS)-fails}/{len(PAIRS)} pairs pass")
raise SystemExit(1 if fails else 0)
