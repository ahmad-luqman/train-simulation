import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'Steam Atlas — Meridian Valley', description: 'A living miniature railway. Run steam locomotives, connect cities, and explore Meridian Valley in 3D.' };
export default function RootLayout({children}: Readonly<{children: React.ReactNode}>) {
  return <html lang="en"><body>{children}</body></html>;
}
