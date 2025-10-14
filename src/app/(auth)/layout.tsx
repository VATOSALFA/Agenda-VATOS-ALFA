
import type { ReactNode } from 'react';

type Props = {
  children: ReactNode;
};

// This is a simple layout for authentication pages that doesn't include the main app header/sidebar.
export default function AuthLayout({ children }: Props) {
  return <>{children}</>;
}
