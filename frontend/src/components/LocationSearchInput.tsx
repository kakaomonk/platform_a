import { useEffect, useRef, useState } from 'react';
import { API_BASE } from '../config';

interface Suggestion {
  name: string;
  display_name: string;
  lat: number;
  lng: number;
}

export interface SelectedLocation {
  id: number;
  name: string;
}

interface Props {
  initialValue?: string;
  placeholder?: string;
  showGps?: boolean;
  onSelect: (loc: SelectedLocation) => void;
  onClear?: () => void;
}

export function LocationSearchInput({ initialValue, placeholder, showGps, onSelect, onClear }: Props) {
  const [query, setQuery] = useState(initialValue ?? '');
  const [selected, setSelected] = useState<SelectedLocation | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Sync external initialValue changes (e.g., when edit mode opens with existing location)
  useEffect(() => {
    if (initialValue !== undefined) setQuery(initialValue);
  }, [initialValue]);

  // Debounced Photon search
  useEffect(() => {
    if (selected || query.trim().length < 2) {
      setSuggestions([]);
      setShowDropdown(false);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`${API_BASE}/location/search/?q=${encodeURIComponent(query)}`);
        const data = await res.json();
        const results: Suggestion[] = data.results ?? [];
        setSuggestions(results);
        setShowDropdown(results.length > 0);
      } catch {
        setSuggestions([]);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [query, selected]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
    setError(null);
    if (selected) { setSelected(null); onClear?.(); }
  };

  const selectSuggestion = async (s: Suggestion) => {
    setShowDropdown(false);
    setSuggestions([]);
    setQuery(s.name);
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/location/find-or-create/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: s.name, lat: s.lat, lng: s.lng }),
      });
      const data = await res.json();
      const loc: SelectedLocation = { id: data.location_id, name: data.name };
      setSelected(loc);
      setQuery(data.name);
      onSelect(loc);
    } catch {
      setError('위치 저장 실패');
    } finally {
      setLoading(false);
    }
  };

  const clear = () => {
    setQuery('');
    setSelected(null);
    setSuggestions([]);
    setShowDropdown(false);
    setError(null);
    onClear?.();
  };

  const requestGps = () => {
    if (!navigator.geolocation) { setError('위치 서비스 미지원'); return; }
    setLoading(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        try {
          const res = await fetch(
            `${API_BASE}/location/reverse-geocode/?lat=${coords.latitude}&lng=${coords.longitude}`
          );
          const data = await res.json();
          const loc: SelectedLocation = { id: data.location_id, name: data.name };
          setSelected(loc);
          setQuery(data.name);
          onSelect(loc);
        } catch {
          setError('위치 조회 실패');
        } finally {
          setLoading(false);
        }
      },
      () => { setError('위치 접근 거부'); setLoading(false); },
      { timeout: 10_000, maximumAge: 60_000 }
    );
  };

  return (
    <div className="loc-search" ref={containerRef}>
      <div className="loc-search__row">
        <div className="loc-search__input-wrap">
          <span className="loc-search__icon">
            {loading ? <SpinnerIcon /> : <PinIcon />}
          </span>
          <input
            className={`loc-search__input${selected ? ' loc-search__input--set' : ''}`}
            placeholder={placeholder ?? '위치 추가 (도시 검색 또는 GPS)'}
            value={query}
            onChange={handleChange}
            onFocus={() => { if (suggestions.length) setShowDropdown(true); }}
            onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
            autoComplete="off"
          />
          {(selected || query) && (
            <button className="loc-search__clear" onClick={clear} aria-label="위치 지우기">×</button>
          )}
        </div>
        {showGps && (
          <button
            className="loc-search__gps-btn"
            onClick={requestGps}
            disabled={loading}
            title="현재 위치"
          >
            <GpsIcon />
          </button>
        )}
      </div>

      {error && <p className="loc-search__error">{error}</p>}

      {showDropdown && (
        <ul className="loc-search__dropdown">
          {suggestions.map((s, i) => (
            <li key={i} className="loc-search__option" onMouseDown={() => selectSuggestion(s)}>
              <PinIcon />
              <span>
                <span className="loc-search__option-main">{s.name}</span>
                <span className="loc-search__option-sub">{s.display_name}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PinIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" />
    </svg>
  );
}

function GpsIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
      <circle cx="12" cy="12" r="8" strokeDasharray="2 3" />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ animation: 'spin 0.8s linear infinite' }}>
      <path d="M21 12a9 9 0 1 1-6.22-8.56" />
    </svg>
  );
}
