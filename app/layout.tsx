import type { Metadata } from "next";
import { Inter, Battambang } from "next/font/google";
import Script from "next/script";

const inter = Inter({ 
  subsets: ["latin"], 
  variable: "--font-inter" 
});

const battambang = Battambang({ 
  weight: ["400", "700", "900"], 
  subsets: ["khmer"], 
  variable: "--font-battambang" 
});
import "./globals.css";
import { AuthProvider } from "@/contexts/AuthContext";
import { ToastProvider } from "@/components/ui/Toast";
import { Sidebar } from "@/components/layout/Sidebar";
import { BottomNav } from "@/components/layout/BottomNav";

export const metadata: Metadata = {
  title: { default: "Food Bot Admin", template: "%s | Food Bot" },
  description: "Telegram Food Poll Bot — Admin Panel",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${inter.variable} ${battambang.variable}`}>
      <head>
        {/* No-flash dark mode + role gate — runs before any paint */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){
  try {
    var t = localStorage.getItem('fb_theme');
    if (!t) t = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    if (t === 'dark') document.documentElement.classList.add('dark');
  } catch(e){}
})();`,
          }}
        />
        <Script
          src="https://telegram.org/js/telegram-web-app.js"
          strategy="beforeInteractive"
        />
      </head>
      <body>
        <AuthProvider>
          <ToastProvider>
            <div className="app-shell">
              <Sidebar />
              <div className="app-main">
                {children}
                <BottomNav />
              </div>
            </div>
          </ToastProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
