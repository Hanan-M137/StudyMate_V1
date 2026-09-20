/** Inline 20px stroke icons - avoids an icon dependency for eight glyphs. */
const base = {
  viewBox: '0 0 20 20',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': 'true',
  focusable: 'false',
}

export function DocumentIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M11.5 2.5H6a1.5 1.5 0 0 0-1.5 1.5v12A1.5 1.5 0 0 0 6 17.5h8a1.5 1.5 0 0 0 1.5-1.5V6.5z" />
      <path d="M11.5 2.5v4h4M7.5 11h5M7.5 14h3" />
    </svg>
  )
}

export function ChatIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M17 11.5a2.5 2.5 0 0 1-2.5 2.5H8l-4 3v-3H5.5A2.5 2.5 0 0 1 3 11.5v-6A2.5 2.5 0 0 1 5.5 3h9A2.5 2.5 0 0 1 17 5.5z" />
    </svg>
  )
}

export function QuizIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M10 17.5a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15Z" />
      <path d="M7.9 7.6A2.15 2.15 0 0 1 12 8.4c0 1.4-2 1.7-2 3" />
      <circle cx="10" cy="14.2" r="0.75" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function UploadIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M10 13V3.5m0 0L6.5 7M10 3.5 13.5 7" />
      <path d="M3.5 12.5v2A2.5 2.5 0 0 0 6 17h8a2.5 2.5 0 0 0 2.5-2.5v-2" />
    </svg>
  )
}

export function LogoutIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M12.5 6V4.5A1.5 1.5 0 0 0 11 3H5.5A1.5 1.5 0 0 0 4 4.5v11A1.5 1.5 0 0 0 5.5 17H11a1.5 1.5 0 0 0 1.5-1.5V14" />
      <path d="M8.5 10h8m0 0-2.5-2.5M16.5 10 14 12.5" />
    </svg>
  )
}

export function MenuIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M3.5 6h13M3.5 10h13M3.5 14h13" />
    </svg>
  )
}

export function CloseIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="m5.5 5.5 9 9m0-9-9 9" />
    </svg>
  )
}

export function ChevronIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="m7.5 5 5 5-5 5" />
    </svg>
  )
}

export function CheckIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="m4.5 10.5 3.5 3.5 7.5-8" />
    </svg>
  )
}

export function SparkIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M10 2.5 11.6 7 16 8.6 11.6 10.2 10 14.7 8.4 10.2 4 8.6 8.4 7z" />
      <path d="M15.5 13.5 16.2 15.3 18 16l-1.8.7-.7 1.8-.7-1.8L13 16l1.8-.7z" />
    </svg>
  )
}

/**
 * A pushpin, solid when pinned and outlined when not.
 *
 * The fill carries the state, because position cannot: at the top of a short
 * list a pinned row looks exactly like any other row. The needle is drawn as
 * a separate line, so filling the body does not thicken it.
 */
export function PinIcon({ filled = false, ...props }) {
  return (
    <svg {...base} {...props} fill="none" strokeLinejoin="round" strokeLinecap="round">
      <g transform="translate(1.3 1.1) rotate(-40 10 10)">
        {/* جسم الدبّوس */}
        <path
          d="M7.1 3.2v3.9L5.2 11.2h9.6L12.9 7.1V3.2z"
          fill={filled ? 'currentColor' : 'none'}
        />
        {/* قبّعة الرأس */}
        <path d="M6.1 3.2h7.8" />
        {/* الإبرة */}
        <path d="M10 11.2v5.6" />
      </g>
    </svg>
  )
}

export function MicIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M10 2.75a2 2 0 0 1 2 2v5a2 2 0 0 1-4 0v-5a2 2 0 0 1 2-2Z" />
      <path d="M5.25 9.25v.75a4.75 4.75 0 0 0 9.5 0v-.75M10 14.75v2.5M7.75 17.25h4.5" />
    </svg>
  )
}

/** A cog, for the settings entry under the account row. */
export function SettingsIcon(props) {
  return (
    <svg {...base} {...props}>
      <circle cx="10" cy="10" r="2.4" />
      <path d="M10 2.5l.9 1.9 2.1-.5.6 2 2 .6-.5 2.1L17 10l-1.9.9.5 2.1-2 .6-.6 2-2.1-.5L10 17.5l-.9-1.9-2.1.5-.6-2-2-.6.5-2.1L3 10l1.9-.9L4.4 7l2-.6.6-2 2.1.5z" />
    </svg>
  )
}

/** An envelope, for the contact entry under the account row.

    No direction in it, so nothing is mirrored in a right-to-left
    layout - the flap is symmetrical and the same shape read either
    way, like the document, chat and quiz icons and unlike the
    logout arrow beside it. */
export function MailIcon(props) {
  return (
    <svg {...base} {...props}>
      <rect x="2.5" y="4.5" width="15" height="11" rx="1.5" />
      <path d="m2.9 5.4 6.2 4.7a1.5 1.5 0 0 0 1.8 0l6.2-4.7" />
    </svg>
  )
}

/** An upward arrow, for the back-to-top button. */
export function ArrowUpIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M10 16V4.5M5.5 9 10 4.5 14.5 9" />
    </svg>
  )
}

/** An open eye, for revealing a password field.

    Not mirrored in a right-to-left layout. An eye points at nothing and
    reads the same shape either way, like the document, chat, quiz and
    envelope icons and unlike the logout arrow. */
export function EyeIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M1.8 10S4.9 4.8 10 4.8 18.2 10 18.2 10 15.1 15.2 10 15.2 1.8 10 1.8 10Z" />
      <circle cx="10" cy="10" r="2.35" />
    </svg>
  )
}

/** The same eye struck through, for hiding a password field again.

    The stroke is what carries the meaning on its own: the two states are
    told apart by a line across the glyph rather than by a change of colour,
    which a student who cannot distinguish them would not see. */
export function EyeOffIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M8.2 5.1A7 7 0 0 1 10 4.8c5.1 0 8.2 5.2 8.2 5.2a15 15 0 0 1-2.6 3.2" />
      <path d="M4.5 6.4A15.4 15.4 0 0 0 1.8 10S4.9 15.2 10 15.2c1.2 0 2.3-.3 3.3-.8" />
      <path d="M8.3 8.3a2.35 2.35 0 0 0 3.4 3.4" />
      <path d="m3.6 3.6 12.8 12.8" />
    </svg>
  )
}
