import type { Metadata } from 'next'
import './globals.css'

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
    <html lang="nb" className="h-full">
      <body className="min-h-full bg-slate-50 text-slate-800 antialiased">
        {children}
      </body>
    </html>
  )
}
