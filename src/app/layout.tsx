import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Company Control",
  description: "Secure internal Microsoft 365 administration",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
