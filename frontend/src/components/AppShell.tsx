import React from 'react';
import {
  LayoutDashboard, Map, Bell, Navigation, PawPrint,
  BarChart2, Settings, Shield, ChevronDown, Search
} from 'lucide-react';
import { NavLink, useLocation } from 'react-router-dom';
import { MOCK_USER } from '../data/mockData';

const NAV_ITEMS = [
  { path: '/overview',  label: 'Overview',  icon: LayoutDashboard },
  { path: '/map',       label: 'Live Map',  icon: Map },
  { path: '/alerts',    label: 'Alerts',    icon: Bell, badge: 3 },
  { path: '/missions',  label: 'Missions',  icon: Navigation },
  { path: '/animals',   label: 'Animals',   icon: PawPrint },
  { path: '/reports',   label: 'Reports',   icon: BarChart2 },
  { path: '/settings',  label: 'Settings',  icon: Settings },
];

interface AppShellProps {
  children: React.ReactNode;
  pageTitle: string;
  pageSubtitle?: string;
  searchPlaceholder?: string;
  actions?: React.ReactNode;
}

export default function AppShell({
  children, pageTitle, pageSubtitle, searchPlaceholder, actions
}: AppShellProps) {
  return (
    <div className="app-shell">
      {/* ===== SIDEBAR ===== */}
      <aside className="sidebar">
        {/* Brand */}
        <div className="sidebar-brand">
          <div className="sidebar-brand-logo">
            <Shield />
          </div>
          <div className="sidebar-brand-text">
            <span className="sidebar-brand-name">Tadoba</span>
            <span className="sidebar-brand-name">Sentinel</span>
          </div>
        </div>

        {/* Navigation */}
        <nav className="sidebar-nav">
          {NAV_ITEMS.map(({ path, label, icon: Icon, badge }) => (
            <NavLink
              key={path}
              to={path}
              className={({ isActive }) =>
                `sidebar-nav-item${isActive ? ' active' : ''}`
              }
            >
              <Icon />
              <span>{label}</span>
              {badge !== undefined && badge > 0 && (
                <span className="sidebar-nav-badge">{badge}</span>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Command Centre */}
        <div className="sidebar-command-centre">
          <div className="sidebar-cc-label">Command Centre</div>
          <div className="sidebar-cc-status">
            <div className="sidebar-cc-dot" />
            <div>
              <div className="sidebar-cc-name">Demo dashboard</div>
              <div className="sidebar-cc-location">Drone connection: see Settings</div>
            </div>
          </div>
        </div>
      </aside>

      {/* ===== MAIN ===== */}
      <div className="main-content">
        {/* Header */}
        <header className="header">
          <div className="header-title-block">
            <h1 className="header-page-title">{pageTitle}</h1>
            {pageSubtitle && (
              <p className="header-page-subtitle">{pageSubtitle}</p>
            )}
          </div>

          {/* Demo badge */}
          <span className="demo-badge">Demo Mode</span>

          {/* Search */}
          <div className="header-search">
            <Search size={15} />
            <input
              type="text"
              placeholder={searchPlaceholder ?? 'Search animal ID or species...'}
              aria-label="Global search"
            />
          </div>

          <div className="header-divider" />

          {/* User */}
          <button className="header-user" aria-label="User menu">
            <div className="header-avatar">
              {MOCK_USER.initials}
            </div>
            <div>
              <div className="header-user-name">{MOCK_USER.name}</div>
              <div className="header-user-role">{MOCK_USER.division}</div>
            </div>
            <ChevronDown size={14} style={{ color: 'var(--color-text-muted)', marginLeft: 2 }} />
          </button>

          {actions && (
            <>
              <div className="header-divider" />
              {actions}
            </>
          )}
        </header>

        {/* Page content */}
        <main className="page-content">
          {children}
        </main>
      </div>
    </div>
  );
}
