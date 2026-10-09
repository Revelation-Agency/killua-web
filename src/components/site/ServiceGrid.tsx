/**
 * Service cards. One React island for the whole grid (React Bits SpotlightCard),
 * hydrated only when it scrolls into view. The links work before hydration.
 */
import SpotlightCard from '../react-bits/SpotlightCard';

type Item = { href: string; label: string; short: string };

export default function ServiceGrid({ items }: { items: Item[] }) {
  return (
    <div className="cards">
      {items.map((it, n) => (
        <a className="card-link" href={it.href} key={it.href}>
          <SpotlightCard
            className="svc-card"
            theme="dark"
            spotlightColor="#f3a53a"
            intensity={0.22}
            borderGlow={0.8}
            style={{ ['--spotlight-card-surface' as string]: '#1f1e20' }}
          >
            <span className="num">{String(n + 1).padStart(2, '0')}</span>
            <h3>{it.label}</h3>
            <p>{it.short}</p>
            <span className="go">
              See {it.label.toLowerCase()}
              <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <path d="M4 10h11m-4.5-5L15 10l-4.5 5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          </SpotlightCard>
        </a>
      ))}
    </div>
  );
}
