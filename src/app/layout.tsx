import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";
import { Shell } from "@/components/shell";
import { Toaster } from "sonner";

export const metadata: Metadata = {
  title: {
    default: "My Tracker",
    template: "%s · My Tracker",
  },
  description: "Personal task management and time tracking powered by Google Sheets.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <Shell>{children}</Shell>
          <Toaster richColors position="top-right" closeButton />
        </Providers>
      </body>
    </html>
  );
}