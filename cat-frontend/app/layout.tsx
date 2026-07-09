import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "CAT Prep AI | Semantic Practice Engine",
  description: "Advanced AI-driven CAT preparation platform.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${inter.className} bg-slate-50 text-slate-900 flex flex-col min-h-screen`}>
        {/* GLOBAL NAVIGATION BAR */}
        <nav className="bg-slate-900 text-white shadow-md sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
            
            {/* BRANDING */}
            <Link href="/" className="flex items-center space-x-2 transition hover:opacity-80">
              <span className="font-bold text-lg tracking-tight">CAT Prep AI</span>
            </Link>

            {/* MAIN LINKS */}
            <div className="flex items-center space-x-6 text-sm font-medium">
              <Link href="/" className="text-slate-300 hover:text-white transition-colors">
                Create Test
              </Link>
              <Link href="/history" className="text-slate-300 hover:text-white transition-colors">
                Performance History
              </Link>
              <Link 
                href="/search"   className="text-slate-300 hover:text-white transition-colors">
                Semantic Search
              </Link>
              <Link 
                href="/admin/ingestion"   className="text-slate-300 hover:text-white transition-colors">
                Data Ingestion
              </Link>
            </div>
          </div>
        </nav>

        {/* PAGE CONTENT */}
        <main className="flex-1 flex flex-col">
          {children}
        </main>
      </body>
    </html>
  );
}