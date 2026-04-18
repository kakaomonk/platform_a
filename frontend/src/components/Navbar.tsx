import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../AuthContext';
import { AuthModal } from './AuthModal';
import { API_BASE } from '../config';

const AVATAR_PALETTE = ['#f97316', '#8b5cf6', '#06b6d4', '#10b981', '#f43f5e', '#3b82f6', '#eab308'];
const avatarColor = (id: number) => AVATAR_PALETTE[id % AVATAR_PALETTE.length];

const LANGUAGES = [
  { code: 'ko', label: '한국어' },
  { code: 'en', label: 'English' },
  { code: 'zh', label: '中文' },
  { code: 'fr', label: 'Français' },
];

interface LocationSuggestion {
  name: string;
  display_name: string;
  lat: number;
  lng: number;
}

interface Props {
  onProfileClick?: () => void;
  onSearch?: (q: string) => void;
  onLocationSelect?: (id: number, name: string, lat: number, lng: number) => void;
  onDMClick?: () => void;
  dmUnreadCount?: number;
  isDark?: boolean;
  onThemeToggle?: () => void;
}

export function Navbar({ onProfileClick, onSearch, onLocationSelect, onDMClick, dmUnreadCount, isDark, onThemeToggle }: Props) {
  const { t, i18n } = useTranslation();
  const { user, logout } = useAuth();
  const [showAuth, setShowAuth] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showLangMenu, setShowLangMenu] = useState(false);
  const [query, setQuery] = useState('');
  const [locSuggestions, setLocSuggestions] = useState<LocationSuggestion[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [locLoading, setLocLoading] = useState(false);
  const textDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const locDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const langRef = useRef<HTMLDivElement>(null);

  useEffect(() => () => {
    if (textDebounce.current) clearTimeout(textDebounce.current);
    if (locDebounce.current) clearTimeout(locDebounce.current);
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
      if (langRef.current && !langRef.current.contains(e.target as Node)) {
        setShowLangMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleChange = (val: string) => {
    setQuery(val);

    if (textDebounce.current) clearTimeout(textDebounce.current);
    textDebounce.current = setTimeout(() => onSearch?.(val.trim()), 350);

    if (locDebounce.current) clearTimeout(locDebounce.current);
    if (val.trim().length >= 2) {
      locDebounce.current = setTimeout(async () => {
        setLocLoading(true);
        try {
          const res = await fetch(`${API_BASE}/location/search/?q=${encodeURIComponent(val.trim())}`);
          const data = await res.json();
          setLocSuggestions(data.results ?? []);
          setShowDropdown((data.results ?? []).length > 0);
        } catch {
          setLocSuggestions([]);
        } finally {
          setLocLoading(false);
        }
      }, 400);
    } else {
      setLocSuggestions([]);
      setShowDropdown(false);
    }
  };

  const handleClear = () => {
    setQuery('');
    setLocSuggestions([]);
    setShowDropdown(false);
    if (textDebounce.current) clearTimeout(textDebounce.current);
    if (locDebounce.current) clearTimeout(locDebounce.current);
    onSearch?.('');
  };

  const selectLocation = async (s: LocationSuggestion) => {
    setShowDropdown(false);
    setQuery(s.name);
    onSearch?.('');
    try {
      const res = await fetch(`${API_BASE}/location/find-or-create/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: s.name, lat: s.lat, lng: s.lng }),
      });
      const data = await res.json();
      onLocationSelect?.(data.location_id, data.name, data.lat ?? s.lat, data.lng ?? s.lng);
    } catch { /* ignore */ }
  };

  const currentLang = LANGUAGES.find((l) => l.code === i18n.language) ?? LANGUAGES[0];

  return (
    <>
      <nav className="navbar">
        <div className="navbar__inner">
          <span className="navbar__logo">Discovery</span>

          <div className="navbar__search" ref={searchRef}>
            <svg className="navbar__search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              type="text"
              className="navbar__search-input"
              placeholder={t('nav.search')}
              value={query}
              onChange={(e) => handleChange(e.target.value)}
              onFocus={() => { if (locSuggestions.length > 0) setShowDropdown(true); }}
              autoComplete="off"
            />
            {query && (
              <button className="navbar__search-clear" onClick={handleClear} aria-label={t('nav.clear_search')}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            )}
            {locLoading && (
              <span className="navbar__search-spinner">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ animation: 'spin 0.8s linear infinite' }}>
                  <path d="M21 12a9 9 0 1 1-6.22-8.56" />
                </svg>
              </span>
            )}
            {showDropdown && locSuggestions.length > 0 && (
              <ul className="navbar__loc-dropdown">
                <li className="navbar__loc-dropdown-label">{t('nav.filter_location')}</li>
                {locSuggestions.map((s, i) => (
                  <li
                    key={i}
                    className="navbar__loc-option"
                    onMouseDown={() => selectLocation(s)}
                  >
                    <PinIcon />
                    <span>
                      <span className="navbar__loc-option-main">{s.name}</span>
                      <span className="navbar__loc-option-sub">{s.display_name}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <button className="navbar__theme-btn" onClick={onThemeToggle} aria-label={t('nav.toggle_theme')}>
            {isDark ? <SunIcon /> : <MoonIcon />}
          </button>

          {/* Language switcher */}
          <div className="navbar__lang-wrap" ref={langRef}>
            <button
              className="navbar__lang-btn"
              onClick={() => setShowLangMenu((v) => !v)}
              aria-label="Language"
            >
              {currentLang.code.toUpperCase()}
            </button>
            {showLangMenu && (
              <div className="navbar__lang-menu">
                {LANGUAGES.map((lang) => (
                  <button
                    key={lang.code}
                    className={`navbar__lang-option${i18n.language === lang.code ? ' navbar__lang-option--active' : ''}`}
                    onClick={() => { i18n.changeLanguage(lang.code); setShowLangMenu(false); }}
                  >
                    {lang.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="navbar__right">
            {user && (
              <button
                className="navbar__dm-btn"
                onClick={onDMClick}
                aria-label={t('nav.messages')}
                title={t('nav.messages')}
              >
                <MessageIcon />
                {(dmUnreadCount ?? 0) > 0 && (
                  <span className="navbar__dm-badge">{dmUnreadCount}</span>
                )}
              </button>
            )}
            {user ? (
              <div className="navbar__user-wrap">
                <button
                  className="navbar__avatar"
                  style={{ background: avatarColor(user.id) }}
                  onClick={() => setShowUserMenu((v) => !v)}
                  aria-label={t('nav.account_menu')}
                >
                  {user.username[0].toUpperCase()}
                </button>
                {showUserMenu && (
                  <div className="navbar__user-menu">
                    <div className="navbar__user-name">@{user.username}</div>
                    <button
                      className="navbar__menu-item"
                      onClick={() => { onProfileClick?.(); setShowUserMenu(false); }}
                    >
                      {t('nav.profile')}
                    </button>
                    <button
                      className="navbar__logout-btn"
                      onClick={() => { logout(); setShowUserMenu(false); }}
                    >
                      {t('nav.logout')}
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <button className="navbar__login-btn" onClick={() => setShowAuth(true)}>
                {t('nav.login')}
              </button>
            )}
          </div>
        </div>
      </nav>

      {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}
    </>
  );
}

function PinIcon() {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>;
}
function SunIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="5"/>
      <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
      <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
    </svg>
  );
}
function MoonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
    </svg>
  );
}
function MessageIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}
