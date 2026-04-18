import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { API_BASE } from '../config';
import { useAuth } from '../AuthContext';

interface Props {
  onClose: () => void;
}

type Tab = 'login' | 'register';

export function AuthModal({ onClose }: Props) {
  const { t } = useTranslation();
  const { login } = useAuth();
  const [tab, setTab] = useState<Tab>('login');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const switchTab = (t: Tab) => {
    setTab(t);
    setError(null);
    setUsername('');
    setEmail('');
    setPassword('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const endpoint = tab === 'login' ? '/auth/login' : '/auth/register';
      const body = tab === 'login'
        ? { username, password }
        : { username, email, password };

      const res = await fetch(`${API_BASE}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.detail ?? t('auth.error_generic'));
        return;
      }
      login(data.token, data.user_id, data.username);
      onClose();
    } catch {
      setError(t('auth.error_server'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="auth-overlay"
      ref={overlayRef}
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div className="auth-modal" role="dialog" aria-modal="true">
        <div className="auth-modal__tabs">
          <button
            className={`auth-modal__tab${tab === 'login' ? ' auth-modal__tab--active' : ''}`}
            onClick={() => switchTab('login')}
          >
            {t('auth.login')}
          </button>
          <button
            className={`auth-modal__tab${tab === 'register' ? ' auth-modal__tab--active' : ''}`}
            onClick={() => switchTab('register')}
          >
            {t('auth.signup')}
          </button>
        </div>

        <form className="auth-modal__form" onSubmit={handleSubmit} noValidate>
          <div className="auth-modal__field">
            <label className="auth-modal__label">{t('auth.username')}</label>
            <input
              className="auth-modal__input"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder={t('auth.username_placeholder')}
              autoComplete="username"
              autoFocus
              required
            />
          </div>

          {tab === 'register' && (
            <div className="auth-modal__field">
              <label className="auth-modal__label">{t('auth.email')}</label>
              <input
                className="auth-modal__input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@example.com"
                autoComplete="email"
                required
              />
            </div>
          )}

          <div className="auth-modal__field">
            <label className="auth-modal__label">{t('auth.password')}</label>
            <input
              className="auth-modal__input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={tab === 'register' ? t('auth.password_placeholder_register') : t('auth.password')}
              autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
              required
            />
          </div>

          {error && <p className="auth-modal__error">{error}</p>}

          <button className="auth-modal__submit" type="submit" disabled={loading}>
            {loading ? t('auth.processing') : tab === 'login' ? t('auth.login') : t('auth.signup_btn')}
          </button>
        </form>
      </div>
    </div>
  );
}
