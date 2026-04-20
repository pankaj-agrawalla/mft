import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Kontex Topology Assessor',
  description: 'MAS Failure Taxonomy Assessment Tool',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body style={{ background: '#080810', margin: 0, padding: 0 }}>
        {children}
      </body>
    </html>
  )
}
