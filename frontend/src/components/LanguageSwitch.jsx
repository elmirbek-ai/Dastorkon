import { useLanguage } from '../i18n/LanguageContext.jsx'

const languageLabels = {
  ky: 'Кыргызча',
  ru: 'Русский',
}

export default function LanguageSwitch({ className = '', compact = false }) {
  const { language, setLanguage, t } = useLanguage()
  return (
    <label className={`language-switch ${compact ? 'language-switch--compact' : ''} ${className}`.trim()}>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18" />
      </svg>
      <select
        value={language}
        onChange={(event) => setLanguage(event.target.value)}
        aria-label={t('common.language')}
      >
        {['ky', 'ru'].map((option) => (
          <option value={option} key={option}>
            {compact ? option.toUpperCase() : languageLabels[option]}
          </option>
        ))}
      </select>
      <svg className="language-switch__chevron" viewBox="0 0 24 24" aria-hidden="true">
        <path d="m7 9 5 5 5-5" />
      </svg>
    </label>
  )
}
