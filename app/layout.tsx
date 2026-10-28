import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'AgentFlow AI | Operations, connected.', description: 'An accountable AI workspace for customer conversations, relationships and business automation.' };
export default function RootLayout({ children }: { children: React.ReactNode }) { return <html lang="en"><body>{children}</body></html>; }
