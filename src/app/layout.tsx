import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600'],
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
    <html lang="nb" className={`h-full ${inter.className}`}>
      <body className="min-h-full antialiased" style={{ backgroundColor: '#F7F5F2', color: '#1A1A1A' }}>
        {children}
      </body>
    </html>
  )
}
