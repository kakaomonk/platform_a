import { useRef, useState } from 'react';
import { LocationSearchInput } from './LocationSearchInput';
import type { SelectedLocation } from './LocationSearchInput';

interface PreviewItem {
  file: File;
  previewUrl: string;
  mediaType: 'image' | 'video';
}

interface Props {
  fallbackLocationId: number;
  onSubmit: (content: string, files: File[], locationId: number) => Promise<void>;
}

export function PostComposer({ fallbackLocationId, onSubmit }: Props) {
  const [content, setContent] = useState('');
  const [previews, setPreviews] = useState<PreviewItem[]>([]);
  const [location, setLocation] = useState<SelectedLocation | null>(null);
  const [locResetKey, setLocResetKey] = useState(0);
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
      await onSubmit(content, previews.map((p) => p.file), location?.id ?? fallbackLocationId);
      setContent('');
      setLocation(null);
      setLocResetKey((k) => k + 1);
      previews.forEach((p) => URL.revokeObjectURL(p.previewUrl));
      setPreviews([]);
      if (textareaRef.current) textareaRef.current.style.height = 'auto';
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="composer">
      <div className="avatar avatar--gradient">H</div>
      <div className="composer__body">
        <textarea
          ref={textareaRef}
          className="composer__textarea"
          placeholder="무엇을 발견했나요?"
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
                <button className="composer__preview-remove" onClick={() => removePreview(i)} aria-label="제거">×</button>
              </div>
            ))}
            <button className="composer__add-more" onClick={() => fileRef.current?.click()} title="더 추가">
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

        <div className="composer__footer">
          <button className="composer__img-btn" onClick={() => fileRef.current?.click()} title="사진/동영상 첨부">
            <ImageIcon />
          </button>
          <input ref={fileRef} type="file" accept="image/*,video/*" multiple hidden onChange={addFiles} />
          <button
            className="btn-primary"
            onClick={handleSubmit}
            disabled={submitting || (!content.trim() && !previews.length)}
          >
            {submitting ? '게시 중…' : '게시하기'}
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
