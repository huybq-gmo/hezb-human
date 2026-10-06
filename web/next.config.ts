import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  distDir:
    process.env.NODE_ENV === 'development' &&
    process.env.NEXT_PUBLIC_HEZB_DEMO === '1'
      ? '.next-demo'
      : '.next',
}

export default nextConfig
