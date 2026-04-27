# @pulse/i18n

Thai + English bilingual labels. Owned by **Role 5 (i18n Agent)** in [../../AGENTS.md](../../AGENTS.md).

## Public API
```tsx
import { t, Bilingual, useLocale } from "@pulse/i18n";

t("nav.overview")  // → "Overview" or "ภาพรวม" depending on locale
<Bilingual th="ตลาดรวม" en="TOTAL MARKET CAP" />
const [locale, setLocale] = useLocale();
```

## Rule
**Every user-facing string must go through this package.** Never hardcode Thai or English in components.
