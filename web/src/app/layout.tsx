import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { Be_Vietnam_Pro } from 'next/font/google'
import { Toaster } from 'sonner'
import './globals.css'

const beVietnamPro = Be_Vietnam_Pro({
  weight: ['400', '500', '600', '700'],
  subsets: ['latin', 'vietnamese'],
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Hezb ERP — Giao diện quản trị',
  description: 'Từ giờ làm việc đến bảng lương, một luồng duy nhất.',
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const requestHeaders = await headers()
  return (
    <html lang="vi" suppressHydrationWarning className={beVietnamPro.className}>
      <head>
        <meta name="request-id" content={requestHeaders.get('x-request-id') || ''} />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                const theme = localStorage.getItem('hezb_theme');
                if (theme === 'light' || theme === 'dark') {
                  document.documentElement.setAttribute('data-theme', theme);
                }
              } catch (_) {}
            `,
          }}
        />
      </head>
      <body className="antialiased min-h-screen">
        {children}
        <Toaster
          position="bottom-center"
          toastOptions={{
            style: {
              background: 'var(--ink)',
              color: 'var(--bg)',
              border: '1px solid var(--ln)',
              fontFamily: 'inherit',
              borderRadius: '10px',
            },
          }}
        />
      </body>
    </html>
  )
}
