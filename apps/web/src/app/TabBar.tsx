import { NavLink } from 'react-router-dom';
import { Icon, cx } from '../ui';
import { NAV_ITEMS } from './nav';

/** Phone navigation: bottom tab bar that respects the home-indicator safe area. */
export function TabBar() {
  return (
    <nav className="tabbar" aria-label="Primary">
      {NAV_ITEMS.map((item) => (
        <NavLink key={item.to} to={item.to} className={({ isActive }) => cx('tabbar__item', isActive && 'is-active')}>
          <Icon name={item.icon} size="1.5rem" />
          <span>{item.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
