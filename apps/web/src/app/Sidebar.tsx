import { Link, NavLink, useLocation } from 'react-router-dom';
import { APP_NAME, QUERY_PARAM } from '../config/constants';
import { useRecentDecks, useSavedSearches } from '../data';
import { Icon, IconButton, cx } from '../ui';
import { BrandMark } from './BrandMark';
import { NAV_ITEMS } from './nav';
import { ROUTES, paths } from './paths';

interface SidebarProps {
  collapsed: boolean;
  /** Rail forced by a short viewport: the toggle is hidden because it would have no effect. */
  forced?: boolean;
  onToggle: () => void;
}

/** Saved searches act as smart folders: each links to /collection?q=... */
function SavedSearchesSlot() {
  const searches = useSavedSearches() ?? [];
  const { pathname, search } = useLocation();
  const activeQuery = pathname === ROUTES.collection ? new URLSearchParams(search).get(QUERY_PARAM) : null;

  return (
    <section className="sidebar__section" aria-labelledby="sidebar-searches">
      <h2 id="sidebar-searches" className="sidebar__heading">
        Saved searches
      </h2>
      {searches.length === 0 ? (
        <p className="sidebar__hint">Save a search to pin it here.</p>
      ) : (
        <ul className="sidebar__list">
          {searches.map((saved) => (
            <li key={saved.id}>
              <Link
                to={paths.collection(saved.query)}
                className={cx('sidebar__link', activeQuery === saved.query && 'is-active')}
                aria-current={activeQuery === saved.query ? 'page' : undefined}
              >
                <Icon name="bookmark" />
                <span>{saved.name}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function RecentDecksSlot() {
  const decks = useRecentDecks() ?? [];
  return (
    <section className="sidebar__section" aria-labelledby="sidebar-decks">
      <h2 id="sidebar-decks" className="sidebar__heading">
        Recent decks
      </h2>
      {decks.length === 0 ? (
        <p className="sidebar__hint">Decks you edit show up here.</p>
      ) : (
        <ul className="sidebar__list">
          {decks.map((deck) => (
            <li key={deck.id}>
              <NavLink to={paths.deck(deck.id)} className={({ isActive }) => cx('sidebar__link', isActive && 'is-active')}>
                <Icon name="deck" />
                <span>{deck.name}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Desktop navigation. Collapses to an icon rail; hidden entirely on phones (see TabBar). */
export function Sidebar({ collapsed, forced = false, onToggle }: SidebarProps) {
  return (
    <div className={cx('sidebar', collapsed && 'is-collapsed')}>
      <Link to={ROUTES.collection} className="sidebar__brand" aria-label={`${APP_NAME} home`}>
        <BrandMark size={32} />
        <span className="sidebar__brand-name">{APP_NAME}</span>
      </Link>

      <nav aria-label="Primary" className="sidebar__nav">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            data-label={item.label}
            title={collapsed ? item.label : undefined}
            className={({ isActive }) => cx('sidebar__link', 'sidebar__link--primary', isActive && 'is-active')}
          >
            <Icon name={item.icon} />
            <span className="sidebar__label">{item.label}</span>
          </NavLink>
        ))}
      </nav>

      {collapsed ? null : (
        <div className="sidebar__slots">
          <SavedSearchesSlot />
          <RecentDecksSlot />
        </div>
      )}

      {forced ? null : (
        <div className="sidebar__footer">
          <IconButton icon="panel-left" label="Toggle sidebar" aria-expanded={!collapsed} onClick={onToggle} />
        </div>
      )}
    </div>
  );
}
