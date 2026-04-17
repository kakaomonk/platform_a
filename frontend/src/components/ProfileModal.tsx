import { useEffect, useRef, useState } from 'react';
import { API_BASE } from '../config';
import { useAuth } from '../AuthContext';
import type { UserProfile } from '../types';

const AVATAR_PALETTE = ['#f97316', '#8b5cf6', '#06b6d4', '#10b981', '#f43f5e', '#3b82f6', '#eab308'];
const avatarColor = (id: number) => AVATAR_PALETTE[id % AVATAR_PALETTE.length];

interface Props {
  userId: number;
  onClose: () => void;
  onDMOpen?: (userId: number) => void;
}

export function ProfileModal({ userId, onClose, onDMOpen }: Props) {
  const { user, login } = useAuth();
  const overlayRef = useRef<HTMLDivElement>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingBio, setEditingBio] = useState(false);
  const [bioText, setBioText] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const isMe = user?.id === userId;
  const [followLoading, setFollowLoading] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  useEffect(() => {
    setLoading(true);
    const headers: Record<string, string> = user ? { Authorization: `Bearer ${user.token}` } : {};
    fetch(`${API_BASE}/users/${userId}`, { headers })
      .then((r) => r.json())
      .then((data) => { setProfile(data); setBioText(data.bio ?? ''); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [userId, user]);

  const toggleFollow = async () => {
    if (!user || !profile || followLoading) return;
    setFollowLoading(true);
    const method = profile.is_following ? 'DELETE' : 'POST';
    try {
      const res = await fetch(`${API_BASE}/users/${userId}/follow`, {
        method,
        headers: { Authorization: `Bearer ${user.token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setProfile({
          ...profile,
          is_following: !profile.is_following,
          follower_count: data.follower_count,
        });
      }
    } catch { /* ignore */ }
    finally { setFollowLoading(false); }
  };

  const saveBio = async () => {
    if (!user || !profile) return;
    const res = await fetch(`${API_BASE}/users/me`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user.token}` },
      body: JSON.stringify({ bio: bioText }),
    });
    if (res.ok) {
      const data = await res.json();
      setProfile({ ...profile, bio: data.bio });
      setEditingBio(false);
    }
  };

  const uploadAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setUploading(true);
    const form = new FormData();
    form.append('file', file);
    try {
      const res = await fetch(`${API_BASE}/users/me/avatar`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${user.token}` },
        body: form,
      });
      if (res.ok) {
        const data = await res.json();
        if (profile) setProfile({ ...profile, avatar_url: data.avatar_url });
        // Update auth context so navbar reflects new avatar
        login(user.token, user.id, user.username);
      }
    } catch { /* ignore */ }
    finally { setUploading(false); e.target.value = ''; }
  };

  return (
    <div
      className="auth-overlay"
      ref={overlayRef}
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div className="profile-modal" role="dialog" aria-modal="true">
        {loading ? (
          <div className="profile-modal__loading">불러오는 중…</div>
        ) : !profile ? (
          <div className="profile-modal__loading">사용자를 찾을 수 없습니다</div>
        ) : (
          <>
            <div className="profile-modal__header">
              <div className="profile-modal__avatar-wrap">
                {profile.avatar_url ? (
                  <img src={profile.avatar_url} alt="" className="profile-modal__avatar-img" />
                ) : (
                  <div className="profile-modal__avatar-placeholder" style={{ background: avatarColor(profile.id) }}>
                    {profile.username[0].toUpperCase()}
                  </div>
                )}
                {isMe && (
                  <>
                    <button
                      className="profile-modal__avatar-edit"
                      onClick={() => fileRef.current?.click()}
                      disabled={uploading}
                      title="프로필 사진 변경"
                    >
                      {uploading ? '…' : <CameraIcon />}
                    </button>
                    <input ref={fileRef} type="file" accept="image/*" hidden onChange={uploadAvatar} />
                  </>
                )}
              </div>
              <div className="profile-modal__info">
                <div className="profile-modal__username-row">
                  <h2 className="profile-modal__username">@{profile.username}</h2>
                  {!isMe && user && (
                    <>
                      <button
                        className={`profile-modal__follow-btn${profile.is_following ? ' profile-modal__follow-btn--following' : ''}`}
                        onClick={toggleFollow}
                        disabled={followLoading}
                      >
                        {profile.is_following ? '팔로잉' : '팔로우'}
                      </button>
                      <button
                        className="profile-modal__dm-btn"
                        onClick={() => { onDMOpen?.(userId); onClose(); }}
                        title="메시지 보내기"
                      >
                        <MessageIcon />
                      </button>
                    </>
                  )}
                </div>
                <div className="profile-modal__stats">
                  <span>게시물 <strong>{profile.post_count}</strong></span>
                  <span>팔로워 <strong>{profile.follower_count}</strong></span>
                  <span>팔로잉 <strong>{profile.following_count}</strong></span>
                </div>
              </div>
            </div>

            <div className="profile-modal__bio-section">
              {editingBio ? (
                <div className="profile-modal__bio-edit">
                  <textarea
                    className="profile-modal__bio-textarea"
                    value={bioText}
                    onChange={(e) => setBioText(e.target.value)}
                    maxLength={300}
                    placeholder="자기소개를 입력하세요"
                    rows={3}
                    autoFocus
                  />
                  <div className="profile-modal__bio-edit-actions">
                    <span className="profile-modal__bio-count">{bioText.length}/300</span>
                    <button className="post-card__edit-cancel" onClick={() => { setEditingBio(false); setBioText(profile.bio ?? ''); }}>취소</button>
                    <button className="post-card__edit-save" onClick={saveBio}>저장</button>
                  </div>
                </div>
              ) : (
                <div className="profile-modal__bio">
                  {profile.bio ? (
                    <p className="profile-modal__bio-text">{profile.bio}</p>
                  ) : isMe ? (
                    <p className="profile-modal__bio-text profile-modal__bio-text--empty">자기소개를 추가해보세요</p>
                  ) : null}
                  {isMe && (
                    <button className="profile-modal__bio-edit-btn" onClick={() => setEditingBio(true)}>
                      {profile.bio ? '편집' : '추가'}
                    </button>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function CameraIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}
function MessageIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}
