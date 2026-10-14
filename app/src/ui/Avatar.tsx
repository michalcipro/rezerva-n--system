import type { HTMLAttributes } from 'react';
import type { Tone } from '../domain/types';
import { cx, initialsOf } from './utils';

export type AvatarTone = Tone | 'neutral' | 'accent';
export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg';

export interface AvatarProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'children'> {
  /** Full name; initials are derived from it (titles like „Mgr.“ skipped). */
  name?: string;
  /** Explicit initials, overrides `name`. */
  initials?: string;
  tone?: AvatarTone;
  /** xs 22 · sm 32 · md 40 · lg 56 px. */
  size?: AvatarSize;
  /** Announce the name (role="img"); default is decorative because the name is usually visible. */
  labelled?: boolean;
}

export function Avatar({ name, initials, tone = 'neutral', size = 'sm', labelled, className, ...rest }: AvatarProps) {
  const text = initials ?? (name ? initialsOf(name) : '');
  return (
    <span
      className={cx('avatar', `avatar--${size}`, tone !== 'neutral' && `avatar--${tone}`, className)}
      {...(labelled && name ? { role: 'img', 'aria-label': name } : { 'aria-hidden': true })}
      {...rest}
    >
      {text}
    </span>
  );
}

export interface AvatarStackPerson {
  name: string;
  initials?: string;
  tone?: AvatarTone;
}

export interface AvatarStackProps {
  people: AvatarStackPerson[];
  /** Show at most N avatars, then „+K“. Default 4. */
  max?: number;
  size?: AvatarSize;
  /** Accessible summary; defaults to the joined names. */
  label?: string;
  className?: string;
}

/** Overlapping avatars with a surface-coloured ring (waitlist, group lessons). */
export function AvatarStack({ people, max = 4, size = 'xs', label, className }: AvatarStackProps) {
  const shown = people.slice(0, max);
  const rest = people.length - shown.length;
  return (
    <span role="img" aria-label={label ?? people.map((p) => p.name).join(', ')} className={cx('avatar-stack', className)}>
      {shown.map((person, i) => (
        <Avatar key={`${person.name}-${i}`} name={person.name} initials={person.initials} tone={person.tone} size={size} />
      ))}
      {rest > 0 && <Avatar initials={`+${rest}`} size={size} />}
    </span>
  );
}
