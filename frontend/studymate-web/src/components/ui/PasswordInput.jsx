import { useState } from 'react'
import { useI18n } from '../../context/I18nContext'
import { EyeIcon, EyeOffIcon } from '../icons'
import { Input } from './Field'
import { cx } from './cx'

/* ==========================================================================
   PasswordInput - a password field with a control that reveals it.

   WRITTEN ONCE. There are five password fields in this project - sign in,
   register, and the current/new/confirm trio in Settings - and the reveal
   is the kind of control that grows a bug in one of its copies and gets
   fixed in the other four. So the fields import this and there is one
   place to change.

   WHY IT IS NOT A PROP ON Input: Input is a single <input> and pages spread
   arbitrary attributes onto it. This needs a wrapper element and state of
   its own, which would make every other Input carry a relative container it
   has no use for.
   ========================================================================== */

export function PasswordInput({ className, ...props }) {
  const { t } = useI18n()

  /* Hidden on mount, every mount. Deliberately component state and not
     stored anywhere: a revealed password that survives a reload is a
     password left on the screen of a shared machine, and nothing about
     this control is worth remembering. */
  const [visible, setVisible] = useState(false)

  /* The name changes with the state because the action does. A button that
     says "Show password" while the password is already showing is telling
     a screen-reader user the opposite of what it does, half the time. */
  const label = visible ? t('common.hidePassword') : t('common.showPassword')

  return (
    <div className="relative">
      {/* pe-10 is the button's own width: padding-inline-end, so the text
          stops short of the control on whichever side the control is on. */}
      <Input {...props} type={visible ? 'text' : 'password'} className={cx('pe-10', className)} />

      {/* type="button" is not decoration. This sits inside a <form>, and a
          button with no type is a submit button - tapping the eye would
          send the sign-in form. */}
      <button
        type="button"
        onClick={() => setVisible((shown) => !shown)}
        aria-label={label}
        aria-pressed={visible}
        className="absolute end-0 top-0 flex h-full w-10 items-center justify-center rounded-sm text-muted transition-colors duration-150 hover:text-ink"
      >
        {visible ? (
          <EyeOffIcon className="h-[18px] w-[18px]" />
        ) : (
          <EyeIcon className="h-[18px] w-[18px]" />
        )}
      </button>
    </div>
  )
}
