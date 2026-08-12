import { useLanguage } from '../i18n/LanguageContext.jsx'

export default function LanguageSwitch({ className = '' }) {
  const { language, setLanguage, t } = useLanguage()
  return (
    <div className={`language-switch ${className}`.trim()} role="group" aria-label={t('common.language')}>
      {['ky', 'ru'].map((option) => (
        <button
          className={language === option ? 'is-active' : ''}
          type="button"
          aria-pressed={language === option}
          onClick={() => setLanguage(option)}
          key={option}
        >
          {option.toUpperCase()}
        </button>
      ))}
    </div>
  )
}
