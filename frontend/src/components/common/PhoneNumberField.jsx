import { useId } from 'react'
import PhoneInput from 'react-phone-number-input'
import 'react-phone-number-input/style.css'

export default function PhoneNumberField({
  label,
  value,
  onChange,
  required = false,
  error = '',
  disabled = false,
  placeholder = '+996 224 240 307',
  helperText = '',
  className = '',
  ...inputProps
}) {
  const messageId = useId()
  const describedBy = error || helperText ? messageId : undefined
  const rootClassName = [
    'phone-number-field',
    error ? 'is-invalid' : '',
    className,
  ].filter(Boolean).join(' ')

  return (
    <label className={rootClassName}>
      {label && (
        <span className="phone-number-field__label">
          <span>{label}{required && <b aria-hidden="true"> *</b>}</span>
        </span>
      )}
      <PhoneInput
        international
        withCountryCallingCode
        defaultCountry="KG"
        countryCallingCodeEditable={false}
        value={value || undefined}
        onChange={(nextValue) => onChange(nextValue || '')}
        required={required}
        disabled={disabled}
        placeholder={placeholder}
        aria-invalid={Boolean(error)}
        aria-describedby={describedBy}
        {...inputProps}
      />
      {(error || helperText) && (
        <small
          className={`phone-number-field__message${error ? ' is-error' : ''}`}
          id={messageId}
          role={error ? 'alert' : undefined}
        >
          {error || helperText}
        </small>
      )}
    </label>
  )
}
