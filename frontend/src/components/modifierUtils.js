export function modifierSelectionPayload(item, selections) {
  return (item.modifier_groups || [])
    .map((group) => ({
      group_id: group.id,
      option_ids: selections[group.id] || [],
    }))
    .filter((selection) => selection.option_ids.length > 0)
}

export function modifierSelectionTotal(item, selections) {
  return (item.modifier_groups || []).reduce((total, group) => {
    const selectedIds = new Set(selections[group.id] || [])
    return total + (group.options || []).reduce(
      (groupTotal, option) => (
        selectedIds.has(option.id)
          ? groupTotal + Number(option.price_delta || 0)
          : groupTotal
      ),
      0,
    )
  }, 0)
}

export function modifierSelectionErrors(item, selections, t) {
  const errors = {}
  for (const group of item.modifier_groups || []) {
    const count = (selections[group.id] || []).length
    if (group.is_required && count === 0) {
      errors[group.id] = t('modifiers.requiredMissing')
      continue
    }
    if (group.selection_type === 'SINGLE' && count > 1) {
      errors[group.id] = t('modifiers.singleLimit')
      continue
    }
    if (group.selection_type === 'MULTIPLE' && count > 0) {
      if (count < Number(group.min_selected || 0)) {
        errors[group.id] = t('modifiers.minimumRequired', { count: group.min_selected })
      } else if (group.max_selected !== null && count > Number(group.max_selected)) {
        errors[group.id] = t('modifiers.maximumAllowed', { count: group.max_selected })
      }
    }
  }
  return errors
}

export function selectedModifierDetails(item, selections) {
  return (item.modifier_groups || []).flatMap((group) => {
    const selectedIds = new Set(selections[group.id] || [])
    return (group.options || [])
      .filter((option) => selectedIds.has(option.id))
      .map((option) => ({
        group_id: group.id,
        group_name_ky: group.name_ky,
        group_name_ru: group.name_ru,
        option_id: option.id,
        option_name_ky: option.name_ky,
        option_name_ru: option.name_ru,
        price_delta: option.price_delta,
      }))
  })
}
