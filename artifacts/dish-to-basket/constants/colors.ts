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
    // Warm Espresso Obsidian (Rich Foodie & Museum Atmosphere)
    canvas: '#0A0908',
    canvasSoft: '#12110F',
    background: '#0A0908',
    card: '#161412',
    surfaceCard: '#161412',
    surfaceTile: '#201E1A',
    surfaceStrong: '#2A2723',

    // Ink & Creamy Typography
    ink: '#FDFBF7',
    foreground: '#FDFBF7',
    body: '#BCB6AD',
    bodyStrong: '#FDFBF7',
    muted: '#7F7972',
    mutedForeground: '#7F7972',
    mutedSoft: '#4E4944',

    // Hairlines & Glass Borders
    hairline: 'rgba(255, 255, 255, 0.08)',
    hairlineSoft: 'rgba(255, 255, 255, 0.04)',
    hairlineStrong: 'rgba(255, 87, 34, 0.28)',
    border: 'rgba(255, 255, 255, 0.08)',
    input: '#161412',

    // Gourmet Foodie Primary (Vibrant Saffron Ember)
    primary: '#FF5420',
    primaryFocus: '#FF6F3D',
    primaryActive: '#E03E0B',
    primaryForeground: '#FFFFFF',
    onPrimary: '#FFFFFF',

    secondary: '#251E1A',
    secondaryForeground: '#FDFBF7',
    accentGold: '#F59E0B',
    accentSage: '#10B981',

    success: '#10B981',
    successLight: '#0E3324',
    successForeground: '#6EE7B7',
    destructive: '#EF4444',
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
