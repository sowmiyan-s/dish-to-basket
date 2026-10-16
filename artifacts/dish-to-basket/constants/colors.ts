/**
 * Apple Design Specification (apple/DESIGN.md)
 * Photography-first museum gallery aesthetics with Apple SF typography scale,
 * customized with warm gourmet foodie accents (Saffron Flame, Warm Amber, Basil Sage)
 * instead of tech action blue.
 */

const colors = {
  light: {
    // Canvas & Surfaces (Google Clean Light Theme)
    canvas: '#F8F9FA',
    canvasSoft: '#FFFFFF',
    background: '#F8F9FA',
    card: '#FFFFFF',
    surfaceCard: '#FFFFFF',
    surfaceTile: '#F1F3F4',
    surfaceStrong: '#E8EAED',

    // Ink & Body Typography (Google Charcoal Ink)
    ink: '#202124',
    foreground: '#202124',
    body: '#3C4043',
    bodyStrong: '#202124',
    muted: '#5F6368',
    mutedForeground: '#5F6368',
    mutedSoft: '#80868B',

    // Hairlines & Borders
    hairline: '#E8EAED',
    hairlineSoft: '#F1F3F4',
    hairlineStrong: '#DADCE0',
    border: '#E8EAED',
    input: '#FFFFFF',

    // Culinary Foodie Primary (Google Red / Gourmet Coral)
    primary: '#E53935',
    primaryFocus: '#FF5722',
    primaryActive: '#C62828',
    primaryForeground: '#FFFFFF',
    onPrimary: '#FFFFFF',

    // Foodie Secondary & Accents
    secondary: '#FEECEB',
    secondaryForeground: '#B71C1C',
    accentGold: '#F9AB00',
    accentSage: '#1E8E3E',
    googleBlue: '#1A73E8',

    // Semantic Statuses
    success: '#1E8E3E',
    successLight: '#E6F4EA',
    successForeground: '#137333',
    destructive: '#D93025',
    destructiveForeground: '#FFFFFF',
  },
  dark: {
    // Keep consistent with warm high-contrast light surfaces for clear foodie readability
    canvas: '#F8F9FA',
    canvasSoft: '#FFFFFF',
    background: '#F8F9FA',
    card: '#FFFFFF',
    surfaceCard: '#FFFFFF',
    surfaceTile: '#F1F3F4',
    surfaceStrong: '#E8EAED',

    ink: '#202124',
    foreground: '#202124',
    body: '#3C4043',
    bodyStrong: '#202124',
    muted: '#5F6368',
    mutedForeground: '#5F6368',
    mutedSoft: '#80868B',

    hairline: '#E8EAED',
    hairlineSoft: '#F1F3F4',
    hairlineStrong: '#DADCE0',
    border: '#E8EAED',
    input: '#FFFFFF',

    primary: '#E53935',
    primaryFocus: '#FF5722',
    primaryActive: '#C62828',
    primaryForeground: '#FFFFFF',
    onPrimary: '#FFFFFF',

    secondary: '#FEECEB',
    secondaryForeground: '#B71C1C',
    accentGold: '#F9AB00',
    accentSage: '#1E8E3E',
    googleBlue: '#1A73E8',

    success: '#1E8E3E',
    successLight: '#E6F4EA',
    successForeground: '#137333',
    destructive: '#D93025',
    destructiveForeground: '#FFFFFF',
  },

  // Apple Radii Scale
  radius: {
    none: 0,
    xs: 5,
    sm: 8,
    md: 11,
    lg: 18,
    pill: 9999,
  },
};

export default colors;
