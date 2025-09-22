// src/components/providers/auth-root.tsx
"use client";

import { AuthProvider } from "@/contexts/auth-context";

export default function AuthRoot({ children }: { children: React.ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}
