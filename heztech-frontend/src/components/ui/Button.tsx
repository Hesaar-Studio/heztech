import { forwardRef, type ButtonHTMLAttributes } from 'react';
import clsx from 'clsx';
import './Button.css';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'accent';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'secondary', size = 'md', loading, disabled, children, ...rest }, ref) => {
    return (
      <button
        ref={ref}
        className={clsx('ht-btn', `ht-btn--${variant}`, `ht-btn--${size}`, className)}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        {...rest}
      >
        {loading ? <span className="ht-btn__spinner" aria-hidden /> : null}
        <span className={clsx(loading && 'ht-btn__label--loading')}>{children}</span>
      </button>
    );
  }
);

Button.displayName = 'Button';
