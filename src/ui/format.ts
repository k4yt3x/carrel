const units = ['byte', 'kilobyte', 'megabyte', 'gigabyte', 'terabyte'] as const

const formats = units.map(
  (unit) =>
    new Intl.NumberFormat(undefined, {
      style: 'unit',
      unit,
      unitDisplay: 'short',
      maximumFractionDigits: unit === 'byte' || unit === 'kilobyte' ? 0 : 1,
    }),
)

/** A size in bytes as people read it: "820 kB", "12.4 MB", "1.2 GB" (powers of 1000). */
export function formatBytes(bytes: number): string {
  let value = bytes
  let index = 0
  while (value >= 1000 && index < units.length - 1) {
    value /= 1000
    index++
  }
  return (formats[index] as Intl.NumberFormat).format(value)
}
