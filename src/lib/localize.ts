import type { Locale } from "@/lib/i18n/dictionaries";

type NamedZhEn = { nameZh: string; nameZhTw: string; nameEn: string; nameMs: string; nameId: string };
type SegmentedZhEn = { segmentZh: string; segmentZhTw: string; segmentEn: string; segmentMs: string; segmentId: string };

export function localizedName(item: NamedZhEn, locale: Locale): string {
  switch (locale) {
    case "en":
      return item.nameEn;
    case "zh-Hant":
      return item.nameZhTw;
    case "ms":
      return item.nameMs;
    case "id":
      return item.nameId;
    default:
      return item.nameZh;
  }
}

export function localizedSegment(item: SegmentedZhEn, locale: Locale): string {
  switch (locale) {
    case "en":
      return item.segmentEn;
    case "zh-Hant":
      return item.segmentZhTw;
    case "ms":
      return item.segmentMs;
    case "id":
      return item.segmentId;
    default:
      return item.segmentZh;
  }
}

export function localizedText(
  item: { textZh: string; textZhTw: string; textEn: string; textMs: string; textId: string },
  locale: Locale
): string {
  switch (locale) {
    case "en":
      return item.textEn;
    case "zh-Hant":
      return item.textZhTw;
    case "ms":
      return item.textMs;
    case "id":
      return item.textId;
    default:
      return item.textZh;
  }
}

export function localizedSimple(item: { nameZh: string; nameEn: string }, locale: Locale): string {
  return locale === "en" ? item.nameEn : item.nameZh;
}

const MONTH_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function monthLabels(locale: Locale, count: number): string[] {
  return Array.from({ length: count }, (_, i) => {
    const m = i + 1;
    if (locale === "zh" || locale === "zh-Hant") return `${m}月`;
    return MONTH_EN[i];
  });
}
