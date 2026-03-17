# WCAG AA Contrast Audit - 2026-03-17

## Scope
This audit covers small text and metadata displayed over gradient surfaces in the core mobile clinical flow.

Components audited:
- `src/components/ToxiFlowDashboard.tsx`
- `src/components/SectionCard.tsx`
- `src/components/ToxicityPanel.tsx`

## Success Criteria
- WCAG 2.1 AA for normal text: contrast ratio >= 4.5:1.
- The focus of this pass is text from 9px to 13px rendered on gradient/colored backgrounds.

## Method
- Foreground/background pairs were measured using the WCAG relative luminance formula.
- Opacity-based text (for example `text-white/90`) was composited against the effective background color before calculating ratio.
- For gradients, the lightest stop used behind text was treated as the worst-case background.

## Measured Pairs

| Component | Pair | Ratio | Target | Result |
|---|---|---:|---:|---|
| Dashboard header | Hero subtitle (`text-white/90`) on header gradient | 12.62 | 4.5 | PASS |
| Dashboard header | Hero meta (`text-white/95`) on header gradient | 13.91 | 4.5 | PASS |
| Dashboard header | Hero badge (`text-white`) on header gradient | 15.32 | 4.5 | PASS |
| CIATox button | Note (`text-white`) on dark button gradient | 14.63 | 4.5 | PASS |
| CIATox button | Note (`text-white`) on danger button gradient | 4.83 | 4.5 | PASS |
| SectionCard | Eyebrow (`slate-600`) on light card gradient | 7.02 | 4.5 | PASS |
| SectionCard | Description (`slate-700`) on light card gradient | 9.59 | 4.5 | PASS |
| ToxicityPanel | Risk micro-label (`text-white`) on red danger panel | 4.83 | 4.5 | PASS |
| ToxicityPanel | Risk micro-label (`text-white`) on green safe panel | 5.02 | 4.5 | PASS |
| ToxicityPanel | Alert helper (`red-950`) on red-50 | 14.76 | 4.5 | PASS |
| ToxicityPanel | Safe helper (`emerald-950`) on emerald-50 | 14.38 | 4.5 | PASS |

## Changes Applied In This Audit Pass
- Set small metadata text on risk gradients to full white where needed.
- Darkened the safe-risk gradient base to preserve AA for micro-labels.
- Raised muted small-text contrast in card eyebrow/description and key dashboard metadata.

Files changed:
- `src/app/globals.css`
- `src/components/ToxiFlowDashboard.tsx`
- `src/components/SectionCard.tsx`
- `src/components/ToxicityPanel.tsx`

## Conclusion
All audited small-text contrast pairs in the scoped components meet WCAG AA for normal text.
