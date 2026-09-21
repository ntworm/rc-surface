# Operator-Sheet Visual Design Contract

## Purpose and governing principle

This contract defines a portable visual system for dense, low-light control surfaces. It favours the character of a printed operator sheet: flat planes, hard rules, compact labels, one warm focus colour, and colour that earns its place by carrying information.

Decorative colour resolves to the canonical palette; categorical or state-carrying colour does not. A new hue is valid only when it distinguishes a stable category, mode, signal, or safety state that the palette cannot express without ambiguity. Generic tool defaults are deliberately avoided.

## Typeface and offline delivery

Departure Mono is the sole interface face. It is a monospaced pixel typeface by Helena Zhang and Tobias Fried and is distributed under the MIT License.

Bundle `DepartureMono-Regular.woff2` with the product and load it locally so the interface remains complete offline. The canonical browser declaration is:

```css
@font-face{font-family:"Departure Mono";src:url("../fonts/DepartureMono-Regular.woff2") format("woff2");font-display:swap}
```

Use this exact stack:

```css
"Departure Mono",ui-monospace,"SF Mono",Menlo,monospace
```

Departure Mono does not contain media-control glyphs. Transport icons must be drawn as CSS, SVG, or equivalent geometry rather than typed as characters; use solid `currentColor` shapes, zero radius, and `em`-relative sizing so their weight and state follow the surrounding control.

A standalone artifact that cannot address a sibling font directory may embed the same WOFF2 bytes as a base64 `data:font/woff2` URI. Do not replace the typeface with a network dependency.

## Canonical palette

Palette names describe what a colour is, independent of where it is used.

| Name | Value |
| --- | --- |
| amber | `#ffa133` |
| pumpkin | `#e47b1a` |
| flux | `#c8be50` |
| foam | `#bccabb` |
| enamel | `#eeeeee` |
| cement | `#c0c0c0` |
| aluminum | `#cccccc` |
| ash | `#8e8e8e` |
| mud | `#8a8a6f` |
| clay | `#6c6c58` |
| smoke | `#666666` |
| dark | `#444444` |
| soot | `#333333` |
| carbon | `#222222` |
| black | `#141414` |

## Palette names and role aliases

Role names describe what a colour does on a surface. Palette names are the source of truth for identity; role names are aliases for purpose. A new surface declares the palette first, then maps roles such as background, surface, border, text, accent, success, warning, and error onto it.

Do not hide an arbitrary colour behind a role token. If the colour is decorative, resolve it to the palette. If it conveys category or state, name that responsibility and document the exception.

## Geometry, motion, and touch

- Default component radius is `0`. Rectangles should read as controls and printed cells, not soft cards.
- Round geometry is reserved for controls whose physical or spatial model is round, including knobs, dials, sensor orbits, and record dots.
- The standard interaction transition is `180ms ease`. Do not introduce a second general timing curve without a measured interaction need.
- On phone layouts, use touch targets of at least `44px` whenever the available control density permits it. Preserve safe spacing around critical actions.

## Prohibited defaults

Do not introduce decorative shadows, decorative gradients, backdrop blur, Tailwind-style indigo or violet, soft radii in the `8px` to `16px` range, or a translucent frosted navigation layer. Do not substitute generic UI faces such as Inter, Outfit, or JetBrains Mono for the bundled typeface.

These defaults are excluded because they weaken the operator-sheet hierarchy and make functional colour harder to distinguish. Exceptions must encode touch, value, category, signal, or safety state and must be documented beside the surface vocabulary.

## Deliberate information-bearing exceptions

- Categorical hues may sit outside the palette when each hue has a stable label and meaning.
- Success, warning, error, connection, armed, and mode colours may sit outside the palette because merging them into one accent would erase state.
- A `0 0` glow is allowed only as compact state or touch feedback. It must not become ambient elevation or decoration.
- Gradients are allowed inside value meters, filled pads, knob dials, fader thumbs, and similarly constrained affordances when the gradient communicates magnitude, direction, grip, or an active state.
- Blur is allowed only when it protects legibility during a temporary warning or separates a live vision overlay from camera imagery.

## Applying the contract to a new surface

1. Bundle Departure Mono and declare the canonical palette.
2. Map semantic roles onto palette values before styling components.
3. Build the hierarchy with flat surfaces, hard rules, zero radius, and the standard transition.
4. Add categorical or state colour only after naming the information it carries.
5. Record every shadow, gradient, blur, and round shape as a bounded exception.
6. Verify offline font loading, keyboard focus, low-light contrast, and phone touch targets.

## Repository appendix — RC Surface

This appendix records the current implementation. The portable rules above remain the design source of truth.

### Font delivery

- Panel and admin load `static/fonts/DepartureMono-Regular.woff2` with the canonical declaration and stack. Source paths in this contract are repository references, not loose files in the tester kit.
- The phone loads the same local font but its current stack omits `"SF Mono"`; align it only in a separately tested visual change.
- `docs/index.html` embeds the same WOFF2 data as a base64 URI because the standalone Pages artifact has no sibling font directory.

### Current surface vocabulary

| Value | Site | Panel and admin | Phone |
| --- | --- | --- | --- |
| `#141414` | `--black` | `--bg`, `--flux-ink` | `--bg2` |
| `#0e0e0e` | — | `--bg2` | `--bg` |
| `#1a1a1a` | — | `--surface` | `--surface` |
| `#222222` | `--carbon` | `--bg3` | `--surface-soft` |
| `#333333` | `--soot`, `--rule` | `--border` | `--border` |
| `#c0c0c0` | `--cement` | `--text` | — |
| `#8e8e8e` | `--ash` | `--text2` | — |
| `#6c6c58` | `--clay` | `--text3` | — |
| `#ffa133` | `--amber` | `--accent` | `--accent` |
| `#c8be50` | `--flux` | `--flux` | — |
| `#1f1f1f` | — | `--ctrl` | — |

The zero-radius rule holds on all three surfaces. Panel and admin express it through `--radius: 0`, `--radius-lg: 0`, and `--transition: 180ms ease`. The phone currently uses literal zero values for square geometry; its knob dial, sensor orbit, and record dot retain `50%` because they model round physical or spatial controls. Adopt `--radius` on the phone in 0.8.0.

### Known defects deferred to 0.8.0

- Panel and admin map `--bg` to `#141414` and `--bg2` to `#0e0e0e`; phone reverses those roles. Treat the phone mapping as the outlier, but defer normalization to 0.8.0 because a pre-release device layout change needs real-device validation.
- Phone declares `--accent-bg` but does not use it. In 0.8.0, prefer migrating the canonical 12% amber state fill to this role token rather than dropping it; other alpha levels should remain explicit.
- The site declares 13 palette variables. `enamel` and `aluminum` are canonical names but do not yet have site declarations.

### Current categorical and state exceptions

- `static/panel/app.js` defines nine `GROUP_ACCENTS`: SENSORS `#34c759`, HANDS `#af52de`, AUDIO `#ff375f`, PADS `#0a84ff`, XY PADS `#ff9f0a`, LFOs `#5e5ce6`, STUTTERS `#ff9500`, KNOBS `#5ac8fa`, and FADERS `#ffd60a`.
- Phone modes are stable signal categories: `--mode-a: #0a84ff`, `--mode-b: #ff9f0a`, `--mode-c: #30d158`, and `--mode-d: #ff375f`. Within the phone stylesheet, the mode-B token is the sole literal occurrence of its value; panel XY PADS independently use the same categorical hue.
- Phone uses `#bf5af2` as a fifth signal channel for time, snapshot, morph, STAGE, calibration, and return-track states.
- Panel and admin reserve `--ok: hsl(145,58%,52%)`, `--red: hsl(4,100%,62%)`, and `--blue: hsl(211,100%,55%)` for status.
- Existing `0 0` shadows are state or touch glows. Existing gradients communicate live level, pad fill, switch/button affordance, knob/fader grip, sensor direction, or gesture state; they are not a general surface treatment.
- The only blur effects are `backdrop-filter: blur(8px)` on the vision HUD and `filter: blur(2px)` behind the portrait-orientation warning.
