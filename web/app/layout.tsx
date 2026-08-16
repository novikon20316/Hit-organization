import type { Metadata } from "next";
import { IBM_Plex_Sans_Hebrew } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/contexts/AuthContext";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { NotificationsProvider } from "@/contexts/NotificationsContext";

// One family for the whole product, Hebrew + Latin both — switching
// languages never breaks the type rhythm because both scripts share the
// same metrics, weights, and designer. Hierarchy comes from weight (300–700)
// and scale, not from mixing families.
const plexSansHebrew = IBM_Plex_Sans_Hebrew({
  variable: "--font-plex",
  subsets: ["hebrew", "latin"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "מערכת פרויקטי גמר ותיזות | HIT Final Projects and Theses System",
    template: "%s | HIT Final Projects and Theses System",
  },
  description:
    "Holon Institute of Technology — final projects & thesis management: milestones, supervision, examiners, defenses, and grading.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Default lang/dir is Hebrew/RTL, matching the mobile app's default
  // (createUserDoc defaults `language: 'he'`). LanguageProvider takes over
  // and flips both attributes client-side once it reads a stored preference.
  return (
    <html lang="he" dir="rtl" className={`${plexSansHebrew.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-paper text-ink">
        <LanguageProvider>
          <AuthProvider>
            <NotificationsProvider>{children}</NotificationsProvider>
          </AuthProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
