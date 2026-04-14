import { useEffect, useRef, useState } from 'react';
import { API_BASE } from '../config';
import { useAuth } from '../AuthContext';

interface Props {
  onClose: () => void;
}

type Tab = 'login' | 'register';

export function AuthModal({ onClose }: Props) {
  const { login } = useAuth();
  const [tab, setTab] = useState<Tab>('login');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);

  // Close on Escape
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
        setError(data.detail ?? '오류가 발생했습니다');
        return;
      }
      login(data.token, data.user_id, data.username);
      onClose();
    } catch {
      setError('서버에 연결할 수 없습니다');
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
            로그인
          </button>
          <button
            className={`auth-modal__tab${tab === 'register' ? ' auth-modal__tab--active' : ''}`}
            onClick={() => switchTab('register')}
          >
            회원가입
          </button>
        </div>

        <form className="auth-modal__form" onSubmit={handleSubmit} noValidate>
          <div className="auth-modal__field">
            <label className="auth-modal__label">아이디</label>
            <input
              className="auth-modal__input"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="사용자 이름"
              autoComplete="username"
              autoFocus
              required
            />
          </div>

          {tab === 'register' && (
            <div className="auth-modal__field">
              <label className="auth-modal__label">이메일</label>
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
            <label className="auth-modal__label">비밀번호</label>
            <input
              className="auth-modal__input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={tab === 'register' ? '6자 이상' : '비밀번호'}
              autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
              required
            />
          </div>

          {error && <p className="auth-modal__error">{error}</p>}

          <button className="auth-modal__submit" type="submit" disabled={loading}>
            {loading ? '처리 중…' : tab === 'login' ? '로그인' : '가입하기'}
          </button>
        </form>
      </div>
    </div>
  );
}
