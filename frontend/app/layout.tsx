import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./styles.css";
import AuthSync from "@/components/AuthSync";

export const metadata: Metadata = {
  title: "MediCORE",
  description: "AI-powered supplier catalog search and recommendations"
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthSync />
        {children}
      </body>
    </html>
  );
}

