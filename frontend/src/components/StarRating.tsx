interface StarRatingProps {
  value: number
  size?: 'sm' | 'md'
}

export function StarRating({ value, size = 'sm' }: StarRatingProps) {
  const textSize = size === 'md' ? 'text-base' : 'text-xs'

  return (
    <span
      role="img"
      aria-label={`Calificación: ${value} de 5 estrellas`}
      className={`inline-flex items-center gap-0.5 ${textSize} leading-none`}
    >
      {[1, 2, 3, 4, 5].map((star) => (
        <span
          key={star}
          aria-hidden
          className={star <= value ? 'text-amber-400' : 'text-slate-700'}
        >
          ★
        </span>
      ))}
    </span>
  )
}
