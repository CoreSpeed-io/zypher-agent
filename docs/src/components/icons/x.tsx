import type { ComponentProps } from 'react'

export function XIcon(props: ComponentProps<'svg'>) {
  return (
    <svg viewBox='0 0 20 20' fill='none' xmlns='http://www.w3.org/2000/svg' {...props}>
      <path
        d='M11.5123 8.75562L17.4317 1.875H16.0292L10.8892 7.84937L6.78418 1.875H2.0498L8.2573 10.9094L2.0498 18.125H3.4523L8.87981 11.8156L13.2148 18.125H17.9498L11.5123 8.75562ZM9.59105 10.9888L8.96231 10.0894L3.95793 2.93125H6.1123L10.1511 8.70812L10.7798 9.6075L16.0298 17.1169H13.8754L9.59168 10.9894L9.59105 10.9888Z'
        fill='currentColor'
      />
    </svg>
  )
}
