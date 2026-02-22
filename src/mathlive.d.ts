import type { HTMLAttributes } from 'react';

declare global {
  namespace JSX {
    interface IntrinsicElements {
      'math-field': HTMLAttributes<HTMLElement> & {
        'math-virtual-keyboard-policy'?: string;
        ref?: React.Ref<HTMLElement>;
      };
    }
  }
}
