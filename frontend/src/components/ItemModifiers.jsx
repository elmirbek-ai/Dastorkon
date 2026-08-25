import { getLocalizedField } from '../i18n/index.js'
import { useLanguage } from '../i18n/LanguageContext.jsx'

function formatPriceDelta(value, t) {
  const amount = Number(value ?? 0)
  if (!amount) return t('modifiers.included')
  const formatted = Number.isInteger(amount) ? amount : amount.toFixed(2)
  return `+${formatted} ${t('common.som')}`
}

export function ModifierGroupsPicker({ item, selections, onChange, errors = {}, disabled = false }) {
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
        const groupError = errors[group.id] || ''
        const groupErrorId = `modifier-group-${item.id}-${group.id}-error`
        const groupRule = group.selection_type === 'SINGLE'
          ? t('modifiers.chooseOne')
          : group.min_selected > 0 && group.max_selected !== null
            ? t('modifiers.selectionRange', { min: group.min_selected, max: group.max_selected })
            : group.min_selected > 0
              ? t('modifiers.selectionMinimum', { count: group.min_selected })
              : group.max_selected !== null
                ? t('modifiers.maximumAllowed', { count: group.max_selected })
                : t('modifiers.chooseSeveral')
        return (
          <fieldset
            className={`modifier-picker__group ${groupError ? 'is-invalid' : ''}`}
            data-modifier-group-id={group.id}
            aria-invalid={groupError ? 'true' : undefined}
            aria-describedby={groupErrorId}
            key={group.id}
          >
            <legend>
              <span>{getLocalizedField(group, 'name', language)}</span>
              <small className={group.is_required ? 'is-required' : ''}>
                {group.is_required ? t('modifiers.required') : t('modifiers.optional')}
              </small>
            </legend>
            <div className={`modifier-picker__meta ${groupError ? 'is-invalid' : ''}`}>
              <span id={groupErrorId} role={groupError ? 'alert' : undefined}>
                {groupError || groupRule}
              </span>
              <strong>{t('modifiers.selectedCount', { count: selectedIds.length })}</strong>
            </div>
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
                    <small className={Number(option.price_delta) > 0 ? 'has-price' : 'is-included'}>
                      {formatPriceDelta(option.price_delta, t)}
                    </small>
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

function ModifierSummary({ groups, className = '', showPriceDeltas = false }) {
  const { language, t } = useLanguage()
  if (!Array.isArray(groups) || groups.length === 0) return null
  const visibleGroups = groups
    .map((group) => ({
      ...group,
      name: getLocalizedField(group, 'group_name', language),
      options: (group.options || []).filter((option) => (
        getLocalizedField(option, 'option_name', language)
      )),
    }))
    .filter((group) => group.name && group.options.length > 0)
  if (visibleGroups.length === 0) return null
  return (
    <ul className={`selected-modifiers ${className}`.trim()}>
      {visibleGroups.map((group, groupIndex) => (
        <li key={group.group_id || `${group.name}-${groupIndex}`}>
          <b>{group.name}</b>
          <span>
            {group.options.map((option, optionIndex) => {
              const optionName = getLocalizedField(option, 'option_name', language)
              const delta = Number(option.price_delta || 0)
              return (
                <span className="selected-modifiers__option" key={option.option_id || option.id || `${optionName}-${optionIndex}`}>
                  {optionName}
                  {showPriceDeltas && delta > 0 && (
                    <em>+{Number.isInteger(delta) ? delta : delta.toFixed(2)} {t('common.som')}</em>
                  )}
                </span>
              )
            })}
          </span>
        </li>
      ))}
    </ul>
  )
}

export function CartItemModifiers({ groups, className = '', showPriceDeltas = false }) {
  const normalizedGroups = (groups || []).map((group) => ({
    ...group,
    options: (group.options || []).map((option) => ({
      ...option,
      option_name_ky: option.name_ky,
      option_name_ru: option.name_ru,
    })),
  }))
  return <ModifierSummary groups={normalizedGroups} className={className} showPriceDeltas={showPriceDeltas} />
}

function snapshotsToGroups(modifiers) {
  if (!Array.isArray(modifiers) || modifiers.length === 0) return null
  const groups = []
  modifiers.forEach((modifier) => {
    const groupKey = `${modifier.group_name_ky || ''}|${modifier.group_name_ru || ''}`
    let group = groups.find((entry) => entry.key === groupKey)
    if (!group) {
      group = {
        key: groupKey,
        group_name_ky: modifier.group_name_ky,
        group_name_ru: modifier.group_name_ru,
        options: [],
      }
      groups.push(group)
    }
    group.options.push(modifier)
  })
  return groups
}

export function OrderItemModifiers({ modifiers, className = '', showPriceDeltas = false }) {
  return <ModifierSummary groups={snapshotsToGroups(modifiers)} className={className} showPriceDeltas={showPriceDeltas} />
}

export function DraftItemModifiers({ modifiers, className = '', showPriceDeltas = false }) {
  return <ModifierSummary groups={snapshotsToGroups(modifiers)} className={className} showPriceDeltas={showPriceDeltas} />
}
