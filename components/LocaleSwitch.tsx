"use client";

import { COMMON_TEXT, LOCALE_MODES, type Locale, type LocaleMode } from "../lib/i18n";

type LocaleSwitchProps = {
  mode: LocaleMode;
  locale: Locale;
  onChange: (mode: LocaleMode) => void;
  compact?: boolean;
};

export function LocaleSwitch({ mode, locale, onChange, compact = false }: LocaleSwitchProps) {
  const text = COMMON_TEXT[locale];
  return (
    <div className={compact ? "locale-switch compact" : "locale-switch"} aria-label={text.language}>
      {compact ? null : <span>{text.language}</span>}
      <div className="locale-switch-options" role="group" aria-label={text.resolvedLanguage}>
        {LOCALE_MODES.map((candidate) => (
          <button
            aria-pressed={mode === candidate}
            className={mode === candidate ? "active" : ""}
            key={candidate}
            type="button"
            onClick={() => onChange(candidate)}
          >
            {text[candidate]}
          </button>
        ))}
      </div>
    </div>
  );
}
