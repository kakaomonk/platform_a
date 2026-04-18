import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LocationSearchInput } from './LocationSearchInput';
import type { SelectedLocation } from './LocationSearchInput';
import { useAuth } from '../AuthContext';
import { CATEGORIES } from '../categories';

const AVATAR_PALETTE = ['#f97316', '#8b5cf6', '#06b6d4', '#10b981', '#f43f5e', '#3b82f6', '#eab308'];
const avatarColor = (id: number) => AVATAR_PALETTE[id % AVATAR_PALETTE.length];

interface PreviewItem {
  file: File;
  previewUrl: string;
  mediaType: 'image' | 'video';
}

interface Props {
  fallbackLocationId: number;
  onSubmit: (content: string, files: File[], locationId: number, category: string | null) => Promise<void>;
}

export function PostComposer({ fallbackLocationId, onSubmit }: Props) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [content, setContent] = useState('');
  const [previews, setPreviews] = useState<PreviewItem[]>([]);
  const [location, setLocation] = useState<SelectedLocation | null>(null);
  const [locResetKey, setLocResetKey] = useState(0);
  const [category, setCategory] = useState<string | null>(null);
  const [showCategories, setShowCategories] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const addFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const items: PreviewItem[] = Array.from(e.target.files ?? []).map((file) => ({
      file,
      previewUrl: URL.createObjectURL(file),
      mediaType: file.type.startsWith('video/') ? 'video' : 'image',
    }));
    setPreviews((prev) => [...prev, ...items]);
    e.target.value = '';
  };

  const removePreview = (i: number) => {
    setPreviews((prev) => {
      URL.revokeObjectURL(prev[i].previewUrl);
      return prev.filter((_, idx) => idx !== i);
    });
  };

  const autoResize = () => {
    const el = textareaRef.current;
    if (el) { el.style.height = 'auto'; el.style.height = `${el.scrollHeight}px`; }
  };

  const handleSubmit = async () => {
    if (!content.trim() && !previews.length) return;
    setSubmitting(true);
    try {
      await onSubmit(content, previews.map((p) => p.file), location?.id ?? fallbackLocationId, category);
      setContent('');
      setLocation(null);
      setLocResetKey((k) => k + 1);
      setCategory(null);
      setShowCategories(false);
      previews.forEach((p) => URL.revokeObjectURL(p.previewUrl));
      setPreviews([]);
      if (textareaRef.current) textareaRef.current.style.height = 'auto';
    } finally {
      setSubmitting(false);
    }
  };

  const selectedCat = CATEGORIES.find((c) => c.id === category);

  return (
    <div className="composer">
      <div className="avatar" style={{ background: user ? avatarColor(user.id) : '#71717a' }}>
        {user ? user.username[0].toUpperCase() : '?'}
      </div>
      <div className="composer__body">
        <textarea
          ref={textareaRef}
          className="composer__textarea"
          placeholder={t('composer.placeholder')}
          value={content}
          rows={1}
          onChange={(e) => setContent(e.target.value)}
          onInput={autoResize}
        />

        {previews.length > 0 && (
          <div className="composer__preview-strip">
            {previews.map((item, i) => (
              <div key={i} className="composer__preview-item">
                {item.mediaType === 'video'
                  ? <video src={item.previewUrl} className="composer__preview-thumb" muted playsInline />
                  : <img src={item.previewUrl} alt="" className="composer__preview-thumb" />}
                {item.mediaType === 'video' && <div className="composer__video-badge"><PlayIcon /></div>}
                <button className="composer__preview-remove" onClick={() => removePreview(i)} aria-label={t('composer.remove')}>×</button>
              </div>
            ))}
            <button className="composer__add-more" onClick={() => fileRef.current?.click()} title={t('composer.add_more')}>
              <PlusIcon />
            </button>
          </div>
        )}

        <LocationSearchInput
          key={locResetKey}
          showGps
          onSelect={setLocation}
          onClear={() => setLocation(null)}
        />

        {showCategories && (
          <div className="composer__cat-grid">
            {CATEGORIES.map((c) => (
              <button
                key={c.id}
                className={`composer__cat-chip${category === c.id ? ' composer__cat-chip--active' : ''}`}
                onClick={() => setCategory(category === c.id ? null : c.id)}
              >
                <span>{c.emoji}</span>
                <span>{t(`cat.${c.id}`)}</span>
              </button>
            ))}
          </div>
        )}

        <div className="composer__footer">
          <button className="composer__img-btn" onClick={() => fileRef.current?.click()} title={t('composer.attach_media')}>
            <ImageIcon />
          </button>
          <button
            className={`composer__img-btn${showCategories ? ' composer__img-btn--active' : ''}`}
            onClick={() => setShowCategories((v) => !v)}
            title={t('composer.select_category')}
          >
            {selectedCat ? (
              <span style={{ fontSize: '16px', lineHeight: 1 }}>{selectedCat.emoji}</span>
            ) : (
              <TagIcon />
            )}
          </button>
          <input ref={fileRef} type="file" accept="image/*,video/*" multiple hidden onChange={addFiles} />
          {selectedCat && (
            <span className="composer__cat-badge">
              {selectedCat.emoji} {t(`cat.${selectedCat.id}`)}
              <button onClick={() => setCategory(null)} aria-label={t('composer.clear_category')}>×</button>
            </span>
          )}
          <button
            className="btn-primary"
            onClick={handleSubmit}
            disabled={submitting || (!content.trim() && !previews.length)}
          >
            {submitting ? t('composer.posting') : t('composer.post')}
          </button>
        </div>
      </div>
    </div>
  );
}

function ImageIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" />
    </svg>
  );
}
function TagIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" /><line x1="7" y1="7" x2="7.01" y2="7" />
    </svg>
  );
}
function PlusIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}
function PlayIcon() {
  return <svg width="12" height="12" viewBox="0 0 24 24" fill="white"><polygon points="5 3 19 12 5 21 5 3" /></svg>;
}
