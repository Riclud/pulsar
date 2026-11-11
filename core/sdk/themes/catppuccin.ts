import type { ThemeOptions } from "../caps.ts"
import type { ColorValue } from "../theme.ts"

export interface CatppuccinPalette {
  rosewater: ColorValue
  flamingo: ColorValue
  pink: ColorValue
  mauve: ColorValue
  red: ColorValue
  maroon: ColorValue
  peach: ColorValue
  yellow: ColorValue
  green: ColorValue
  teal: ColorValue
  sky: ColorValue
  sapphire: ColorValue
  blue: ColorValue
  lavender: ColorValue
  text: ColorValue
  subtext1: ColorValue
  subtext0: ColorValue
  overlay2: ColorValue
  overlay1: ColorValue
  overlay0: ColorValue
  surface2: ColorValue
  surface1: ColorValue
  surface0: ColorValue
  base: ColorValue
  mantle: ColorValue
  crust: ColorValue
}

/** Catppuccin Frappé, the dark flavor that matches the illogical-impulse setup. */
export const catppuccinFrappe: CatppuccinPalette = {
  rosewater: "#f2d5cf",
  flamingo: "#eebebe",
  pink: "#f4b8e4",
  mauve: "#ca9ee6",
  red: "#e78284",
  maroon: "#ea999c",
  peach: "#ef9f76",
  yellow: "#e5c890",
  green: "#a6d189",
  teal: "#81c8be",
  sky: "#99d1db",
  sapphire: "#85c1dc",
  blue: "#8caaee",
  lavender: "#babbf1",
  text: "#c6d0f5",
  subtext1: "#b5bfe2",
  subtext0: "#a5adce",
  overlay2: "#949cbb",
  overlay1: "#838ba7",
  overlay0: "#737994",
  surface2: "#626880",
  surface1: "#51576d",
  surface0: "#414559",
  base: "#303446",
  mantle: "#292c3c",
  crust: "#232634",
}

/** Catppuccin Latte, the matching light flavor. */
export const catppuccinLatte: CatppuccinPalette = {
  rosewater: "#dc8a78",
  flamingo: "#dd7878",
  pink: "#ea76cb",
  mauve: "#8839ef",
  red: "#d20f39",
  maroon: "#e64553",
  peach: "#fe640b",
  yellow: "#df8e1d",
  green: "#40a02b",
  teal: "#179299",
  sky: "#04a5e5",
  sapphire: "#209fb5",
  blue: "#1e66f5",
  lavender: "#7287fd",
  text: "#4c4f69",
  subtext1: "#5c5f77",
  subtext0: "#6c6f85",
  overlay2: "#7c7f93",
  overlay1: "#8c8fa1",
  overlay0: "#9ca0b0",
  surface2: "#acb0be",
  surface1: "#bcc0cc",
  surface0: "#ccd0da",
  base: "#eff1f5",
  mantle: "#e6e9ef",
  crust: "#dce0e8",
}

export const catppuccin = {
  frappe: catppuccinFrappe,
  latte: catppuccinLatte,
}

export type CatppuccinFlavor = keyof typeof catppuccin

/** Theme options that switch the app to a Catppuccin flavor. */
export const catppuccinTheme = (flavor: CatppuccinFlavor = "frappe"): ThemeOptions => {
  const palette = catppuccin[flavor]

  return {
    palette: {
      background: palette.base,
      surface: palette.surface0,
      surfaceVariant: palette.surface1,
      primary: palette.mauve,
      text: palette.text,
      textSecondary: palette.subtext0,
      border: palette.surface2,
      radius: 12,
      spacing: 8,
    },
    colors: {
      rosewater: palette.rosewater,
      flamingo: palette.flamingo,
      pink: palette.pink,
      mauve: palette.mauve,
      red: palette.red,
      maroon: palette.maroon,
      peach: palette.peach,
      yellow: palette.yellow,
      green: palette.green,
      teal: palette.teal,
      sky: palette.sky,
      sapphire: palette.sapphire,
      blue: palette.blue,
      lavender: palette.lavender,
      text: palette.text,
      subtext: palette.subtext0,
      overlay: palette.overlay0,
      surface: palette.surface0,
      base: palette.base,
      mantle: palette.mantle,
      crust: palette.crust,
    },
  }
}
