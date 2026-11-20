'use client';

import { useState, type InputHTMLAttributes } from 'react';

/**
 * A password `<input>` with a show/hide toggle. Takes the same props as
 * `<input>` (so `className="input"` / `"pp-input"` etc. work as before); the
 * button sits inside the field and is `type="button"` so it never submits.
 */
export function PasswordInput({
  className = '',
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="pw-wrap">
      <input {...props} type={visible ? 'text' : 'password'} className={`${className} pw-input`} />
      <button
        type="button"
        className="pw-toggle"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'Hide password' : 'Show password'}
        aria-pressed={visible}
      >
        {visible ? 'Hide' : 'Show'}
      </button>
    </div>
  );
}
