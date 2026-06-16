import "./globals.css";
import type { ReactNode } from "react";

export const metadata = { title: "PancakeFlow — autonomous trading desk", description: "Multi-agent PancakeSwap trading system" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en"><body>{children}</body></html>
  );
}
