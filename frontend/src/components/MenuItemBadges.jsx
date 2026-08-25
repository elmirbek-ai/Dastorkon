import { useLanguage } from '../i18n/LanguageContext.jsx'
import { MENU_SALES_LABELS } from './menuItemLabels.js'

export default function MenuItemBadges({ item, className = '' }) {
  const { t } = useLanguage()
  const activeLabels = MENU_SALES_LABELS.filter(({ field }) => item?.[field])
  const prepTime = Number(item?.cooking_time_min)

  if (!activeLabels.length && !(prepTime > 0)) return null

  return (
    <span className={`menu-item-badges ${className}`.trim()}>
      {activeLabels.map(({ key }) => (
        <span className={`menu-item-badge menu-item-badge--${key}`} key={key}>
          {t(`menuLabels.${key}`)}
        </span>
      ))}
      {prepTime > 0 && (
        <span className="menu-item-badge menu-item-badge--prep">
          ◷ {t('menuLabels.prepMinutes', { count: prepTime })}
        </span>
      )}
    </span>
  )
}
