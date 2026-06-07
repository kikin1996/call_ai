import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Call",
  description: "AI asistent na automatické telefonní hovory (VAPI)",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="cs">
      <body className="min-h-screen bg-background text-foreground antialiased">
        {children}
      </body>
    </html>
  );
}
