import { useEffect, useRef, useState, useCallback } from 'react';
import { API_BASE } from '../config';
import { useAuth } from '../AuthContext';

const AVATAR_PALETTE = ['#f97316', '#8b5cf6', '#06b6d4', '#10b981', '#f43f5e', '#3b82f6', '#eab308'];
const avatarColor = (id: number) => AVATAR_PALETTE[id % AVATAR_PALETTE.length];

interface OtherUser { id: number; username: string; avatar_url?: string | null; }
interface ConvSummary {
  id: number;
  other_user: OtherUser;
  last_message: string | null;
  last_message_at: string | null;
  unread_count: number;
}
interface Message {
  id: number;
  sender_id: number;
  content: string;
  is_read: boolean;
  created_at: string | null;
}

interface Props {
  onClose: () => void;
  initialUserId?: number | null;
}

export function DMModal({ onClose, initialUserId }: Props) {
  const { user } = useAuth();
  const overlayRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [convs, setConvs] = useState<ConvSummary[]>([]);
  const [activeConvId, setActiveConvId] = useState<number | null>(null);
  const [activeOther, setActiveOther] = useState<OtherUser | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [loadingConvs, setLoadingConvs] = useState(true);
  const [loadingMsgs, setLoadingMsgs] = useState(false);

  const authHeader = (): Record<string, string> => (user ? { Authorization: `Bearer ${user.token}` } : {});

  const fetchConvs = useCallback(async () => {
    if (!user) return;
    try {
      const res = await fetch(`${API_BASE}/dm/conversations/`, { headers: authHeader() });
      const data = await res.json();
      setConvs(data.conversations ?? []);
    } catch { /* ignore */ }
  }, [user]);

  const fetchMessages = useCallback(async (convId: number) => {
    if (!user) return;
    try {
      const res = await fetch(`${API_BASE}/dm/conversations/${convId}/messages`, { headers: authHeader() });
      const data = await res.json();
      setMessages(data.messages ?? []);
    } catch { /* ignore */ }
  }, [user]);

  // Initial load
  useEffect(() => {
    setLoadingConvs(true);
    fetchConvs().finally(() => setLoadingConvs(false));
  }, [fetchConvs]);

  // Open conversation with target user (from ProfileModal)
  useEffect(() => {
    if (!initialUserId || !user) return;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/dm/conversations/`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeader() },
          body: JSON.stringify({ target_user_id: initialUserId }),
        });
        const data = await res.json();
        await fetchConvs();
        // Find the other user info from the fetched conversations or fetch profile
        const convRes = await fetch(`${API_BASE}/dm/conversations/`, { headers: authHeader() });
        const convData = await convRes.json();
        const found = (convData.conversations ?? []).find((c: ConvSummary) => c.id === data.id);
        if (found) {
          setConvs(convData.conversations ?? []);
          openConv(found.id, found.other_user);
        }
      } catch { /* ignore */ }
    })();
  }, [initialUserId, user]);

  // Poll for new messages when a conversation is active
  useEffect(() => {
    if (!activeConvId) return;
    const id = setInterval(() => fetchMessages(activeConvId), 3000);
    return () => clearInterval(id);
  }, [activeConvId, fetchMessages]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const openConv = async (convId: number, other: OtherUser) => {
    setActiveConvId(convId);
    setActiveOther(other);
    setLoadingMsgs(true);
    await fetchMessages(convId);
    setLoadingMsgs(false);
    // Mark as read in UI
    setConvs((prev) => prev.map((c) => c.id === convId ? { ...c, unread_count: 0 } : c));
  };

  const sendMessage = async () => {
    if (!draft.trim() || !activeConvId || !user) return;
    setSending(true);
    try {
      const res = await fetch(`${API_BASE}/dm/conversations/${activeConvId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader() },
        body: JSON.stringify({ content: draft.trim() }),
      });
      if (res.ok) {
        const msg: Message = await res.json();
        setMessages((prev) => [...prev, msg]);
        setDraft('');
        fetchConvs();
      }
    } catch { /* ignore */ }
    finally { setSending(false); }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  function timeAgo(iso: string | null): string {
    if (!iso) return '';
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return '방금';
    if (mins < 60) return `${mins}분 전`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}시간 전`;
    return `${Math.floor(hrs / 24)}일 전`;
  }

  return (
    <div
      className="auth-overlay"
      ref={overlayRef}
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div className="dm-modal" role="dialog" aria-modal="true">
        <div className="dm-modal__header">
          {activeConvId ? (
            <>
              <button className="dm-modal__back" onClick={() => { setActiveConvId(null); setActiveOther(null); setMessages([]); }}>
                <ChevronLeftIcon />
              </button>
              <div className="dm-modal__header-avatar" style={{ background: avatarColor(activeOther?.id ?? 0) }}>
                {activeOther?.username[0].toUpperCase()}
              </div>
              <span className="dm-modal__header-title">@{activeOther?.username}</span>
            </>
          ) : (
            <span className="dm-modal__header-title">메시지</span>
          )}
          <button className="dm-modal__close" onClick={onClose} aria-label="닫기">
            <CloseIcon />
          </button>
        </div>

        {!activeConvId ? (
          <div className="dm-modal__conv-list">
            {loadingConvs ? (
              <div className="dm-modal__empty">불러오는 중…</div>
            ) : convs.length === 0 ? (
              <div className="dm-modal__empty">대화가 없습니다.<br />프로필에서 메시지를 보내보세요.</div>
            ) : convs.map((c) => (
              <button
                key={c.id}
                className="dm-conv-item"
                onClick={() => openConv(c.id, c.other_user)}
              >
                <div className="dm-conv-item__avatar" style={{ background: avatarColor(c.other_user.id) }}>
                  {c.other_user.username[0].toUpperCase()}
                </div>
                <div className="dm-conv-item__info">
                  <div className="dm-conv-item__name">@{c.other_user.username}</div>
                  {c.last_message && (
                    <div className="dm-conv-item__preview">{c.last_message}</div>
                  )}
                </div>
                <div className="dm-conv-item__meta">
                  {c.last_message_at && (
                    <span className="dm-conv-item__time">{timeAgo(c.last_message_at)}</span>
                  )}
                  {c.unread_count > 0 && (
                    <span className="dm-conv-item__badge">{c.unread_count}</span>
                  )}
                </div>
              </button>
            ))}
          </div>
        ) : (
          <>
            <div className="dm-modal__messages">
              {loadingMsgs ? (
                <div className="dm-modal__empty">불러오는 중…</div>
              ) : messages.length === 0 ? (
                <div className="dm-modal__empty">첫 메시지를 보내보세요!</div>
              ) : messages.map((m) => {
                const isMine = m.sender_id === user?.id;
                return (
                  <div key={m.id} className={`dm-msg${isMine ? ' dm-msg--mine' : ''}`}>
                    <div className="dm-msg__bubble">{m.content}</div>
                    <div className="dm-msg__time">{timeAgo(m.created_at)}</div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>
            <div className="dm-modal__input-row">
              <input
                className="dm-modal__input"
                placeholder="메시지 입력…"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={handleKeyDown}
                autoFocus
              />
              <button
                className="dm-modal__send"
                onClick={sendMessage}
                disabled={!draft.trim() || sending}
                aria-label="보내기"
              >
                <SendIcon />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ChevronLeftIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>;
}
function CloseIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>;
}
function SendIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>;
}
