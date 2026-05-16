---
name: Campus Vitality
colors:
  surface: '#f6fafe'
  surface-dim: '#d6dade'
  surface-bright: '#f6fafe'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f0f4f8'
  surface-container: '#eaeef2'
  surface-container-high: '#e4e9ed'
  surface-container-highest: '#dfe3e7'
  on-surface: '#171c1f'
  on-surface-variant: '#424754'
  inverse-surface: '#2c3134'
  inverse-on-surface: '#edf1f5'
  outline: '#727785'
  outline-variant: '#c2c6d6'
  surface-tint: '#005ac2'
  primary: '#0058be'
  on-primary: '#ffffff'
  primary-container: '#2170e4'
  on-primary-container: '#fefcff'
  inverse-primary: '#adc6ff'
  secondary: '#585f6c'
  on-secondary: '#ffffff'
  secondary-container: '#dce2f3'
  on-secondary-container: '#5e6572'
  tertiary: '#924700'
  on-tertiary: '#ffffff'
  tertiary-container: '#b75b00'
  on-tertiary-container: '#fffbff'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#d8e2ff'
  primary-fixed-dim: '#adc6ff'
  on-primary-fixed: '#001a42'
  on-primary-fixed-variant: '#004395'
  secondary-fixed: '#dce2f3'
  secondary-fixed-dim: '#c0c7d6'
  on-secondary-fixed: '#151c27'
  on-secondary-fixed-variant: '#404754'
  tertiary-fixed: '#ffdcc6'
  tertiary-fixed-dim: '#ffb786'
  on-tertiary-fixed: '#311400'
  on-tertiary-fixed-variant: '#723600'
  background: '#f6fafe'
  on-background: '#171c1f'
  surface-variant: '#dfe3e7'
  success-teal: '#14b8a6'
  warning-orange: '#f97316'
  danger-red: '#ef4444'
  info-sky: '#38bdf8'
  accent-gradient-start: '#5b86e5'
  accent-gradient-end: '#36d1dc'
typography:
  headline-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 30px
    fontWeight: '700'
    lineHeight: 36px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 20px
    fontWeight: '700'
    lineHeight: 28px
  headline-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 18px
    fontWeight: '700'
    lineHeight: 24px
  body-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 16px
    fontWeight: '500'
    lineHeight: 24px
  body-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
  label-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 10px
    fontWeight: '600'
    lineHeight: 14px
    letterSpacing: 0.02em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  container-padding: 1rem
  stack-gap: 1.25rem
  inline-gap: 0.75rem
  section-margin: 1.5rem
---

## Brand & Style

Campus Vitality is designed to be an optimistic, high-utility companion for students. The brand personality is **approachable, energetic, and organized**, aiming to reduce the cognitive load of academic life through clear information hierarchy and friendly visual cues.

The design style is a blend of **Modern Corporate and Soft Minimalism**. It utilizes a clean "App-centric" layout with deep, rounded corners and a vibrant blue primary anchor. Visual interest is maintained through high-quality gradients (Glassmorphism-lite) and a "Card-on-Surface" architecture that feels tactile yet digital-native. The aesthetic is professional enough for an educational institution but vibrant enough for a modern student lifestyle.

## Colors

The palette is anchored by a **Vibrant Blue (#3b82f6)** that signals action and reliability. The background uses a soft, cool-toned grey-blue (#f0f4f8) to reduce glare and differentiate itself from standard white paper/web backgrounds.

Functional colors (Teal, Orange, Red) are used with a light tint (50-100 weight) for background surfaces and full saturation for icons and text, ensuring high legibility while maintaining a soft interface. Gradients are reserved for "High Priority" or "Active" states to draw immediate focus to the current task or schedule item.

## Typography

**Plus Jakarta Sans** is the sole typeface, chosen for its modern, geometric construction and friendly, open apertures. 

The system uses a strict hierarchy:
- **Display Headlines** use tight letter-spacing and bold weights for a "hand-crafted" greeting feel.
- **Content Labels** utilize 10px and 11px sizes for metadata, often paired with 500-600 weights to ensure legibility despite the small scale.
- **Interactive Text** (buttons and links) uses a medium weight to distinguish it from static body copy.

## Layout & Spacing

The system follows a **Mobile-First Fixed Grid** logic, optimized for a maximum width of 448px (standard mobile viewport). 

- **Outer Margins:** A consistent 16px (1rem) horizontal margin keeps content safe.
- **Stacking:** Vertical sections are separated by 20px (1.25rem), creating distinct "modules" of information.
- **Grid Systems:** Quick entries and feature grids use 4 and 5-column fluid distributions to maximize thumb-reachability.
- **Safe Areas:** The design accounts for a persistent 80px bottom navigation clearance and uses a backdrop-blur header for content continuity.

## Elevation & Depth

Depth is achieved through **Ambient Shadows** and **Tonal Layering** rather than traditional heavy shadows.

1.  **Level 0 (Base):** The background (#f0f4f8) acts as the canvas.
2.  **Level 1 (Cards):** Pure white (#ffffff) cards use a very soft shadow (`0 4px 15px rgba(0, 0, 0, 0.03)`) to appear lifted but integrated.
3.  **Level 2 (Active States):** High-priority items use vibrant gradients and more aggressive shadows (`0 10px 20px rgba(54, 209, 220, 0.3)`) to appear as the top-most layer.
4.  **Overlays:** The bottom navigation and top header use a `backdrop-blur` (90% opacity) to provide context of the content scrolling beneath them.

## Shapes

The shape language is defined by **Large Radii (Level 2)**. 
- **Primary Cards:** Use a 1.5rem (24px) radius to feel friendly and modern.
- **Interactive Icons:** Use a "Squircle" or 14px roundedness to differentiate from standard circles.
- **Buttons & Chips:** Use a full "Pill" shape (9999px) for primary actions to clearly indicate touch targets.
- **Search Inputs:** Fully rounded ends to match the "Pill" button aesthetic.

## Components

### Buttons
- **Primary:** High-contrast white text on a blue background, pill-shaped.
- **Secondary/Ghost:** Blue text on a light-blue tinted background, pill-shaped.

### Cards
- Standard containers have 20px padding and 24px corner radii.
- The "Active Course" card uses a gradient fill and an illustrative overlay (low-opacity image) to signify importance.

### Chips & Badges
- Small, low-contrast labels (e.g., "Undergraduate" or "Finished") use a 2px-4px radius and light grey backgrounds to remain secondary to the main text.

### Inputs
- Search bars should have a subtle interior shadow or borderless white fill with a soft shadow, containing centered or left-aligned icons for a clean utility look.

### Bottom Navigation
- Uses a "Floating Tab" style where the active item is encased in a soft, rounded-2xl colored container, while inactive items remain icon-only.