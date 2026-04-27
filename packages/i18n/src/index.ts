// @pulse/i18n — public exports

export { dict } from "./dict";
export type { Locale, Entry, DictKey } from "./dict";

export { LocaleProvider, useLocale } from "./LocaleContext";
export type { LocaleProviderProps } from "./LocaleContext";

export { translate, useT, t } from "./t";

export { Bilingual } from "./Bilingual";
export type { BilingualProps, BilingualVariant } from "./Bilingual";
