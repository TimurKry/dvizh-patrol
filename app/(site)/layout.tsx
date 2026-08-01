import { SiteNav } from '@/components/nav/site-nav';
import { SiteFooter } from '@/components/nav/site-footer';
import { OfflineIndicator } from '@/components/pwa/offline-indicator';

/**
 * Оболочка публичных и командных страниц: одна плавающая
 * навигация сверху, подвал снизу. Админка сюда не входит —
 * у неё своя оболочка.
 */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteNav />
      <OfflineIndicator />
      <main id="main" className="flex-1">
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
