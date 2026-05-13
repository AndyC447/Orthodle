import {
  isImageIcon,
} from '@/lib/group-icons'

export function GroupIconMark({
  value,
  fallback,
  className = '',
}: {
  value: string | null | undefined
  fallback: string
  className?: string
}) {
  const displayValue = value || fallback

  if (isImageIcon(displayValue)) {
    return (
      <img
        src={displayValue}
        alt=""
        className={`h-full w-full rounded-[inherit] object-cover ${className}`}
      />
    )
  }

  return <span className={`leading-none ${className}`}>{displayValue}</span>
}
