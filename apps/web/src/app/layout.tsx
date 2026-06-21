import "./globals.css";
import Link from "next/link";
import type { ReactNode } from "react";

export const metadata = { title: "PancakeFlow — autonomous trading desk", description: "Multi-agent PancakeSwap trading system" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <nav style={{ 
          display: "flex", gap: "24px", padding: "16px 32px", 
          borderBottom: "1px solid var(--line)", background: "var(--panel)" 
        }}>
          <Link href="/" style={{ fontWeight: "bold", color: "var(--signal)", textDecoration: "none" }}>PancakeFlow</Link>
          <Link href="/trades" style={{ textDecoration: "none" }}>Trades</Link>
          <Link href="/strategies" style={{ textDecoration: "none" }}>Strategies</Link>
          <Link href="/agents" style={{ textDecoration: "none" }}>Agents</Link>
          <Link href="/simulate" style={{ textDecoration: "none" }}>Simulate</Link>
        </nav>
        {children}
      </body>
    </html>
  );
}
