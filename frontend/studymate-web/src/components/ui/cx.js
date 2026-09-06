/** Tiny class joiner - avoids pulling in clsx for six components. */
export function cx(...parts) {
  return parts.filter(Boolean).join(' ')
}
