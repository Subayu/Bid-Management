import type { Metadata } from "next";
import { RoleProvider } from "@/contexts/RoleContext";
import { Layout } from "@/components/Layout";
import "./globals.css";

export const metadata: Metadata = {
  title: "ShieldProcure",
  description: "Bid management AI platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <RoleProvider>
          <Layout>{children}</Layout>
        </RoleProvider>
      </body>
    </html>
  );
}
