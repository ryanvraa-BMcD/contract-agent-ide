"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import { type ReactNode } from "react";
import { ToastProvider } from "@/src/features/workspace/components/toast";

export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemesProvider attribute="class" defaultTheme="system" enableSystem>
      <ToastProvider>
        {children}
      </ToastProvider>
    </NextThemesProvider>
  );
}
