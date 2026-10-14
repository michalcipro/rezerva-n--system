import { forwardRef, type ChangeEvent, type TextareaHTMLAttributes } from 'react';
import { cx } from './utils';

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
  /** Convenience: receives the string value (native onChange still fires). */
  onValueChange?: (value: string) => void;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { invalid, onValueChange, onChange, className, rows = 3, ...rest },
  ref,
) {
  const ariaInvalid = rest['aria-invalid'];
  const isInvalid = invalid || ariaInvalid === true || ariaInvalid === 'true';
  return (
    <textarea
      ref={ref}
      rows={rows}
      className={cx('textarea', isInvalid && 'textarea--invalid', className)}
      onChange={(event: ChangeEvent<HTMLTextAreaElement>) => {
        onChange?.(event);
        onValueChange?.(event.target.value);
      }}
      {...rest}
      aria-invalid={isInvalid || undefined}
    />
  );
});
