import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'ChipChip Agent Demo',
  description: 'A simple ChipChip Agent demo with translation support',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}

