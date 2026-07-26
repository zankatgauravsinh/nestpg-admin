---
name: Operations OS
colors:
  surface: '#fbf8fa'
  surface-dim: '#dcd9db'
  surface-bright: '#fbf8fa'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f5f3f4'
  surface-container: '#f0edef'
  surface-container-high: '#eae7e9'
  surface-container-highest: '#e4e2e3'
  on-surface: '#1b1b1d'
  on-surface-variant: '#45474c'
  inverse-surface: '#303032'
  inverse-on-surface: '#f3f0f2'
  outline: '#75777d'
  outline-variant: '#c5c6cd'
  surface-tint: '#545f73'
  primary: '#091426'
  on-primary: '#ffffff'
  primary-container: '#1e293b'
  on-primary-container: '#8590a6'
  inverse-primary: '#bcc7de'
  secondary: '#5b5e67'
  on-secondary: '#ffffff'
  secondary-container: '#dfe2ed'
  on-secondary-container: '#61646d'
  tertiary: '#1e1200'
  on-tertiary: '#ffffff'
  tertiary-container: '#35260c'
  on-tertiary-container: '#a38c6a'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#d8e3fb'
  primary-fixed-dim: '#bcc7de'
  on-primary-fixed: '#111c2d'
  on-primary-fixed-variant: '#3c475a'
  secondary-fixed: '#dfe2ed'
  secondary-fixed-dim: '#c3c6d1'
  on-secondary-fixed: '#181c23'
  on-secondary-fixed-variant: '#43474f'
  tertiary-fixed: '#fadfb8'
  tertiary-fixed-dim: '#ddc39d'
  on-tertiary-fixed: '#271902'
  on-tertiary-fixed-variant: '#564427'
  background: '#fbf8fa'
  on-background: '#1b1b1d'
  surface-variant: '#e4e2e3'
typography:
  display-lg:
    fontFamily: Inter
    fontSize: 36px
    fontWeight: '600'
    lineHeight: 44px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 24px
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  body-sm:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
  label-md:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.05em
  code-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base: 4px
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  xxl: 48px
  gutter: 24px
  margin: 32px
---

## Brand & Style
The design system is engineered for high-stakes property management operations, prioritizing clarity, efficiency, and executive-level sophistication. It targets professional property managers and real estate owners who require a "single pane of glass" for complex data.

The aesthetic leans heavily into **Modern Corporate Minimalism**, taking cues from industry leaders like Stripe and Linear. The goal is to create an "Operations OS" feel—where the interface recedes to let the data lead, but the underlying structure feels incredibly stable and high-end.

**Key Principles:**
- **Information Density:** High but organized. Utilize white space to separate functional groups rather than using heavy lines.
- **Functional Aesthetic:** Every element has a purpose. Avoid decorative flourishes or non-functional gradients.
- **Tactile Precision:** Use subtle borders and micro-shadows to create a sense of physical layering without visual noise.

## Colors
The palette is rooted in a "Deep Navy" and "Soft Grey" foundation to evoke stability and institutional trust. 

- **Primary (#1E293B):** Used for primary text and core navigation elements. It provides better legibility and a softer feel than pure black.
- **Accent (#C2410C):** A Warm Vermillion used sparingly for primary actions and brand moments. It provides a sophisticated warmth to the otherwise cool UI.
- **Canvas & Panels:** We use a layered approach. The global background is **Soft Grey (#F8FAFC)**, while active work areas (cards, tables) are **White (#FFFFFF)**.
- **Warm Surface (#FAF8F5):** Reserved for specific branded sections or "empty state" backgrounds to add a human, premium touch.
- **Borders:** Two levels of borders are utilized to create hierarchy without using shadows. Use `border_secondary` for internal dividers and `border_primary` for component containers.

## Typography
**Inter** is the workhorse of this design system. It is chosen for its exceptional legibility in data-dense environments and its professional, "utility-first" appearance.

- **Headlines:** Use Semi-Bold (600) for all headings to provide a clear anchor for the eye. Tighten letter spacing slightly on larger displays to maintain a premium "editorial" look.
- **Body Text:** Standard text uses a 14px base (`body-md`), which is the industry standard for SaaS dashboards to balance readability with information density.
- **Labels:** Use the uppercase `label-md` for table headers and section overviews to create a clear structural distinction from content.
- **Mobile Adjustments:** On mobile devices, `display-lg` should scale down to `headline-lg` to prevent awkward wrapping.

## Layout & Spacing
The design system utilizes a **12-column fluid grid** for main content areas, with a max-width of 1440px for the primary container to ensure readability on ultra-wide monitors.

- **The 4px Rule:** All spacing must be a multiple of 4px. This ensures a mathematical harmony across the UI.
- **Margins & Gutters:** Use 32px margins on desktop and 16px on mobile. Gutters are fixed at 24px to provide ample "breathing room" between complex data columns.
- **Sidebar:** The primary navigation resides in a fixed 260px left sidebar, utilizing a slightly darker tonal background (Primary or a tint of it) or a clean White surface with a `border_primary` separator.
- **Vertical Rhythm:** Use `spacing.xl` (32px) between major sections and `spacing.md` (16px) for internal component padding.

## Elevation & Depth
This design system avoids heavy shadows and floating elements to maintain an "operational" and grounded feel. Depth is communicated primarily through **Tonal Layering** and **Low-Contrast Outlines**.

- **Level 0 (Canvas):** The base background using #F8FAFC. 
- **Level 1 (Panels):** White containers with a 1px `border_primary` (#E2E8F0). No shadow.
- **Level 2 (Dropdowns/Modals):** Elements that sit above the UI use a very subtle, diffused shadow: `0px 4px 12px rgba(30, 41, 59, 0.05)`.
- **Interactions:** Hover states on cards should not lift the element. Instead, change the border color to the Accent color or darken the background slightly.

## Shapes
A consistent **16px (1rem) corner radius** is applied to all primary containers (Cards, Modals, Main Content Areas). This "large-radius" approach softens the professional aesthetic, making the enterprise software feel modern and accessible rather than rigid and legacy.

- **Small Components:** Buttons, input fields, and tags use a smaller **8px (0.5rem)** radius to maintain a crisp look.
- **Nested Elements:** When an element is nested inside a 16px container, the inner element should have an 8px radius to maintain visual concentricity.

## Components
- **Buttons:** 
    - *Primary:* Solid Warm Vermillion (#C2410C) with White text. 8px radius.
    - *Secondary:* White background with `border_primary` and Deep Navy text.
    - *Ghost:* No border, Deep Navy text. Used for less frequent actions.
- **Inputs:** 8px radius, 1px `border_primary`. On focus, the border transitions to the Accent color with a 2px "soft ring" glow (0.1 opacity).
- **Cards:** 16px radius, White background, 1px `border_primary`. No shadow unless it is a draggable object.
- **Status Chips:** Small, semi-bold text with a subtle background tint of the status color (e.g., Success chip has #DCFCE7 background and #16A34A text). 
- **Data Tables:** Borderless rows. Use a 1px `border_secondary` divider between rows. The header row should use the `label-md` typography style and a #F8FAFC background.
- **Navigation:** Sidebar items should have a 8px radius for the active state background highlight. Use high-quality, 20px stroke-based icons.