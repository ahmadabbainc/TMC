import type { Metadata } from "next";
import { ThemeProvider } from "next-themes";
import "./globals.css";
export const metadata: Metadata = { title:"TMC — Make your next Short", description:"Turn your videos into ready-to-publish Shorts with TMC." };
export default function RootLayout({children}:{children:React.ReactNode}) { return <html lang="en" suppressHydrationWarning><body><ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>{children}</ThemeProvider></body></html>; }
