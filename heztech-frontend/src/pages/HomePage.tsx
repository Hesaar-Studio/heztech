import { Link } from 'react-router-dom';
import { Icon } from '@/components/ui/Icon';
import { useLocale } from '@/hooks/useLocale';
import { NAV_ITEMS } from '@/components/layout/Sidebar';
import './ShellPage.css';

export function HomePage() {
  const { labels } = useLocale();

  return (
    <div className="ht-page">
      <header className="ht-page__header">
        <h1>{labels.nav.home}</h1>
        <p className="ht-page__lead">
          {labels.appSubtitle} — {labels.agents.masterAgent}
        </p>
      </header>
      <div className="ht-page__grid">
        {NAV_ITEMS.filter((n) => n.path !== '/').map((item) => (
          <Link key={item.path} to={item.path} className="ht-page__card">
            <Icon name={item.icon} size={24} />
            <span>{labels.nav[item.labelKey]}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
