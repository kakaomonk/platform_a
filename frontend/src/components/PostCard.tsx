import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Post, MediaItem, Comment } from '../types';
import { LocationSearchInput } from './LocationSearchInput';
import type { SelectedLocation } from './LocationSearchInput';
import { API_BASE } from '../config';
import { useAuth } from '../AuthContext';
import { CATEGORIES } from '../categories';

const AVATAR_PALETTE = ['#f97316', '#8b5cf6', '#06b6d4', '#10b981', '#f43f5e', '#3b82f6', '#eab308'];

function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)}m`;
  if (km < 10) return `${km.toFixed(1)}km`;
  return `${Math.round(km).toLocaleString()}km`;
}
const avatarColor = (id: number) => AVATAR_PALETTE[id % AVATAR_PALETTE.length];

function renderMentions(text: string) {
  const parts = text.split(/(@\w+)/g);
  return parts.map((part, i) => {
    if (/^@\w+$/.test(part)) {
      return <span key={i} className="mention">{part}</span>;
    }
    return part;
  });
}

interface EditChanges {
  content: string;
  locationId: number | null;
  locationName: string | null;
  category: string | null;
}

interface Props {
  post: Post;
  currentUserId: number | null;
  onDelete: (id: number) => void;
  onEdit: (id: number, changes: EditChanges) => Promise<void>;
  onProfileClick?: (userId: number) => void;
}

export function PostCard({ post, currentUserId, onDelete, onEdit, onProfileClick }: Props) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState(post.content);
  const [editLocation, setEditLocation] = useState<SelectedLocation | null>(null);
  const [editCategory, setEditCategory] = useState<string | null>(post.category ?? null);
  const [showEditCategories, setShowEditCategories] = useState(false);
  const [saving, setSaving] = useState(false);
  const editRef = useRef<HTMLTextAreaElement>(null);

  const [liked, setLiked] = useState(post.is_liked);
  const [likeCount, setLikeCount] = useState(post.like_count);
  const [likeLoading, setLikeLoading] = useState(false);

  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentText, setCommentText] = useState('');
  const [commentCount, setCommentCount] = useState(post.comment_count);
  const [commentsLoaded, setCommentsLoaded] = useState(false);

  const isOwner = currentUserId !== null && currentUserId === post.user_id;

  useEffect(() => { setEditContent(post.content); }, [post.content]);
  useEffect(() => { setLiked(post.is_liked); setLikeCount(post.like_count); }, [post.is_liked, post.like_count]);
  useEffect(() => { setCommentCount(post.comment_count); }, [post.comment_count]);
  useEffect(() => { setEditCategory(post.category ?? null); }, [post.category]);

  useEffect(() => {
    if (editing && editRef.current) {
      const el = editRef.current;
      el.focus();
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight}px`;
      el.selectionStart = el.selectionEnd = el.value.length;
    }
    if (!editing) { setEditLocation(null); setShowEditCategories(false); }
  }, [editing]);

  const autoResizeEdit = () => {
    const el = editRef.current;
    if (el) { el.style.height = 'auto'; el.style.height = `${el.scrollHeight}px`; }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onEdit(post.id, {
        content: editContent.trim(),
        locationId: editLocation?.id ?? null,
        locationName: editLocation?.name ?? null,
        category: editCategory,
      });
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSave();
    if (e.key === 'Escape') { setEditing(false); setEditContent(post.content); }
  };

  const cancelEdit = () => {
    setEditing(false);
    setEditContent(post.content);
    setEditLocation(null);
    setEditCategory(post.category ?? null);
  };

  const toggleLike = async () => {
    if (!user || likeLoading) return;
    setLikeLoading(true);
    const method = liked ? 'DELETE' : 'POST';
    try {
      const res = await fetch(`${API_BASE}/posts/${post.id}/like`, {
        method,
        headers: { Authorization: `Bearer ${user.token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setLiked(!liked);
        setLikeCount(data.like_count);
      }
    } catch { /* ignore */ }
    finally { setLikeLoading(false); }
  };

  const loadComments = async () => {
    try {
      const res = await fetch(`${API_BASE}/posts/${post.id}/comments`);
      const data = await res.json();
      setComments(data.comments);
      setCommentsLoaded(true);
    } catch { /* ignore */ }
  };

  const toggleComments = () => {
    const next = !showComments;
    setShowComments(next);
    if (next && !commentsLoaded) loadComments();
  };

  const submitComment = async () => {
    if (!user || !commentText.trim()) return;
    try {
      const res = await fetch(`${API_BASE}/posts/${post.id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user.token}` },
        body: JSON.stringify({ content: commentText.trim() }),
      });
      if (res.ok) {
        const c: Comment = await res.json();
        setComments((prev) => [...prev, c]);
        setCommentCount((n) => n + 1);
        setCommentText('');
      }
    } catch { /* ignore */ }
  };

  const deleteComment = async (commentId: number) => {
    if (!user) return;
    try {
      const res = await fetch(`${API_BASE}/comments/${commentId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${user.token}` },
      });
      if (res.ok) {
        setComments((prev) => prev.filter((c) => c.id !== commentId));
        setCommentCount((n) => Math.max(0, n - 1));
      }
    } catch { /* ignore */ }
  };

  const handleCommentKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitComment(); }
  };

  function timeAgo(dateStr: string | null): string {
    if (!dateStr) return '';
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return t('post.just_now');
    if (mins < 60) return t('post.mins_ago', { n: mins });
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return t('post.hours_ago', { n: hrs });
    return t('post.days_ago', { n: Math.floor(hrs / 24) });
  }

  const catInfo = CATEGORIES.find((c) => c.id === post.category);

  return (
    <article className="post-card">
      <Carousel media={post.media} t={t} />
      <div className="post-card__body">
        {(post.location_name || post.distance_km != null) && !editing && (
          <div className="post-card__location">
            <PinIcon />
            <span>
              {post.location_name}
              {post.distance_km != null && (
                <span className="post-card__distance"> · {formatDistance(post.distance_km)}</span>
              )}
            </span>
            {catInfo && (
              <span className="post-card__cat-tag">{catInfo.emoji} {t(`cat.${catInfo.id}`)}</span>
            )}
          </div>
        )}

        {catInfo && !post.location_name && !editing && (
          <div className="post-card__location">
            <span className="post-card__cat-tag">{catInfo.emoji} {t(`cat.${catInfo.id}`)}</span>
          </div>
        )}

        <div className="post-card__actions">
          <button
            className={`action-btn${liked ? ' action-btn--liked' : ''}`}
            aria-label={t('post.like')}
            onClick={toggleLike}
            disabled={!user}
          >
            {liked ? <HeartFilledIcon /> : <HeartIcon />}
          </button>
          {likeCount > 0 && <span className="post-card__like-count">{likeCount}</span>}
          <button className="action-btn" aria-label={t('post.comment')} onClick={toggleComments}>
            <CommentIcon />
          </button>
          {commentCount > 0 && <span className="post-card__comment-count">{commentCount}</span>}
          <div className="post-card__actions-right">
            {isOwner && (
              confirmDelete ? (
                <div className="post-card__delete-confirm">
                  <span>{t('post.delete_confirm')}</span>
                  <button className="post-card__confirm-yes" onClick={() => onDelete(post.id)}>{t('post.delete')}</button>
                  <button className="post-card__confirm-no" onClick={() => setConfirmDelete(false)}>{t('post.cancel')}</button>
                </div>
              ) : (
                <>
                  <button className="action-btn" aria-label={t('post.save')}><BookmarkIcon /></button>
                  <button
                    className="action-btn"
                    aria-label={t('post.edit')}
                    onClick={() => { setEditing(true); setConfirmDelete(false); }}
                  ><PencilIcon /></button>
                  <button
                    className="action-btn action-btn--danger"
                    aria-label={t('post.delete')}
                    onClick={() => { setConfirmDelete(true); setEditing(false); }}
                  ><TrashIcon /></button>
                </>
              )
            )}
            {!isOwner && <button className="action-btn" aria-label={t('post.save')}><BookmarkIcon /></button>}
          </div>
        </div>

        {editing ? (
          <div className="post-card__edit-wrap">
            <textarea
              ref={editRef}
              className="post-card__edit-textarea"
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              onInput={autoResizeEdit}
              onKeyDown={handleKeyDown}
              placeholder={t('post.content_placeholder')}
            />
            <LocationSearchInput
              initialValue={post.location_name ?? ''}
              placeholder={t('post.location_change')}
              onSelect={setEditLocation}
              onClear={() => setEditLocation(null)}
            />
            <div className="post-card__edit-cat-row">
              <button
                className={`post-card__edit-cat-toggle${showEditCategories ? ' active' : ''}`}
                onClick={() => setShowEditCategories((v) => !v)}
              >
                <TagIcon />
                {editCategory
                  ? `${CATEGORIES.find((c) => c.id === editCategory)?.emoji ?? ''} ${t(`cat.${editCategory}`)}`
                  : t('post.category')}
              </button>
              {editCategory && (
                <button className="post-card__edit-cat-clear" onClick={() => setEditCategory(null)}>×</button>
              )}
            </div>
            {showEditCategories && (
              <div className="composer__cat-grid">
                {CATEGORIES.map((c) => (
                  <button
                    key={c.id}
                    className={`composer__cat-chip${editCategory === c.id ? ' composer__cat-chip--active' : ''}`}
                    onClick={() => setEditCategory(editCategory === c.id ? null : c.id)}
                  >
                    <span>{c.emoji}</span>
                    <span>{t(`cat.${c.id}`)}</span>
                  </button>
                ))}
              </div>
            )}
            <div className="post-card__edit-footer">
              <span className="post-card__edit-hint">{t('post.save_hint')}</span>
              <div className="post-card__edit-btns">
                <button className="post-card__edit-cancel" onClick={cancelEdit}>{t('post.cancel')}</button>
                <button className="post-card__edit-save" onClick={handleSave} disabled={saving}>
                  {saving ? t('post.saving') : t('post.save')}
                </button>
              </div>
            </div>
          </div>
        ) : (
          post.content && (
            <p className="post-card__content">
              <strong
                style={{ color: avatarColor(post.user_id), cursor: onProfileClick ? 'pointer' : undefined }}
                onClick={() => onProfileClick?.(post.user_id)}
              >
                {post.username ?? `user_${post.user_id}`}
              </strong>
              {' '}{renderMentions(post.content)}
            </p>
          )
        )}

        {showComments && (
          <div className="post-card__comments">
            {comments.map((c) => (
              <div key={c.id} className="post-card__comment">
                <div className="post-card__comment-body">
                  <strong
                    style={{ color: avatarColor(c.user_id), cursor: onProfileClick ? 'pointer' : undefined }}
                    onClick={() => onProfileClick?.(c.user_id)}
                  >
                    {c.username}
                  </strong>
                  {' '}{renderMentions(c.content)}
                  <span className="post-card__comment-time">{timeAgo(c.created_at)}</span>
                </div>
                {currentUserId === c.user_id && (
                  <button className="post-card__comment-del" onClick={() => deleteComment(c.id)} aria-label={t('post.delete')}>×</button>
                )}
              </div>
            ))}
            {user && (
              <div className="post-card__comment-input-row">
                <input
                  className="post-card__comment-input"
                  placeholder={t('post.comment_placeholder')}
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  onKeyDown={handleCommentKey}
                />
                <button
                  className="post-card__comment-submit"
                  onClick={submitComment}
                  disabled={!commentText.trim()}
                >
                  {t('post.post_comment')}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </article>
  );
}

// ── Carousel ──────────────────────────────────────────────────────────────────

function Carousel({ media, t }: { media: MediaItem[]; t: (key: string, opts?: object) => string }) {
  const [index, setIndex] = useState(0);
  const [dragStart, setDragStart] = useState<number | null>(null);

  if (!media.length) return <div className="carousel carousel--empty"><NoImageIcon /></div>;

  const prev = () => setIndex((i) => (i - 1 + media.length) % media.length);
  const next = () => setIndex((i) => (i + 1) % media.length);

  const onTouchStart = (e: React.TouchEvent) => setDragStart(e.touches[0].clientX);
  const onTouchEnd = (e: React.TouchEvent) => {
    if (dragStart === null) return;
    const delta = dragStart - e.changedTouches[0].clientX;
    if (Math.abs(delta) > 40) delta > 0 ? next() : prev();
    setDragStart(null);
  };

  const current = media[index];
  return (
    <div className="carousel" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      {current.media_type === 'video'
        ? <video key={index} src={current.url} className="carousel__media" controls playsInline muted />
        : <img key={index} src={current.url} alt="" className="carousel__media" />}
      {media.length > 1 && (
        <>
          <button className="carousel__btn carousel__btn--prev" onClick={prev} aria-label={t('post.prev')}><ChevronLeftIcon /></button>
          <button className="carousel__btn carousel__btn--next" onClick={next} aria-label={t('post.next')}><ChevronRightIcon /></button>
          <div className="carousel__dots">
            {media.map((_, i) => (
              <button key={i} className={`carousel__dot${i === index ? ' carousel__dot--active' : ''}`} onClick={() => setIndex(i)} aria-label={t('post.slide', { n: i + 1 })} />
            ))}
          </div>
          <div className="carousel__counter">{index + 1} / {media.length}</div>
          <div className="carousel__multi-badge"><MultiIcon /></div>
        </>
      )}
    </div>
  );
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function PinIcon() {
  return <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" /></svg>;
}
function TagIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" /><line x1="7" y1="7" x2="7.01" y2="7" /></svg>;
}
function HeartIcon() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></svg>;
}
function HeartFilledIcon() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="#ef4444" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></svg>;
}
function CommentIcon() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>;
}
function BookmarkIcon() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" /></svg>;
}
function PencilIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>;
}
function TrashIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /></svg>;
}
function ChevronLeftIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>;
}
function ChevronRightIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>;
}
function MultiIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="7" y="3" width="14" height="14" rx="2" /><path d="M3 7v11a2 2 0 0 0 2 2h11" /></svg>;
}
function NoImageIcon() {
  return <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.3 }}><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>;
}
