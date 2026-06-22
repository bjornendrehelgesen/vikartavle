import type { Metadata } from 'next'
import { DM_Sans } from 'next/font/google'
import './globals.css'

const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
})

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
    <html lang="nb" className={`h-full ${dmSans.className}`}>
      <body className="min-h-full antialiased" style={{ backgroundColor: '#F7F5F2', color: '#1A1A1A' }}>
        {children}
      </body>
    </html>
  )
}
