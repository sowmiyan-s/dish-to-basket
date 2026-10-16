/**
 * Apple Design Specification (apple/DESIGN.md)
 * Photography-first museum gallery aesthetics with Apple SF typography scale,
 * customized with warm gourmet foodie accents (Saffron Flame, Warm Amber, Basil Sage)
 * instead of tech action blue.
 */

const colors = {
  light: {
    // Canvas & Surfaces (Apple parchment & gallery white)
    canvas: '#F5F5F7',
    canvasSoft: '#FFFFFF',
    background: '#F5F5F7',
    card: '#FFFFFF',
    surfaceCard: '#FFFFFF',
    surfaceTile: '#F0F0F2',
    surfaceStrong: '#E5E5EA',

    // Ink & Body Typography
    ink: '#1D1D1F',
    foreground: '#1D1D1F',
    body: '#515154',
    bodyStrong: '#1D1D1F',
    muted: '#86868B',
    mutedForeground: '#86868B',
    mutedSoft: '#A1A1A6',

    // Hairlines & Dividers (Apple hairline 1px)
    hairline: '#E5E5EA',
    hairlineSoft: '#EBEBF0',
    hairlineStrong: '#D1D1D6',
    border: '#E5E5EA',
    input: '#FFFFFF',

    // Gourmet Foodie Primary (Saffron Persimmon replacing #0066cc)
    primary: '#E64A19',
    primaryFocus: '#FF5722',
    primaryActive: '#BF360C',
    primaryForeground: '#FFFFFF',
    onPrimary: '#FFFFFF',

    // Gourmet Secondary & Accents
    secondary: '#F5EBE6',
    secondaryForeground: '#1D1D1F',
    accentGold: '#D97706',
    accentSage: '#2E7D32',

    // Semantic
    success: '#1F8A65',
    successLight: '#E8F5EE',
    successForeground: '#145A42',
    destructive: '#E53935',
    destructiveForeground: '#FFFFFF',
  },
  dark: {
    // Apple Pro Dark (Museum Obsidian Gallery)
    canvas: '#0D0D0C',
    canvasSoft: '#161615',
    background: '#0D0D0C',
    card: '#1A1918',
    surfaceCard: '#1A1918',
    surfaceTile: '#242322',
    surfaceStrong: '#2C2B29',

    // Ink & Body Typography
    ink: '#F5F5F7',
    foreground: '#F5F5F7',
    body: '#A1A1A6',
    bodyStrong: '#F5F5F7',
    muted: '#7A7A7E',
    mutedForeground: '#7A7A7E',
    mutedSoft: '#505054',

    // Hairlines
    hairline: '#282725',
    hairlineSoft: '#1F1E1D',
    hairlineStrong: '#3A3936',
    border: '#282725',
    input: '#1A1918',

    // Gourmet Foodie Primary (Vibrant Saffron Ember on dark)
    primary: '#FF5722',
    primaryFocus: '#FF7043',
    primaryActive: '#F4511E',
    primaryForeground: '#FFFFFF',
    onPrimary: '#FFFFFF',

    secondary: '#26201D',
    secondaryForeground: '#F5F5F7',
    accentGold: '#F59E0B',
    accentSage: '#4CAF50',

    success: '#2EC292',
    successLight: '#123D2F',
    successForeground: '#8EF0CD',
    destructive: '#EF5350',
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
