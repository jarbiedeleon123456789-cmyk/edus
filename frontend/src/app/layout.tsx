import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Fraunces, Instrument_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const display = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-bricolage" });
const body = Instrument_Sans({ subsets: ["latin"], variable: "--font-instrument" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains" });
const accent = Fraunces({ subsets: ["latin"], style: ["italic", "normal"], variable: "--font-fraunces" });

export const metadata: Metadata = {
  title: "EduSphere — adaptive learning and skills evaluation",
  description: "Placement-tested learning paths, a code playground with real test cases, anonymous peer review, and verifiable certificates.",
};

export const viewport: Viewport = {
  themeColor: "#0b0d1f",
};

const themeInit = `try{var t=localStorage.getItem("edu-theme");if(t)document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-scroll-behavior="smooth" suppressHydrationWarning className={`${display.variable} ${body.variable} ${mono.variable} ${accent.variable}`}>
      <body className="grain">
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
        {children}
      </body>
    </html>
  );
}
