import type { Metadata } from 'next'
import { Geist } from 'next/font/google'
import './globals.css'

const geist = Geist({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Vikartavle',
  description: 'Digital vikartavle for skolen',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="nb" className={`h-full ${geist.className}`}>
      <body className="min-h-full bg-[#F3F5F8] text-slate-800 antialiased">
        {children}
      </body>
    </html>
  )
}
