import { useEffect, useRef, useState } from 'react';
import type { Post, MediaItem } from '../types';
import { LocationSearchInput } from './LocationSearchInput';
import type { SelectedLocation } from './LocationSearchInput';

const AVATAR_PALETTE = ['#f97316', '#8b5cf6', '#06b6d4', '#10b981', '#f43f5e', '#3b82f6', '#eab308'];
const avatarColor = (id: number) => AVATAR_PALETTE[id % AVATAR_PALETTE.length];

interface EditChanges {
  content: string;
  locationId: number | null;
  locationName: string | null;
}

interface Props {
  post: Post;
  currentUserId: number | null;
  onDelete: (id: number) => void;
  onEdit: (id: number, changes: EditChanges) => Promise<void>;
}

export function PostCard({ post, currentUserId, onDelete, onEdit }: Props) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState(post.content);
  const [editLocation, setEditLocation] = useState<SelectedLocation | null>(null);
  const [saving, setSaving] = useState(false);
  const editRef = useRef<HTMLTextAreaElement>(null);

  const isOwner = currentUserId !== null && currentUserId === post.user_id;

  useEffect(() => { setEditContent(post.content); }, [post.content]);

  useEffect(() => {
    if (editing && editRef.current) {
      const el = editRef.current;
      el.focus();
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight}px`;
      el.selectionStart = el.selectionEnd = el.value.length;
    }
    if (!editing) setEditLocation(null);
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
  };

  return (
    <article className="post-card">
      <Carousel media={post.media} />
      <div className="post-card__body">
        {post.location_name && !editing && (
          <div className="post-card__location">
            <PinIcon /><span>{post.location_name}</span>
          </div>
        )}

        <div className="post-card__actions">
          <button className="action-btn" aria-label="좋아요"><HeartIcon /></button>
          <button className="action-btn" aria-label="댓글"><CommentIcon /></button>
          <div className="post-card__actions-right">
            {isOwner && (
              confirmDelete ? (
                <div className="post-card__delete-confirm">
                  <span>삭제할까요?</span>
                  <button className="post-card__confirm-yes" onClick={() => onDelete(post.id)}>삭제</button>
                  <button className="post-card__confirm-no" onClick={() => setConfirmDelete(false)}>취소</button>
                </div>
              ) : (
                <>
                  <button className="action-btn" aria-label="저장"><BookmarkIcon /></button>
                  <button
                    className="action-btn"
                    aria-label="편집"
                    onClick={() => { setEditing(true); setConfirmDelete(false); }}
                  ><PencilIcon /></button>
                  <button
                    className="action-btn action-btn--danger"
                    aria-label="삭제"
                    onClick={() => { setConfirmDelete(true); setEditing(false); }}
                  ><TrashIcon /></button>
                </>
              )
            )}
            {!isOwner && <button className="action-btn" aria-label="저장"><BookmarkIcon /></button>}
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
              placeholder="내용을 입력하세요"
            />
            <LocationSearchInput
              initialValue={post.location_name ?? ''}
              placeholder="위치 변경..."
              onSelect={setEditLocation}
              onClear={() => setEditLocation(null)}
            />
            <div className="post-card__edit-footer">
              <span className="post-card__edit-hint">⌘Enter 저장 · Esc 취소</span>
              <div className="post-card__edit-btns">
                <button className="post-card__edit-cancel" onClick={cancelEdit}>취소</button>
                <button className="post-card__edit-save" onClick={handleSave} disabled={saving}>
                  {saving ? '저장 중…' : '저장'}
                </button>
              </div>
            </div>
          </div>
        ) : (
          post.content && (
            <p className="post-card__content">
              <strong style={{ color: avatarColor(post.user_id) }}>
                {post.username ?? `user_${post.user_id}`}
              </strong>
              {' '}{post.content}
            </p>
          )
        )}
      </div>
    </article>
  );
}

// ── Carousel ──────────────────────────────────────────────────────────────────

function Carousel({ media }: { media: MediaItem[] }) {
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
          <button className="carousel__btn carousel__btn--prev" onClick={prev} aria-label="이전"><ChevronLeftIcon /></button>
          <button className="carousel__btn carousel__btn--next" onClick={next} aria-label="다음"><ChevronRightIcon /></button>
          <div className="carousel__dots">
            {media.map((_, i) => (
              <button key={i} className={`carousel__dot${i === index ? ' carousel__dot--active' : ''}`} onClick={() => setIndex(i)} aria-label={`슬라이드 ${i + 1}`} />
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
function HeartIcon() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></svg>;
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
