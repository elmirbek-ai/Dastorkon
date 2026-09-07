function toMinorUnits(value) {
  const normalizedValue = String(value ?? '0').trim()
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(normalizedValue)
  if (!match) return 0

  const sign = match[1] === '-' ? -1 : 1
  const wholeUnits = Number(match[2])
  const fractionalUnits = Number((match[3] || '').padEnd(2, '0'))
  return sign * ((wholeUnits * 100) + fractionalUnits)
}

function fromMinorUnits(value) {
  const sign = value < 0 ? '-' : ''
  const absoluteValue = Math.abs(value)
  const wholeUnits = Math.floor(absoluteValue / 100)
  const fractionalUnits = String(absoluteValue % 100).padStart(2, '0')
  return `${sign}${wholeUnits}.${fractionalUnits}`
}

export function addMoney(values) {
  return fromMinorUnits(
    values.reduce((total, value) => total + toMinorUnits(value), 0),
  )
}

export function multiplyMoney(value, quantity) {
  return fromMinorUnits(toMinorUnits(value) * quantity)
}
