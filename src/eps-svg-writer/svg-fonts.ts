import type { SvgFontDescriptor, SvgFontMap } from "../types.js";

interface CssFont {
  family: string;
  weight?: string;
  style?: string;
  stretch?: string;
}

interface SvgFontDescriptorNormalized {
  family?: string;
  fallbacks?: string[];
  weight?: string;
  style?: string;
  stretch?: string;
}

interface FontFamilyRule {
  aliases: readonly string[];
  family: string;
}

const FONT_FAMILY_RULES: readonly FontFamilyRule[] = [
  {
    aliases: ["helveticanarrow", "arialnarrow"],
    family: "Arial Narrow, Arial, sans-serif"
  },
  {
    aliases: ["helveticaneue", "helvetica", "arial"],
    family: "Arial, sans-serif"
  },
  { aliases: ["couriernew", "courier"], family: "Courier New, monospace" },
  { aliases: ["timesnewroman", "times"], family: "Times New Roman, serif" },
  {
    aliases: ["palatinolinotype", "palatino"],
    family: "Palatino Linotype, Palatino, serif"
  },
  {
    aliases: ["bookmanoldstyle", "bookman"],
    family: "Bookman Old Style, serif"
  },
  {
    aliases: ["newcenturyschlbk", "centuryschoolbook"],
    family: "Century Schoolbook, serif"
  },
  {
    aliases: ["avantgarde"],
    family: "Avant Garde, Century Gothic, sans-serif"
  },
  {
    aliases: ["zapfchancery"],
    family: "Apple Chancery, Zapf Chancery, cursive"
  },
  { aliases: ["zapfdingbats"], family: "Zapf Dingbats, sans-serif" },
  { aliases: ["symbol"], family: "Symbol, serif" }
];

/** Normalize a PostScript font name for alias matching. */
function normalizeFontName(font: string): string {
  return font.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Remove common PostScript suffixes before font alias matching. */
function normalizeFontAlias(font: string): string {
  return normalizeFontName(font).replace(/(?:ps|mt|std|pro)/g, "");
}

/** Find a standard CSS family for a normalized PostScript font name. */
function knownFontFamily(normalized: string): string | undefined {
  return FONT_FAMILY_RULES.find((rule) =>
    rule.aliases.some((alias) => normalized.startsWith(alias))
  )?.family;
}

/** Infer a CSS font weight from a normalized font name. */
function inferWeight(normalized: string): string | undefined {
  if (/(thin|hairline)/.test(normalized)) return "100";
  if (/(extralight|ultralight)/.test(normalized)) return "200";
  if (/light/.test(normalized)) return "300";
  if (/(regular|normal|book)/.test(normalized)) return "400";
  if (/medium/.test(normalized)) return "500";
  if (/(semibold|demibold)/.test(normalized)) return "600";
  if (/bold/.test(normalized)) return "700";
  if (/(extrabold|ultrabold)/.test(normalized)) return "800";
  if (/(black|heavy)/.test(normalized)) return "900";
  return undefined;
}

/** Infer a CSS font style from a normalized font name. */
function inferStyle(normalized: string): string | undefined {
  if (/oblique/.test(normalized)) return "oblique";
  if (/italic/.test(normalized)) return "italic";
  return undefined;
}

/** Infer a CSS font stretch from a normalized font name. */
function inferStretch(normalized: string): string | undefined {
  if (/(ultracondensed|extracondensed)/.test(normalized))
    return "extra-condensed";
  if (/(semicondensed|condensed|narrow)/.test(normalized)) return "condensed";
  if (/expanded/.test(normalized)) return "expanded";
  if (/(extraexpanded|extended)/.test(normalized)) return "extra-expanded";
  return undefined;
}

/** Select a generic CSS fallback for an unknown font family. */
function inferGenericFallback(normalized: string): string {
  if (/(mono|courier|code|typewriter|console)/.test(normalized))
    return "monospace";
  if (/(script|chancery)/.test(normalized)) return "cursive";
  if (/(symbol|dingbat|math)/.test(normalized)) return "serif";
  if (
    /(serif|roman|garamond|times|georgia|palatino|bookman|schoolbook|cambria)/.test(
      normalized
    )
  )
    return "serif";
  return "sans-serif";
}

/** Validate and normalize a caller-provided font descriptor. */
function normalizeDescriptor(
  value: unknown
): SvgFontDescriptorNormalized | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const descriptor = value as SvgFontDescriptor;
  const family =
    typeof descriptor.family === "string"
      ? descriptor.family.trim()
      : undefined;
  const fallbacks = Array.isArray(descriptor.fallbacks)
    ? descriptor.fallbacks.filter(
        (fallback): fallback is string =>
          typeof fallback === "string" && fallback.trim().length > 0
      )
    : undefined;
  const weight =
    typeof descriptor.weight === "number"
      ? String(descriptor.weight)
      : typeof descriptor.weight === "string"
        ? descriptor.weight.trim()
        : undefined;
  const style =
    typeof descriptor.style === "string" ? descriptor.style.trim() : undefined;
  const stretch =
    typeof descriptor.stretch === "string"
      ? descriptor.stretch.trim()
      : undefined;
  if (
    !family &&
    (!fallbacks || fallbacks.length === 0) &&
    !weight &&
    !style &&
    !stretch
  )
    return null;
  return {
    family,
    fallbacks: fallbacks && fallbacks.length > 0 ? fallbacks : undefined,
    weight,
    style,
    stretch
  };
}

/** Resolve an exact or normalized custom font mapping. */
function resolveCustomFont(
  font: string,
  customFonts: SvgFontMap
): string | SvgFontDescriptor | undefined {
  if (Object.prototype.hasOwnProperty.call(customFonts, font))
    return customFonts[font];
  const normalized = normalizeFontName(font);
  const normalizedAlias = normalizeFontAlias(font);
  for (const [name, descriptor] of Object.entries(customFonts)) {
    const candidate = normalizeFontName(name);
    if (candidate === normalized) return descriptor;
    if (
      candidate.length > 0 &&
      (normalized.startsWith(candidate) ||
        normalizedAlias.startsWith(candidate))
    ) {
      return descriptor;
    }
  }
  return undefined;
}

/** Convert a PostScript font name and mapping into CSS font attributes. */
export function toCssFont(
  font: string,
  customFonts: SvgFontMap,
  warnUnknown: (fontName: string) => void,
  warnMalformedDescriptor: (fontName: string) => void
): CssFont {
  const normalized = normalizeFontAlias(font);
  const knownFamily = knownFontFamily(normalized);
  const inferred: CssFont = {
    family:
      knownFamily ??
      (font ? `${font}, ${inferGenericFallback(normalized)}` : "sans-serif"),
    weight: inferWeight(normalized),
    style: inferStyle(normalized),
    stretch: inferStretch(normalized)
  };

  const custom = resolveCustomFont(font, customFonts);
  if (typeof custom === "string") {
    return { ...inferred, family: custom };
  }
  if (custom !== undefined) {
    const descriptor = normalizeDescriptor(custom);
    if (!descriptor) {
      warnMalformedDescriptor(font);
      return inferred;
    }
    const families = [
      descriptor.family,
      ...(descriptor.fallbacks ?? [])
    ].filter(
      (value): value is string =>
        typeof value === "string" && value.trim().length > 0
    );
    return {
      family: families.length > 0 ? families.join(", ") : inferred.family,
      weight: descriptor.weight ?? inferred.weight,
      style: descriptor.style ?? inferred.style,
      stretch: descriptor.stretch ?? inferred.stretch
    };
  }

  if (!knownFamily) warnUnknown(font || "(empty)");
  return inferred;
}
