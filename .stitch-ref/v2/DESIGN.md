---
name: Campus Assistant Design System
colors:
  surface: '#f7f9fb'
  surface-dim: '#d8dadc'
  surface-bright: '#f7f9fb'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f2f4f6'
  surface-container: '#eceef0'
  surface-container-high: '#e6e8ea'
  surface-container-highest: '#e0e3e5'
  on-surface: '#191c1e'
  on-surface-variant: '#424656'
  inverse-surface: '#2d3133'
  inverse-on-surface: '#eff1f3'
  outline: '#727687'
  outline-variant: '#c2c6d8'
  surface-tint: '#0054d6'
  primary: '#0050cb'
  on-primary: '#ffffff'
  primary-container: '#0066ff'
  on-primary-container: '#f8f7ff'
  inverse-primary: '#b3c5ff'
  secondary: '#006b58'
  on-secondary: '#ffffff'
  secondary-container: '#67f7d5'
  on-secondary-container: '#00705c'
  tertiary: '#a33200'
  on-tertiary: '#ffffff'
  tertiary-container: '#cc4204'
  on-tertiary-container: '#fff6f4'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#dae1ff'
  primary-fixed-dim: '#b3c5ff'
  on-primary-fixed: '#001849'
  on-primary-fixed-variant: '#003fa4'
  secondary-fixed: '#6bfad8'
  secondary-fixed-dim: '#48ddbc'
  on-secondary-fixed: '#002019'
  on-secondary-fixed-variant: '#005142'
  tertiary-fixed: '#ffdbd0'
  tertiary-fixed-dim: '#ffb59d'
  on-tertiary-fixed: '#390c00'
  on-tertiary-fixed-variant: '#832600'
  background: '#f7f9fb'
  on-background: '#191c1e'
  surface-variant: '#e0e3e5'
typography:
  display-weather:
    fontFamily: Plus Jakarta Sans
    fontSize: 64px
    fontWeight: '700'
    lineHeight: 72px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.01em
  headline-lg-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 32px
  title-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 24px
  body-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  label-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.05em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base: 8px
  xs: 4px
  sm: 12px
  md: 16px
  lg: 24px
  xl: 32px
  container_margin: 20px
  gutter: 16px
---

## Brand & Style
The design system is engineered for the modern academic environment, prioritizing clarity, efficiency, and a sense of calm. The target audience—students and faculty—requires information at a glance, necessitating a high-legibility interface that feels helpful rather than overwhelming. 

The aesthetic is rooted in **Minimalism** with a **Glassmorphic** twist. It utilizes expansive whitespace, a light-filled palette, and subtle translucent layers to create a sense of depth and focus. The goal is to evoke an emotional response of reliability and organized intelligence, ensuring the "Campus Assistant" feels like a seamless extension of the university experience.

## Colors
The color strategy employs a core academic blue as the primary brand anchor, supported by a system of functional weather tokens. 

For the weather components, gradients are used to provide immediate visual context. Each variant (Sunny, Rainy, Cloudy, Snowy) includes a primary background gradient, a high-contrast text color, and a soft accent color for secondary elements like icon backdrops or dividers. The background of the application remains a crisp, neutral slate to allow these colored cards to pop without visual fatigue.

## Typography
This design system utilizes **Plus Jakarta Sans** across all levels to maintain a contemporary, approachable, and highly readable feel. 

- **Display Weather**: Reserved specifically for the current temperature reading within weather cards.
- **Headlines**: Used for section headers (e.g., "Daily Forecast").
- **Titles**: Used for card titles and prominent labels.
- **Body**: Optimized for general information and descriptions.
- **Labels**: Used for metadata, such as humidity percentages or wind speeds, often in all-caps for distinct hierarchy.

## Layout & Spacing
The layout follows a **fluid grid** model tailored for mobile consumption. A 4-column grid is standard for phone layouts, expanding to 8 or 12 for tablet/desktop views. 

Spacing is governed by an 8px base unit. Weather cards should utilize a consistent 20px outer margin from the screen edge. Internal padding within cards is set to 24px (lg) to ensure that weather icons and temperature displays have significant "breathing room," reinforcing the clean aesthetic.

## Elevation & Depth
Depth is created through **Tonal Layers** and **Ambient Shadows**. Weather cards do not use heavy, dark shadows; instead, they utilize a soft, diffused shadow tinted slightly with the primary color of the weather variant (e.g., a soft orange shadow for sunny weather). 

Glassmorphism is applied to sub-elements within the cards, such as a 10-day forecast list inside a rainy weather card. These elements use a backdrop blur (12px to 20px) and a thin, 1px white border at 20% opacity to simulate frosted glass.

## Shapes
The design system adopts a **Rounded** (Level 2) language. This choice balances the professional nature of an academic tool with the friendly, modern expectations of a campus app. 

- **Primary Cards**: 1.5rem (24px) corner radius for a soft, containerized look.
- **Buttons and Chips**: 0.5rem (8px) corner radius.
- **Weather Icons**: Enclosed in circular or highly rounded containers to maintain a consistent geometric flow.

## Components

### Weather Cards
The central component of the showcase. Each card is a full-width container utilizing the `weather_variants` gradients. 
- **Top Row**: Location name (Title-md) and current time (Label-sm).
- **Center**: Current temperature (Display-weather) and a large, high-quality weather icon.
- **Bottom**: A horizontal scroll of hourly forecasts using Glassmorphic sub-containers.

### Chips
Used for quick weather alerts (e.g., "Heat Wave Warning"). These should have a background blur and use the `accent` color from the weather variant palette with a bold weight for the text.

### Buttons
Primary actions (e.g., "View Full Report") should be ghost buttons with a white 1px border when placed on weather gradients, or solid primary blue when on neutral backgrounds.

### Input Fields
Search bars for location should be ultra-minimal: a light gray background, no border, and a subtle inner shadow to indicate depth, using `body-md` for the text.

### Lists
Forecast lists should use thin dividers (10% opacity) and clear iconography to the left of the text.