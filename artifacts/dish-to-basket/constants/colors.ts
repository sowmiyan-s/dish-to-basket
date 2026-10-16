/**
 * Semantic design tokens for the mobile app.
 *
 * These tokens mirror the naming conventions used in web artifacts (index.css)
 * so that multi-artifact projects share a cohesive visual identity.
 *
 * Replace the placeholder values below with values that match the project's
 * brand. If a sibling web artifact exists, read its index.css and convert the
 * HSL values to hex so both artifacts use the same palette.
 *
 * To add dark mode, add a `dark` key with the same token names.
 * The useColors() hook will automatically pick it up.
 */

const colors = {
  light: {
    // Legacy aliases (kept for backward compatibility)
    text: '#2c2924',
    tint: '#cf613e',

    // Core surfaces
    background: '#faf6ef',
    foreground: '#2c2924',

    // Cards / elevated surfaces
    card: '#fffdf9',
    cardForeground: '#2c2924',

    // Primary action color (buttons, links, active states)
    primary: '#cf613e',
    primaryForeground: '#ffffff',

    // Secondary / less-emphasis interactive surfaces
    secondary: '#eee7dc',
    secondaryForeground: '#2c2924',

    // Muted / subdued elements (dividers, timestamps, placeholders)
    muted: '#f2ece2',
    mutedForeground: '#777168',

    // Accent highlights (badges, selected items, focus rings)
    accent: '#f4e5d9',
    accentForeground: '#7d3d29',

    // Destructive actions (delete, error states)
    destructive: '#ef4444',
    destructiveForeground: '#ffffff',

    // Borders and input outlines
    border: '#e8dfd2',
    input: '#e8dfd2',
  },

  // Border radius (in px). Sync from the sibling web artifact's --radius
  // CSS variable. This value applies to cards, buttons, inputs, and modals.
  radius: 12,
};

export default colors;
