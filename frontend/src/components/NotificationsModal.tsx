import { useEffect, useRef, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { API_BASE } from '../config';
import { useAuth } from '../AuthContext';

const AVATAR_PALETTE = ['#f97316', '#8b5cf6', '#06b6d4', '#10b981', '#f43f5e', '#3b82f6', '#eab308'];
const avatarColor = (id: number) => AVATAR_PALETTE[id % AVATAR_PALETTE.length];

type NotifType = 'follow' | 'like' | 'comment' | 'mention_post' | 'mention_comment';

interface Actor {
  id: number;
  username: string;
  avatar_url?: string | null;
}

interface Notification {
  id: number;
  type: NotifType;
  is_read: boolean;
  created_at: string | null;
  actor: Actor | null;
  post_id: number | null;
  post_thumb: string | null;
  comment_id: number | null;
  comment_preview: string | null;
}

interface Props {
  onClose: () => void;
  onProfileOpen?: (userId: number) => void;
  onRead?: () => void;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function NotificationsModal({ onClose, onProfileOpen, onRead }: Props) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const overlayRef = useRef<HTMLDivElement>(null);

  const [notifs, setNotifs] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [marking, setMarking] = useState(false);

  const authHeader = useCallback((): Record<string, string> =>
    user ? { Authorization: `Bearer ${user.token}` } : {}, [user]);

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/notifications/?limit=50`, { headers: authHeader() });
      const data = await res.json();
      setNotifs(data.notifications ?? []);
    } catch {
      setNotifs([]);
    } finally {
      setLoading(false);
    }
  }, [authHeader]);

  // Load on open
  useEffect(() => { void fetchList(); }, [fetchList]);

  // Mark all read on close (so badge drops quickly)
  useEffect(() => {
    return () => {
      // Best-effort mark-all-read when modal unmounts
      if (!user) return;
      void fetch(`${API_BASE}/notifications/mark-all-read`, {
        method: 'POST',
        headers: authHeader(),
      }).then(() => onRead?.()).catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Close on ESC
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleMarkAll = async () => {
    setMarking(true);
    try {
      await fetch(`${API_BASE}/notifications/mark-all-read`, {
        method: 'POST',
        headers: authHeader(),
      });
      setNotifs((prev) => prev.map((n) => ({ ...n, is_read: true })));
      onRead?.();
    } finally {
      setMarking(false);
    }
  };

  const handleClick = async (n: Notification) => {
    if (!n.is_read) {
      try {
        await fetch(`${API_BASE}/notifications/${n.id}/read`, { method: 'POST', headers: authHeader() });
      } catch { /* ignore */ }
      setNotifs((prev) => prev.map((x) => (x.id === n.id ? { ...x, is_read: true } : x)));
      onRead?.();
    }
    if (n.type === 'follow' && n.actor) {
      onProfileOpen?.(n.actor.id);
      onClose();
    }
    // For post-related notifications we just mark read (no single-post view yet)
  };

  function formatTime(dateStr: string | null): string {
    if (!dateStr) return '';
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return t('post.just_now');
    if (mins < 60) return t('post.mins_ago', { n: mins });
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return t('post.hours_ago', { n: hrs });
    return t('post.days_ago', { n: Math.floor(hrs / 24) });
  }

  return (
    <div
      ref={overlayRef}
      className="auth-overlay"
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div className="notif-modal">
        <div className="notif-modal__header">
          <span className="notif-modal__title">{t('notif.title')}</span>
          {notifs.some((n) => !n.is_read) && (
            <button
              className="notif-modal__mark-all"
              onClick={handleMarkAll}
              disabled={marking}
            >
              {t('notif.mark_all_read')}
            </button>
          )}
          <button className="dm-modal__close" onClick={onClose} aria-label={t('dm.close')}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="notif-modal__body">
          {loading ? (
            <div className="notif-modal__loading">{t('notif.loading')}</div>
          ) : notifs.length === 0 ? (
            <div className="notif-modal__empty">
              <div className="notif-modal__empty-icon">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                  <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                </svg>
              </div>
              <div className="notif-modal__empty-title">{t('notif.empty')}</div>
              <div className="notif-modal__empty-sub">{t('notif.empty_sub')}</div>
            </div>
          ) : (
            <ul className="notif-list">
              {notifs.map((n) => {
                const actor = n.actor;
                const msg = actor
                  ? t(`notif.${n.type}`, { user: escapeHtml(actor.username) })
                  : '';
                return (
                  <li
                    key={n.id}
                    className={`notif-item${n.is_read ? '' : ' notif-item--unread'}`}
                    onClick={() => handleClick(n)}
                  >
                    {!n.is_read && <span className="notif-item__dot" aria-hidden="true" />}
                    {actor?.avatar_url ? (
                      <img src={actor.avatar_url} alt="" className="notif-item__avatar-img" />
                    ) : (
                      <span
                        className="notif-item__avatar"
                        style={{ background: actor ? avatarColor(actor.id) : '#999' }}
                      >
                        {actor ? actor.username[0].toUpperCase() : '?'}
                      </span>
                    )}
                    <div className="notif-item__body">
                      <div
                        className="notif-item__text"
                        dangerouslySetInnerHTML={{ __html: msg }}
                      />
                      {n.comment_preview && (
                        <div className="notif-item__preview">"{n.comment_preview}"</div>
                      )}
                      <div className="notif-item__time">{formatTime(n.created_at)}</div>
                    </div>
                    {n.post_thumb && (
                      <img src={n.post_thumb} alt="" className="notif-item__thumb" />
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
