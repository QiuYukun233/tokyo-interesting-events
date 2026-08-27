import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: '东京有点意思｜不无聊的东京活动',
  description: '每周捞出那些不太好搜、但值得出门的东京活动。顺便，找一个也想去的人。',
  openGraph: {
    title: '东京有点意思',
    description: '别再说东京没有意思。每天发现值得出门的活动，顺便找一个也想去的人。',
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: '东京有点意思',
    description: '每天发现值得出门的东京活动，顺便找一个也想去的人。',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
