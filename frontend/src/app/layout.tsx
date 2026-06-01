import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DotVerse",
  description: "人と人との会話がコンテンツとなる巨大なオンライン空間",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja" className="h-full">
      <body className="h-full overflow-hidden bg-[#1a1a2e] text-white antialiased">
        {children}
      </body>
    </html>
  );
}
