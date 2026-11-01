/**
 * Named CSS colors. They are the base color vocabulary: use them directly
 * (`color: "black"`, `color: "blue"`) instead of writing hex codes by hand.
 */
export const CSS_COLOR_NAMES = [
  "transparent",
  "aliceblue",
  "antiquewhite",
  "aqua",
  "aquamarine",
  "azure",
  "beige",
  "bisque",
  "black",
  "blanchedalmond",
  "blue",
  "blueviolet",
  "brown",
  "burlywood",
  "cadetblue",
  "chartreuse",
  "chocolate",
  "coral",
  "cornflowerblue",
  "cornsilk",
  "crimson",
  "cyan",
  "darkblue",
  "darkcyan",
  "darkgoldenrod",
  "darkgray",
  "darkgreen",
  "darkgrey",
  "darkkhaki",
  "darkmagenta",
  "darkolivegreen",
  "darkorange",
  "darkorchid",
  "darkred",
  "darksalmon",
  "darkseagreen",
  "darkslateblue",
  "darkslategray",
  "darkslategrey",
  "darkturquoise",
  "darkviolet",
  "deeppink",
  "deepskyblue",
  "dimgray",
  "dimgrey",
  "dodgerblue",
  "firebrick",
  "floralwhite",
  "forestgreen",
  "fuchsia",
  "gainsboro",
  "ghostwhite",
  "gold",
  "goldenrod",
  "gray",
  "green",
  "greenyellow",
  "grey",
  "honeydew",
  "hotpink",
  "indianred",
  "indigo",
  "ivory",
  "khaki",
  "lavender",
  "lavenderblush",
  "lawngreen",
  "lemonchiffon",
  "lightblue",
  "lightcoral",
  "lightcyan",
  "lightgoldenrodyellow",
  "lightgray",
  "lightgreen",
  "lightgrey",
  "lightpink",
  "lightsalmon",
  "lightseagreen",
  "lightskyblue",
  "lightslategray",
  "lightslategrey",
  "lightsteelblue",
  "lightyellow",
  "lime",
  "limegreen",
  "linen",
  "magenta",
  "maroon",
  "mediumaquamarine",
  "mediumblue",
  "mediumorchid",
  "mediumpurple",
  "mediumseagreen",
  "mediumslateblue",
  "mediumspringgreen",
  "mediumturquoise",
  "mediumvioletred",
  "midnightblue",
  "mintcream",
  "mistyrose",
  "moccasin",
  "navajowhite",
  "navy",
  "oldlace",
  "olive",
  "olivedrab",
  "orange",
  "orangered",
  "orchid",
  "palegoldenrod",
  "palegreen",
  "paleturquoise",
  "palevioletred",
  "papayawhip",
  "peachpuff",
  "peru",
  "pink",
  "plum",
  "powderblue",
  "purple",
  "rebeccapurple",
  "red",
  "rosybrown",
  "royalblue",
  "saddlebrown",
  "salmon",
  "sandybrown",
  "seagreen",
  "seashell",
  "sienna",
  "silver",
  "skyblue",
  "slateblue",
  "slategray",
  "slategrey",
  "snow",
  "springgreen",
  "steelblue",
  "tan",
  "teal",
  "thistle",
  "tomato",
  "turquoise",
  "violet",
  "wheat",
  "white",
  "whitesmoke",
  "yellow",
  "yellowgreen",
] as const

export type ColorName = (typeof CSS_COLOR_NAMES)[number]

/**
 * Custom named colors are opt-in: augment this interface from the app to get
 * strict typing and autocomplete for `theme.set({ colors: ... })` tokens.
 *
 *   declare module "pulsar" {
 *     interface ThemeColors {
 *       brand: string
 *       ink: string
 *     }
 *   }
 */
export interface ThemeColors {}

export type ThemeColor = keyof ThemeColors

export type HexColor = `#${string}`
export type CssFunctionColor =
  | `rgb(${string})`
  | `rgba(${string})`
  | `hsl(${string})`
  | `hsla(${string})`

/** Any value a color prop accepts: a named color, a theme token, or a CSS color. */
export type ColorValue = ColorName | ThemeColor | HexColor | CssFunctionColor

export interface ThemeMotion {
  fast?: number
  normal?: number
  slow?: number
}

/** A custom token palette and the design scales a theme can override. */
export interface Theme {
  /** Custom named colors referenced by `ColorValue` tokens. */
  colors?: Record<string, string>
  /** Default corner radius, or a named radius scale. */
  radius?: number | Record<string, number>
  /** Default spacing unit, or a named spacing scale. */
  spacing?: number | Record<string, number>
  motion?: ThemeMotion
}

export const defineTheme = <T extends Theme>(theme: T): T => {
  return theme
}

const colorNames = new Set<string>(CSS_COLOR_NAMES)

/** Whether a string is one of the built-in named CSS colors. */
export const isColorName = (value: string): value is ColorName => {
  return colorNames.has(value)
}
