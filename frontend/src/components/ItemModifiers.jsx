import { getLocalizedField } from '../i18n/index.js'
import { useLanguage } from '../i18n/LanguageContext.jsx'

function formatPriceDelta(value, t) {
  const amount = Number(value ?? 0)
  if (!amount) return t('modifiers.included')
  const formatted = Number.isInteger(amount) ? amount : amount.toFixed(2)
  return `+${formatted} ${t('common.som')}`
}

export function ModifierGroupsPicker({ item, selections, onChange, invalidGroupId, disabled = false }) {
  const { language, t } = useLanguage()

  function toggleOption(group, optionId) {
    const current = selections[group.id] || []
    if (group.selection_type === 'SINGLE') {
      onChange({ ...selections, [group.id]: [optionId] })
      return
    }
    const selected = current.includes(optionId)
    onChange({
      ...selections,
      [group.id]: selected
        ? current.filter((id) => id !== optionId)
        : [...current, optionId],
    })
  }

  return (
    <div className="modifier-picker">
      {(item.modifier_groups || []).map((group) => {
        const selectedIds = selections[group.id] || []
        const atMaximum = group.selection_type === 'MULTIPLE'
          && group.max_selected !== null
          && selectedIds.length >= Number(group.max_selected)
        return (
          <fieldset
            className={`modifier-picker__group ${invalidGroupId === group.id ? 'is-invalid' : ''}`}
            key={group.id}
          >
            <legend>
              <span>{getLocalizedField(group, 'name', language)}</span>
              <small className={group.is_required ? 'is-required' : ''}>
                {group.is_required ? t('modifiers.required') : t('modifiers.optional')}
              </small>
            </legend>
            {group.selection_type === 'MULTIPLE' && (group.min_selected > 0 || group.max_selected !== null) && (
              <p className="modifier-picker__limit">
                {group.max_selected !== null
                  ? t('modifiers.selectionRange', { min: group.min_selected, max: group.max_selected })
                  : t('modifiers.selectionMinimum', { count: group.min_selected })}
              </p>
            )}
            <div className="modifier-picker__options">
              {(group.options || []).map((option) => {
                const checked = selectedIds.includes(option.id)
                return (
                  <label className={checked ? 'is-selected' : ''} key={option.id}>
                    <input
                      type={group.selection_type === 'SINGLE' ? 'radio' : 'checkbox'}
                      name={`modifier-group-${item.id}-${group.id}`}
                      checked={checked}
                      onChange={() => toggleOption(group, option.id)}
                      disabled={disabled || (!checked && atMaximum)}
                    />
                    <span className="modifier-picker__control" aria-hidden="true" />
                    <strong>{getLocalizedField(option, 'name', language)}</strong>
                    <small>{formatPriceDelta(option.price_delta, t)}</small>
                  </label>
                )
              })}
            </div>
          </fieldset>
        )
      })}
    </div>
  )
}

export function CartItemModifiers({ groups, className = '' }) {
  const { language } = useLanguage()
  if (!Array.isArray(groups) || groups.length === 0) return null
  return (
    <ul className={`selected-modifiers ${className}`.trim()}>
      {groups.map((group) => (
        <li key={group.group_id}>
          <b>{getLocalizedField(group, 'group_name', language)}:</b>{' '}
          {(group.options || []).map((option) => getLocalizedField(option, 'name', language)).join(', ')}
        </li>
      ))}
    </ul>
  )
}

export function OrderItemModifiers({ modifiers, className = '' }) {
  const { language } = useLanguage()
  if (!Array.isArray(modifiers) || modifiers.length === 0) return null
  const groups = []
  modifiers.forEach((modifier) => {
    const groupName = getLocalizedField(modifier, 'group_name', language)
    let group = groups.find((entry) => entry.name === groupName)
    if (!group) {
      group = { name: groupName, options: [] }
      groups.push(group)
    }
    group.options.push(getLocalizedField(modifier, 'option_name', language))
  })
  return (
    <ul className={`selected-modifiers ${className}`.trim()}>
      {groups.map((group, index) => (
        <li key={`${group.name}-${index}`}><b>{group.name}:</b> {group.options.join(', ')}</li>
      ))}
    </ul>
  )
}

export function DraftItemModifiers({ modifiers, className = '' }) {
  const { language } = useLanguage()
  if (!Array.isArray(modifiers) || modifiers.length === 0) return null
  const groups = []
  modifiers.forEach((modifier) => {
    const groupName = getLocalizedField(modifier, 'group_name', language)
    let group = groups.find((entry) => entry.name === groupName)
    if (!group) {
      group = { name: groupName, options: [] }
      groups.push(group)
    }
    group.options.push(getLocalizedField(modifier, 'option_name', language))
  })
  return (
    <ul className={`selected-modifiers ${className}`.trim()}>
      {groups.map((group, index) => (
        <li key={`${group.name}-${index}`}><b>{group.name}:</b> {group.options.join(', ')}</li>
      ))}
    </ul>
  )
}
