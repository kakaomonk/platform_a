import { useState } from 'react';
import { useAuth } from '../AuthContext';
import { AuthModal } from './AuthModal';

const AVATAR_PALETTE = ['#f97316', '#8b5cf6', '#06b6d4', '#10b981', '#f43f5e', '#3b82f6', '#eab308'];
const avatarColor = (id: number) => AVATAR_PALETTE[id % AVATAR_PALETTE.length];

interface Props {
  onProfileClick?: () => void;
}

export function Navbar({ onProfileClick }: Props) {
  const { user, logout } = useAuth();
  const [showAuth, setShowAuth] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);

  return (
    <>
      <nav className="navbar">
        <div className="navbar__inner">
          <span className="navbar__logo">Discovery</span>

          <div className="navbar__right">
            {user ? (
              <div className="navbar__user-wrap">
                <button
                  className="navbar__avatar"
                  style={{ background: avatarColor(user.id) }}
                  onClick={() => setShowUserMenu((v) => !v)}
                  aria-label="계정 메뉴"
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
                      프로필
                    </button>
                    <button
                      className="navbar__logout-btn"
                      onClick={() => { logout(); setShowUserMenu(false); }}
                    >
                      로그아웃
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <button className="navbar__login-btn" onClick={() => setShowAuth(true)}>
                로그인
              </button>
            )}
          </div>
        </div>
      </nav>

      {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}
    </>
  );
}
