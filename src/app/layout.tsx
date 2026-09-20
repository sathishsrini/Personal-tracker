import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";
import { Shell } from "@/components/shell";
import { ThemedToaster } from "@/components/theme";

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

const THEME_BOOTSTRAP = `(function(){try{var t=localStorage.getItem("tracker:theme");var d=t==="dark"||((!t||t==="system")&&window.matchMedia("(prefers-color-scheme: dark)").matches);var el=document.documentElement;el.classList.toggle("dark",d);el.style.colorScheme=d?"dark":"light";}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
        <Providers>
          <Shell>{children}</Shell>
          <ThemedToaster />
        </Providers>
      </body>
    </html>
  );
}