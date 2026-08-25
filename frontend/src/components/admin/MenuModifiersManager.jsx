import { useEffect, useState } from 'react'
import { adminApiClient } from '../../api/client.js'
import { useLanguage } from '../../i18n/LanguageContext.jsx'
import { getLocalizedField } from '../../i18n/index.js'
import { useConfirm } from '../confirmation/useConfirm.js'
import { AdminIcon, EmptyState, ErrorBanner, LoadingState, Toggle } from './AdminComponents.jsx'

const modifierPresets = [
  {
    key: 'spiciness',
    label_ky: 'Ачуулугу',
    label_ru: 'Острота',
    group: {
      name_ky: 'Ачуулугу',
      name_ru: 'Острота',
      selection_type: 'SINGLE',
      is_required: true,
      min_selected: 1,
      max_selected: 1,
    },
    options: [
      { name_ky: 'Ачуу эмес', name_ru: 'Не остро', price_delta: '0.00' },
      { name_ky: 'Орточо', name_ru: 'Средне', price_delta: '0.00' },
      { name_ky: 'Ачуу', name_ru: 'Остро', price_delta: '0.00' },
    ],
  },
  {
    key: 'portion',
    label_ky: 'Порция',
    label_ru: 'Порция',
    group: {
      name_ky: 'Порция',
      name_ru: 'Порция',
      selection_type: 'SINGLE',
      is_required: false,
      min_selected: 0,
      max_selected: 1,
    },
    options: [
      { name_ky: 'Стандарт', name_ru: 'Стандарт', price_delta: '0.00' },
      { name_ky: 'Чоң', name_ru: 'Большая', price_delta: '80.00' },
    ],
  },
  {
    key: 'extras',
    label_ky: 'Кошумча',
    label_ru: 'Дополнительно',
    group: {
      name_ky: 'Кошумча',
      name_ru: 'Дополнительно',
      selection_type: 'MULTIPLE',
      is_required: false,
      min_selected: 0,
      max_selected: null,
    },
    options: [
      { name_ky: 'Сыр', name_ru: 'Сыр', price_delta: '30.00' },
      { name_ky: 'Соус', name_ru: 'Соус', price_delta: '20.00' },
      { name_ky: 'Картошка', name_ru: 'Картофель', price_delta: '80.00' },
    ],
  },
  {
    key: 'sauce',
    label_ky: 'Соус',
    label_ru: 'Соус',
    group: {
      name_ky: 'Соус',
      name_ru: 'Соус',
      selection_type: 'SINGLE',
      is_required: false,
      min_selected: 0,
      max_selected: 1,
    },
    options: [
      { name_ky: 'Кетчуп', name_ru: 'Кетчуп', price_delta: '0.00' },
      { name_ky: 'Сарымсак соусу', name_ru: 'Чесночный соус', price_delta: '20.00' },
      { name_ky: 'Ачуу соус', name_ru: 'Острый соус', price_delta: '20.00' },
    ],
  },
  {
    key: 'drink-size',
    label_ky: 'Суусундук көлөмү',
    label_ru: 'Размер напитка',
    group: {
      name_ky: 'Көлөмү',
      name_ru: 'Размер',
      selection_type: 'SINGLE',
      is_required: true,
      min_selected: 1,
      max_selected: 1,
    },
    options: [
      { name_ky: 'Кичине', name_ru: 'Маленький', price_delta: '0.00' },
      { name_ky: 'Орточо', name_ru: 'Средний', price_delta: '30.00' },
      { name_ky: 'Чоң', name_ru: 'Большой', price_delta: '60.00' },
    ],
  },
]

const emptyGroup = {
  name_ky: '',
  name_ru: '',
  selection_type: 'SINGLE',
  is_required: false,
  min_selected: '0',
  max_selected: '1',
  sort_order: '0',
  is_active: true,
}

const emptyOption = {
  name_ky: '',
  name_ru: '',
  price_delta: '0',
  sort_order: '0',
  is_available: true,
  is_active: true,
}

const modifierFieldKeys = {
  name_ky: 'modifierNameKy',
  name_ru: 'modifierNameRu',
  selection_type: 'modifierSelectionType',
  min_selected: 'modifierMinSelected',
  max_selected: 'modifierMaxSelected',
  sort_order: 'modifierSortOrder',
  price_delta: 'modifierPriceDelta',
}

function sortedByOrder(values) {
  return [...values].sort((left, right) => (
    Number(left.sort_order) - Number(right.sort_order)
    || String(left.name_ky).localeCompare(String(right.name_ky))
    || left.id - right.id
  ))
}

function normalizedPresetName(value) {
  return String(value || '').trim().toLocaleLowerCase()
}

function groupMatchesPreset(group, preset) {
  return normalizedPresetName(group.name_ky) === normalizedPresetName(preset.group.name_ky)
    && normalizedPresetName(group.name_ru) === normalizedPresetName(preset.group.name_ru)
}

function firstFieldError(data) {
  if (!data || typeof data !== 'object') return ['', '']
  for (const [field, value] of Object.entries(data)) {
    const message = Array.isArray(value) ? value[0] : value
    if (typeof message === 'string') return [field, message]
  }
  return ['', '']
}

function modifierApiError(error, t, handleApiError) {
  if (error.response?.status !== 400) {
    return handleApiError(error, t('errors.generic'))
  }

  const [field, message] = firstFieldError(error.response.data)
  const lowered = message.toLowerCase()
  const fieldLabel = t(`admin.${modifierFieldKeys[field] || 'modifierValue'}`)
  if (lowered.includes('required') || lowered.includes('blank')) {
    return t('admin.modifierRequiredError', { field: fieldLabel })
  }
  if (lowered.includes('maximum selections cannot be less')) {
    return t('admin.modifierMaxBelowMinError')
  }
  if (lowered.includes('single-selection groups cannot require')) {
    return t('admin.modifierSingleMinError')
  }
  if (lowered.includes('single-selection groups must have')) {
    return t('admin.modifierSingleMaxError')
  }
  if (lowered.includes('required groups must require')) {
    return t('admin.modifierRequiredMinError')
  }
  if (field === 'selection_type') return t('admin.modifierSelectionTypeError')
  if (lowered.includes('greater than or equal to 0')) {
    return t('admin.modifierNonNegativeError', { field: fieldLabel })
  }
  return t('admin.modifierInvalidValueError', { field: fieldLabel })
}

function normalizeGroup(group) {
  return {
    ...emptyGroup,
    ...group,
    min_selected: String(group.min_selected ?? 0),
    max_selected: group.max_selected === null ? '' : String(group.max_selected),
    sort_order: String(group.sort_order ?? 0),
  }
}

function normalizeOption(option, groupId) {
  return {
    ...emptyOption,
    ...option,
    groupId,
    price_delta: String(option.price_delta ?? 0),
    sort_order: String(option.sort_order ?? 0),
  }
}

function GroupForm({ value, saving, error, onChange, onSubmit, onCancel }) {
  const { t } = useLanguage()

  function changeSelectionType(selectionType) {
    onChange({
      ...value,
      selection_type: selectionType,
      min_selected: selectionType === 'SINGLE' && Number(value.min_selected) > 1
        ? (value.is_required ? '1' : '0')
        : value.min_selected,
      max_selected: selectionType === 'SINGLE' ? '1' : '',
    })
  }

  function changeRequired(required) {
    onChange({
      ...value,
      is_required: required,
      min_selected: required
        ? (Number(value.min_selected) < 1 ? '1' : value.min_selected)
        : '0',
    })
  }

  return (
    <form className="admin-modifier-form" onSubmit={onSubmit} aria-busy={saving}>
      <header>
        <div>
          <strong>{value.id ? t('admin.editModifierGroup') : t('admin.addModifierGroup')}</strong>
          <small>{t('admin.modifierGroupFormHelp')}</small>
        </div>
        <button type="button" onClick={onCancel} disabled={saving} aria-label={t('common.close')}><AdminIcon name="close" /></button>
      </header>
      <ErrorBanner message={error} />
      <fieldset disabled={saving}>
        <div className="admin-modifier-fields admin-modifier-fields--names">
          <label>
            {t('admin.modifierNameKy')}
            <input value={value.name_ky} onChange={(event) => onChange({ ...value, name_ky: event.target.value })} required />
          </label>
          <label>
            {t('admin.modifierNameRu')}
            <input value={value.name_ru} onChange={(event) => onChange({ ...value, name_ru: event.target.value })} required />
          </label>
        </div>
        <div className="admin-modifier-fields admin-modifier-fields--rules">
          <label>
            {t('admin.modifierSelectionType')}
            <select value={value.selection_type} onChange={(event) => changeSelectionType(event.target.value)}>
              <option value="SINGLE">{t('admin.modifierSingle')}</option>
              <option value="MULTIPLE">{t('admin.modifierMultiple')}</option>
            </select>
          </label>
          <label>
            {t('admin.modifierSortOrder')}
            <input type="number" min="0" step="1" value={value.sort_order} onChange={(event) => onChange({ ...value, sort_order: event.target.value })} required />
          </label>
        </div>
        <div className="admin-modifier-fields admin-modifier-fields--limits">
          <label>
            {t('admin.modifierMinSelected')}
            <input type="number" min={value.is_required ? '1' : '0'} max={value.selection_type === 'SINGLE' ? '1' : undefined} step="1" value={value.min_selected} onChange={(event) => onChange({ ...value, min_selected: event.target.value })} required />
            <small className={`admin-modifier-field-help ${value.is_required ? '' : 'is-placeholder'}`} aria-hidden={!value.is_required}>{t('admin.modifierRequiredMinHelp')}</small>
          </label>
          <label>
            {t('admin.modifierMaxSelected')}
            <input type="number" min="0" step="1" value={value.max_selected} onChange={(event) => onChange({ ...value, max_selected: event.target.value })} disabled={value.selection_type === 'SINGLE' || saving} placeholder={value.selection_type === 'MULTIPLE' ? t('admin.modifierNoLimit') : ''} />
            <small className={`admin-modifier-field-help ${value.selection_type === 'SINGLE' ? '' : 'is-placeholder'}`} aria-hidden={value.selection_type !== 'SINGLE'}>{t('admin.modifierSingleMaxHelp')}</small>
          </label>
        </div>
        <div className="admin-modifier-form__toggles">
          <Toggle checked={value.is_required} onChange={changeRequired} label={t('admin.modifierRequired')} disabled={saving} />
          <Toggle checked={value.is_active} onChange={(checked) => onChange({ ...value, is_active: checked })} label={t('common.active')} disabled={saving} />
        </div>
      </fieldset>
      <div className="admin-form-actions">
        <button type="button" onClick={onCancel} disabled={saving}>{t('common.cancel')}</button>
        <button className="is-primary" type="submit" disabled={saving}>{saving ? <><span className="admin-button-spinner" />{t('common.saving')}</> : t('common.save')}</button>
      </div>
    </form>
  )
}

function OptionForm({ value, saving, error, onChange, onSubmit, onCancel }) {
  const { t } = useLanguage()
  return (
    <form className="admin-modifier-form admin-modifier-option-form" onSubmit={onSubmit} aria-busy={saving}>
      <header>
        <div>
          <strong>{value.id ? t('admin.editModifierOption') : t('admin.addModifierOption')}</strong>
          <small>{t('admin.modifierOptionFormHelp')}</small>
        </div>
        <button type="button" onClick={onCancel} disabled={saving} aria-label={t('common.close')}><AdminIcon name="close" /></button>
      </header>
      <ErrorBanner message={error} />
      <fieldset disabled={saving}>
        <div className="admin-modifier-fields admin-modifier-fields--names">
          <label>
            {t('admin.modifierNameKy')}
            <input value={value.name_ky} onChange={(event) => onChange({ ...value, name_ky: event.target.value })} required />
          </label>
          <label>
            {t('admin.modifierNameRu')}
            <input value={value.name_ru} onChange={(event) => onChange({ ...value, name_ru: event.target.value })} required />
          </label>
        </div>
        <div className="admin-modifier-fields admin-modifier-fields--rules">
          <label>
            {t('admin.modifierPriceDelta')}
            <input type="number" min="0" step="0.01" value={value.price_delta} onChange={(event) => onChange({ ...value, price_delta: event.target.value })} required />
          </label>
          <label>
            {t('admin.modifierSortOrder')}
            <input type="number" min="0" step="1" value={value.sort_order} onChange={(event) => onChange({ ...value, sort_order: event.target.value })} required />
          </label>
        </div>
        <div className="admin-modifier-form__toggles">
          <Toggle checked={value.is_available} onChange={(checked) => onChange({ ...value, is_available: checked })} label={t('common.available')} disabled={saving} />
          <Toggle checked={value.is_active} onChange={(checked) => onChange({ ...value, is_active: checked })} label={t('common.active')} disabled={saving} />
        </div>
      </fieldset>
      <div className="admin-form-actions">
        <button type="button" onClick={onCancel} disabled={saving}>{t('common.cancel')}</button>
        <button className="is-primary" type="submit" disabled={saving}>{saving ? <><span className="admin-button-spinner" />{t('common.saving')}</> : t('common.save')}</button>
      </div>
    </form>
  )
}

export default function MenuModifiersManager({ menuItem, handleApiError, onBusyChange }) {
  const { language, t } = useLanguage()
  const confirm = useConfirm()
  const [groups, setGroups] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [formError, setFormError] = useState('')
  const [editingGroup, setEditingGroup] = useState(null)
  const [editingOption, setEditingOption] = useState(null)
  const [operation, setOperation] = useState('')
  const [presetFeedback, setPresetFeedback] = useState('')
  const busy = Boolean(operation)

  useEffect(() => {
    onBusyChange(busy)
  }, [busy, onBusyChange])

  useEffect(() => {
    let active = true
    adminApiClient.get(`/api/admin/menu-items/${menuItem.id}/modifier-groups/`)
      .then((response) => {
        if (!active) return
        setGroups(sortedByOrder(response.data))
        setError('')
      })
      .catch((requestError) => {
        if (active) setError(modifierApiError(requestError, t, handleApiError))
      })
      .finally(() => active && setLoading(false))
    return () => { active = false }
  }, [menuItem.id, handleApiError, t])

  async function reloadGroups() {
    const response = await adminApiClient.get(`/api/admin/menu-items/${menuItem.id}/modifier-groups/`)
    const nextGroups = sortedByOrder(response.data)
    setGroups(nextGroups)
    return nextGroups
  }

  async function createPreset(preset) {
    if (busy || groups.some((group) => groupMatchesPreset(group, preset))) return

    const presetOperation = `preset-${preset.key}`
    const nextSortOrder = groups.reduce(
      (maximum, group) => Math.max(maximum, Number(group.sort_order) || 0),
      -1,
    ) + 1
    setOperation(presetOperation)
    setError('')
    setFormError('')
    setPresetFeedback('')

    let groupCreated = false
    try {
      const groupResponse = await adminApiClient.post(
        `/api/admin/menu-items/${menuItem.id}/modifier-groups/`,
        {
          ...preset.group,
          sort_order: nextSortOrder,
          is_active: true,
        },
      )
      groupCreated = true
      for (const [index, option] of preset.options.entries()) {
        await adminApiClient.post(
          `/api/admin/modifier-groups/${groupResponse.data.id}/options/`,
          {
            ...option,
            sort_order: index,
            is_available: true,
            is_active: true,
          },
        )
      }
    } catch (requestError) {
      const apiMessage = modifierApiError(requestError, t, handleApiError)
      if (groupCreated) {
        setError(`${t('admin.modifierPresetPartialError')} ${apiMessage}`)
        try {
          await reloadGroups()
        } catch {
          // Keep the original creation error visible.
        }
      } else {
        setError(apiMessage)
      }
      setOperation('')
      return
    }

    try {
      await reloadGroups()
      setPresetFeedback(t('admin.modifierPresetAddedFeedback', {
        name: getLocalizedField(preset, 'label', language),
      }))
    } catch (requestError) {
      setError(modifierApiError(requestError, t, handleApiError))
    } finally {
      setOperation('')
    }
  }

  function startGroupCreate() {
    setEditingOption(null)
    setFormError('')
    setPresetFeedback('')
    setEditingGroup({ ...emptyGroup })
  }

  function startGroupEdit(group) {
    setEditingOption(null)
    setFormError('')
    setPresetFeedback('')
    setEditingGroup(normalizeGroup(group))
  }

  function startOptionCreate(group) {
    setEditingGroup(null)
    setFormError('')
    setPresetFeedback('')
    setEditingOption({ ...emptyOption, groupId: group.id })
  }

  function startOptionEdit(group, option) {
    setEditingGroup(null)
    setFormError('')
    setPresetFeedback('')
    setEditingOption(normalizeOption(option, group.id))
  }

  function validateGroup() {
    if (!editingGroup.name_ky.trim()) return t('admin.modifierRequiredError', { field: t('admin.modifierNameKy') })
    if (!editingGroup.name_ru.trim()) return t('admin.modifierRequiredError', { field: t('admin.modifierNameRu') })
    const minSelected = Number(editingGroup.min_selected)
    const maxSelected = editingGroup.selection_type === 'SINGLE' ? 1 : (editingGroup.max_selected === '' ? null : Number(editingGroup.max_selected))
    const sortOrder = Number(editingGroup.sort_order)
    if (!Number.isInteger(minSelected) || minSelected < 0) return t('admin.modifierNonNegativeError', { field: t('admin.modifierMinSelected') })
    if (editingGroup.is_required && minSelected < 1) return t('admin.modifierRequiredMinError')
    if (editingGroup.selection_type === 'SINGLE' && minSelected > 1) return t('admin.modifierSingleMinError')
    if (maxSelected !== null && (!Number.isInteger(maxSelected) || maxSelected < 0)) return t('admin.modifierNonNegativeError', { field: t('admin.modifierMaxSelected') })
    if (maxSelected !== null && maxSelected < minSelected) return t('admin.modifierMaxBelowMinError')
    if (!Number.isInteger(sortOrder) || sortOrder < 0) return t('admin.modifierNonNegativeError', { field: t('admin.modifierSortOrder') })
    return ''
  }

  async function saveGroup(event) {
    event.preventDefault()
    if (busy) return
    const validationError = validateGroup()
    if (validationError) {
      setFormError(validationError)
      return
    }

    const payload = {
      name_ky: editingGroup.name_ky.trim(),
      name_ru: editingGroup.name_ru.trim(),
      selection_type: editingGroup.selection_type,
      is_required: editingGroup.is_required,
      min_selected: Number(editingGroup.min_selected),
      max_selected: editingGroup.selection_type === 'SINGLE' ? 1 : (editingGroup.max_selected === '' ? null : Number(editingGroup.max_selected)),
      sort_order: Number(editingGroup.sort_order),
      is_active: editingGroup.is_active,
    }
    setOperation('group-save')
    setFormError('')
    try {
      const response = editingGroup.id
        ? await adminApiClient.patch(`/api/admin/modifier-groups/${editingGroup.id}/`, payload)
        : await adminApiClient.post(`/api/admin/menu-items/${menuItem.id}/modifier-groups/`, payload)
      setGroups((current) => sortedByOrder(editingGroup.id
        ? current.map((group) => group.id === response.data.id ? response.data : group)
        : [...current, response.data]))
      setEditingGroup(null)
    } catch (requestError) {
      setFormError(modifierApiError(requestError, t, handleApiError))
    } finally {
      setOperation('')
    }
  }

  function validateOption() {
    if (!editingOption.name_ky.trim()) return t('admin.modifierRequiredError', { field: t('admin.modifierNameKy') })
    if (!editingOption.name_ru.trim()) return t('admin.modifierRequiredError', { field: t('admin.modifierNameRu') })
    const priceDelta = Number(editingOption.price_delta)
    const sortOrder = Number(editingOption.sort_order)
    if (!Number.isFinite(priceDelta) || priceDelta < 0) return t('admin.modifierNonNegativeError', { field: t('admin.modifierPriceDelta') })
    if (!Number.isInteger(sortOrder) || sortOrder < 0) return t('admin.modifierNonNegativeError', { field: t('admin.modifierSortOrder') })
    return ''
  }

  async function saveOption(event) {
    event.preventDefault()
    if (busy) return
    const validationError = validateOption()
    if (validationError) {
      setFormError(validationError)
      return
    }

    const payload = {
      name_ky: editingOption.name_ky.trim(),
      name_ru: editingOption.name_ru.trim(),
      price_delta: Number(editingOption.price_delta).toFixed(2),
      sort_order: Number(editingOption.sort_order),
      is_available: editingOption.is_available,
      is_active: editingOption.is_active,
    }
    setOperation('option-save')
    setFormError('')
    try {
      const response = editingOption.id
        ? await adminApiClient.patch(`/api/admin/modifier-options/${editingOption.id}/`, payload)
        : await adminApiClient.post(`/api/admin/modifier-groups/${editingOption.groupId}/options/`, payload)
      setGroups((current) => current.map((group) => {
        if (group.id !== editingOption.groupId) return group
        const options = editingOption.id
          ? group.options.map((option) => option.id === response.data.id ? response.data : option)
          : [...group.options, response.data]
        return { ...group, options: sortedByOrder(options) }
      }))
      setEditingOption(null)
    } catch (requestError) {
      setFormError(modifierApiError(requestError, t, handleApiError))
    } finally {
      setOperation('')
    }
  }

  async function removeGroup(group) {
    if (busy || !group.is_active) return
    const confirmed = await confirm({
      message: t('confirmation.modifierGroupMessage', {
        name: getLocalizedField(group, 'name', language),
      }),
    })
    if (!confirmed || busy) return
    setOperation(`group-delete-${group.id}`)
    setError('')
    try {
      await adminApiClient.delete(`/api/admin/modifier-groups/${group.id}/`)
      setGroups((current) => current.map((entry) => entry.id === group.id ? { ...entry, is_active: false } : entry))
      if (editingGroup?.id === group.id) setEditingGroup(null)
    } catch (requestError) {
      setError(modifierApiError(requestError, t, handleApiError))
    } finally {
      setOperation('')
    }
  }

  async function removeOption(group, option) {
    if (busy || !option.is_active) return
    const confirmed = await confirm({
      message: t('confirmation.modifierOptionMessage', {
        name: getLocalizedField(option, 'name', language),
      }),
    })
    if (!confirmed || busy) return
    setOperation(`option-delete-${option.id}`)
    setError('')
    try {
      await adminApiClient.delete(`/api/admin/modifier-options/${option.id}/`)
      setGroups((current) => current.map((entry) => entry.id === group.id
        ? { ...entry, options: entry.options.map((value) => value.id === option.id ? { ...value, is_active: false } : value) }
        : entry))
      if (editingOption?.id === option.id) setEditingOption(null)
    } catch (requestError) {
      setError(modifierApiError(requestError, t, handleApiError))
    } finally {
      setOperation('')
    }
  }

  function priceLabel(value) {
    const amount = Number(value || 0)
    if (!amount) return t('admin.modifierNoExtraPrice')
    return t('admin.modifierPriceLabel', {
      amount: new Intl.NumberFormat(language === 'ru' ? 'ru-RU' : 'ky-KG', { maximumFractionDigits: 2 }).format(amount),
    })
  }

  if (loading) return <LoadingState label={t('admin.modifiersLoading')} />

  return (
    <div className="admin-modifiers-manager" aria-busy={busy}>
      <div className="admin-modifiers-manager__intro">
        <div>
          <p>{t('admin.modifiersHelp')}</p>
        </div>
        <button className="admin-primary-action" type="button" onClick={startGroupCreate} disabled={busy}><AdminIcon name="plus" />{t('admin.addModifierGroup')}</button>
      </div>
      <ErrorBanner message={error} />

      <section className="admin-modifier-presets" aria-labelledby="admin-modifier-presets-title">
        <header>
          <div>
            <h3 id="admin-modifier-presets-title">{t('admin.modifierPresets')}</h3>
            <p>{t('admin.modifierPresetsHelp')}</p>
          </div>
        </header>
        <div className="admin-modifier-presets__list">
          {modifierPresets.map((preset) => {
            const alreadyAdded = groups.some((group) => groupMatchesPreset(group, preset))
            const presetLoading = operation === `preset-${preset.key}`
            return (
              <button
                className={alreadyAdded ? 'is-added' : ''}
                type="button"
                onClick={() => createPreset(preset)}
                disabled={busy || alreadyAdded}
                aria-label={`${getLocalizedField(preset, 'label', language)}: ${alreadyAdded ? t('admin.modifierPresetAdded') : t('admin.modifierPresetAdd')}`}
                key={preset.key}
              >
                <span className="admin-modifier-preset__copy">
                  <strong>{getLocalizedField(preset, 'label', language)}</strong>
                  <small>{t('admin.modifierPresetOptionCount', { count: preset.options.length })}</small>
                </span>
                <span className="admin-modifier-preset__state">
                  {presetLoading ? (
                    <><span className="admin-button-spinner" />{t('admin.modifierPresetAdding')}</>
                  ) : alreadyAdded ? (
                    <><span aria-hidden="true">✓</span>{t('admin.modifierPresetAdded')}</>
                  ) : (
                    <><AdminIcon name="plus" />{t('admin.modifierPresetAdd')}</>
                  )}
                </span>
              </button>
            )
          })}
        </div>
        {presetFeedback && (
          <p className="admin-modifier-presets__feedback" role="status">{presetFeedback}</p>
        )}
      </section>

      {editingGroup && <GroupForm value={editingGroup} saving={operation === 'group-save'} error={formError} onChange={setEditingGroup} onSubmit={saveGroup} onCancel={() => { setEditingGroup(null); setFormError('') }} />}

      {groups.length ? (
        <section className="admin-modifier-groups-section">
          <header className="admin-modifier-groups-heading">
            <strong>{t('admin.modifierGroups')}</strong>
            <span>{t('admin.modifierGroupCount', { count: groups.length })}</span>
          </header>
          <div className="admin-modifier-groups">
            {groups.map((group) => (
            <article className={`admin-modifier-group ${group.is_active ? '' : 'is-inactive'}`} key={group.id}>
              <header>
                <div className="admin-modifier-group__title">
                  <strong>{getLocalizedField(group, 'name', language)}</strong>
                  <div className="admin-modifier-badges">
                    <span>{group.selection_type === 'SINGLE' ? t('admin.modifierSingle') : t('admin.modifierMultiple')}</span>
                    <span className={group.is_required ? 'is-required' : ''}>{group.is_required ? t('admin.modifierRequired') : t('admin.modifierOptional')}</span>
                    {!group.is_active && <span className="is-inactive">{t('common.inactive')}</span>}
                  </div>
                  <small>{t('admin.modifierSelectionLimits', { min: group.min_selected, max: group.selection_type === 'SINGLE' ? 1 : (group.max_selected ?? t('admin.modifierNoLimit')) })}</small>
                </div>
                <div className="admin-row-actions">
                  <button type="button" onClick={() => startGroupEdit(group)} disabled={busy} aria-label={t('admin.editModifierGroup')}><AdminIcon name="edit" /></button>
                  {group.is_active && <button className="is-danger" type="button" onClick={() => removeGroup(group)} disabled={busy} aria-label={t('common.delete')}>{operation === `group-delete-${group.id}` ? <span className="admin-inline-spinner" /> : <AdminIcon name="trash" />}</button>}
                </div>
              </header>

              <div className="admin-modifier-options-head">
                <div><strong>{t('admin.modifierOptions')}</strong><small>{t('admin.modifierOptionCount', { count: group.options.length })}</small></div>
                <button type="button" onClick={() => startOptionCreate(group)} disabled={busy}><AdminIcon name="plus" />{t('admin.addModifierOption')}</button>
              </div>

              {editingOption?.groupId === group.id && <OptionForm value={editingOption} saving={operation === 'option-save'} error={formError} onChange={setEditingOption} onSubmit={saveOption} onCancel={() => { setEditingOption(null); setFormError('') }} />}

              {group.options.length ? (
                <div className="admin-modifier-options">
                  {group.options.map((option) => (
                    <div className={`admin-modifier-option ${option.is_active && option.is_available ? '' : 'is-inactive'}`} key={option.id}>
                      <div>
                        <strong>{getLocalizedField(option, 'name', language)}</strong>
                        <span className={Number(option.price_delta) > 0 ? 'has-price' : ''}>{priceLabel(option.price_delta)}</span>
                        {!option.is_active && <small>{t('common.inactive')}</small>}
                        {option.is_active && !option.is_available && <small>{t('common.unavailable')}</small>}
                      </div>
                      <div className="admin-row-actions">
                        <button type="button" onClick={() => startOptionEdit(group, option)} disabled={busy} aria-label={t('admin.editModifierOption')}><AdminIcon name="edit" /></button>
                        {option.is_active && <button className="is-danger" type="button" onClick={() => removeOption(group, option)} disabled={busy} aria-label={t('common.delete')}>{operation === `option-delete-${option.id}` ? <span className="admin-inline-spinner" /> : <AdminIcon name="trash" />}</button>}
                      </div>
                    </div>
                  ))}
                </div>
              ) : <p className="admin-modifier-options-empty">{t('admin.noModifierOptions')}</p>}
            </article>
            ))}
          </div>
        </section>
      ) : (
        <EmptyState title={t('admin.noModifierGroups')} description={t('admin.noModifierGroupsHelp')} action={<button className="admin-empty-action" type="button" onClick={startGroupCreate}>{t('admin.addModifierGroup')}</button>} />
      )}
    </div>
  )
}
