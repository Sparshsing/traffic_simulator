import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Link from "next/link";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Traffic Simulator",
  description: "A traffic simulation and intersection design application",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body className="min-h-screen flex flex-col">
        {/* Header */}
        <header className="bg-gray-800 text-white p-4 shadow-md w-full">
          <div className="container mx-auto flex justify-between items-center">
            <Link href="/" className="text-xl font-bold hover:text-blue-300">
              Traffic Simulator
            </Link>
            <nav>
              <Link href="/design" className="text-white hover:text-blue-300 underline">
                Traffic Intersection Designer
              </Link>
            </nav>
          </div>
        </header>
        
        {/* Main Content */}
        <main className="flex-1">
          {children}
        </main>
      </body>
    </html>
  );
}