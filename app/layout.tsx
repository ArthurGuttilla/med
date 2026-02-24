import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MedNotes — Doctor-Patient Management",
  description: "Clinical notes and patient management platform for physicians",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="font-sans bg-gray-50 text-gray-900 min-h-screen">
        <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
            <a href="/" className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-md bg-blue-600 flex items-center justify-center">
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <span className="font-semibold text-gray-900 text-sm">MedNotes</span>
            </a>
            <nav className="flex items-center gap-6">
              <a href="/" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">Patients</a>
              <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center">
                <span className="text-blue-700 text-xs font-semibold">DR</span>
              </div>
            </nav>
          </div>
        </header>
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {children}
        </main>
      </body>
    </html>
  );
}
