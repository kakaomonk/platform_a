import { useEffect, useState, useCallback } from 'react';
import { useTheme } from './useTheme';
import { Navbar } from './components/Navbar';
import { PostComposer } from './components/PostComposer';
import { PostCard } from './components/PostCard';
import { MapPanel } from './components/MapPanel';
import { ProfileModal } from './components/ProfileModal';
import { CategoryNav } from './components/CategoryNav';
import { DMModal } from './components/DMModal';
import { API_BASE } from './config';
import { useAuth } from './AuthContext';
import type { Post } from './types';

interface NearbyCity {
  id: number;
  name: string;
  post_count: number;
  distance_km: number;
  lat: number;
  lng: number;
}
import './App.css';

function NearbyCitiesBox({
  cities,
  onSelect,
}: {
  cities: NearbyCity[];
  onSelect: (id: number, name: string, lat: number, lng: number) => void;
}) {
  return (
    <div className="nearby-cities">
      <div className="nearby-cities__header">
        <span className="nearby-cities__title">근처 도시 탐색</span>
        <span className="nearby-cities__sub">포스트가 있는 가까운 도시</span>
      </div>
      <div className="nearby-cities__list">
        {cities.map((city) => (
          <button
            key={city.id}
            className="nearby-city-btn"
            onClick={() => onSelect(city.id, city.name, city.lat, city.lng)}
          >
            <span className="nearby-city-btn__pin">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
              </svg>
            </span>
            <span className="nearby-city-btn__name">{city.name}</span>
            <span className="nearby-city-btn__meta">
              {city.distance_km < 1 ? `${Math.round(city.distance_km * 1000)}m` : `${city.distance_km}km`}
              {' · '}
              {city.post_count}개
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

const DEFAULT_COORDS = { lat: 37.5665, lng: 126.978 };

export default function App() {
  const { user } = useAuth();
  const { theme, toggle: toggleTheme } = useTheme();

  const [posts, setPosts] = useState<Post[]>([]);
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [defaultLocationId, setDefaultLocationId] = useState(1);
  const [loading, setLoading] = useState(false);
  const [geoStatus, setGeoStatus] = useState<'pending' | 'granted' | 'denied'>('pending');
  const [profileUserId, setProfileUserId] = useState<number | null>(null);
  const [feedTab, setFeedTab] = useState<'discover' | 'following'>('discover');

  // Category filter
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);

  // DM modal
  const [showDM, setShowDM] = useState(false);
  const [dmTargetUserId, setDmTargetUserId] = useState<number | null>(null);
  const [dmUnread, setDmUnread] = useState(0);

  // Text search
  const [searchQuery, setSearchQuery] = useState('');
  const [searchPosts, setSearchPosts] = useState<Post[]>([]);
  const [searchTotal, setSearchTotal] = useState(0);
  const [searchLoading, setSearchLoading] = useState(false);

  // Location filter
  const [locationFilter, setLocationFilter] = useState<{ id: number; name: string; lat: number; lng: number } | null>(null);
  const [nearbyCities, setNearbyCities] = useState<NearbyCity[]>([]);

  const coords = userCoords ?? DEFAULT_COORDS;
  const authHeader = (): Record<string, string> =>
    user ? { Authorization: `Bearer ${user.token}` } : {};

  const fetchFeed = useCallback(async (
    lat: number, lng: number,
    tab: 'discover' | 'following' = 'discover',
    cat: string | null = null,
  ) => {
    setLoading(true);
    try {
      const headers: Record<string, string> = user ? { Authorization: `Bearer ${user.token}` } : {};
      let url: string;
      if (tab === 'following') {
        url = `${API_BASE}/feed/following${cat ? `?category=${cat}` : ''}`;
      } else {
        url = `${API_BASE}/feed/?lat=${lat}&lng=${lng}${cat ? `&category=${cat}` : ''}`;
      }
      const res = await fetch(url, { headers });
      const data = await res.json();
      setPosts(data.posts ?? []);
    } catch (err) {
      console.error('Failed to fetch feed:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  const fetchNearbyCities = useCallback(async (lat: number, lng: number, excludeId: number) => {
    try {
      const res = await fetch(
        `${API_BASE}/search/nearby-cities/?lat=${lat}&lng=${lng}&exclude_id=${excludeId}&limit=6`
      );
      const data = await res.json();
      setNearbyCities(data.cities ?? []);
    } catch { setNearbyCities([]); }
  }, []);

  const fetchLocationPosts = useCallback(async (locationId: number, cat: string | null = null) => {
    setLoading(true);
    try {
      const headers: Record<string, string> = user ? { Authorization: `Bearer ${user.token}` } : {};
      const catParam = cat ? `&category=${cat}` : '';
      const res = await fetch(`${API_BASE}/search/?location_id=${locationId}&limit=50${catParam}`, { headers });
      const data = await res.json();
      setPosts(data.posts ?? []);
    } catch (err) {
      console.error('Location filter failed:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  const handleSearch = useCallback(async (q: string) => {
    setLocationFilter(null);
    setSearchQuery(q);
    if (!q) {
      setSearchPosts([]);
      setSearchTotal(0);
      return;
    }
    setSearchLoading(true);
    try {
      const headers: Record<string, string> = user ? { Authorization: `Bearer ${user.token}` } : {};
      const catParam = categoryFilter ? `&category=${categoryFilter}` : '';
      const res = await fetch(
        `${API_BASE}/search/posts/?q=${encodeURIComponent(q)}&lat=${coords.lat}&lng=${coords.lng}${catParam}`,
        { headers },
      );
      const data = await res.json();
      setSearchPosts(data.posts ?? []);
      setSearchTotal(data.total ?? 0);
    } catch (err) {
      console.error('Search failed:', err);
    } finally {
      setSearchLoading(false);
    }
  }, [user, coords, categoryFilter]);

  // Geolocation
  useEffect(() => {
    if (!navigator.geolocation) { setGeoStatus('denied'); return; }
    navigator.geolocation.getCurrentPosition(
      ({ coords: c }) => { setUserCoords({ lat: c.latitude, lng: c.longitude }); setGeoStatus('granted'); },
      () => setGeoStatus('denied'),
      { timeout: 10_000, maximumAge: 300_000 },
    );
  }, []);

  // Reverse geocode for default location
  useEffect(() => {
    if (!userCoords) return;
    fetch(`${API_BASE}/location/reverse-geocode/?lat=${userCoords.lat}&lng=${userCoords.lng}`)
      .then((r) => r.json())
      .then((d) => setDefaultLocationId(d.location_id))
      .catch(() => {});
  }, [userCoords]);

  // Normal feed — only when not in search/location mode
  useEffect(() => {
    if (searchQuery || locationFilter) return;
    fetchFeed(coords.lat, coords.lng, feedTab, categoryFilter);
  }, [coords.lat, coords.lng, fetchFeed, feedTab, searchQuery, locationFilter, categoryFilter]);

  // Poll DM unread count
  useEffect(() => {
    if (!user) { setDmUnread(0); return; }
    const poll = async () => {
      try {
        const res = await fetch(`${API_BASE}/dm/unread-count`, { headers: authHeader() });
        const data = await res.json();
        setDmUnread(data.unread_count ?? 0);
      } catch { /* ignore */ }
    };
    poll();
    const id = setInterval(poll, 30_000);
    return () => clearInterval(id);
  }, [user]);

  const refreshFeed = () => {
    if (searchQuery) void handleSearch(searchQuery);
    else if (locationFilter) void fetchLocationPosts(locationFilter.id, categoryFilter);
    else fetchFeed(coords.lat, coords.lng, feedTab, categoryFilter);
  };

  const handleSearchSelect = async (locationId: number, locationName: string, lat: number, lng: number) => {
    setSearchQuery('');
    setSearchPosts([]);
    setSearchTotal(0);
    setLocationFilter({ id: locationId, name: locationName, lat, lng });
    void fetchNearbyCities(lat, lng, locationId);

    if (user) {
      try {
        await fetch(`${API_BASE}/search-history/`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeader() },
          body: JSON.stringify({ location_id: locationId }),
        });
      } catch { /* ignore */ }
    }
    void fetchLocationPosts(locationId, categoryFilter);
  };

  const handleLocationClear = () => {
    setLocationFilter(null);
    setNearbyCities([]);
    fetchFeed(coords.lat, coords.lng, feedTab, categoryFilter);
  };

  const handleCategorySelect = (cat: string | null) => {
    setCategoryFilter(cat);
    // Re-fetch with new category — useEffect handles normal feed; manually handle special modes
    if (searchQuery) void handleSearch(searchQuery);
    else if (locationFilter) void fetchLocationPosts(locationFilter.id, cat);
    // else: normal feed useEffect will fire due to categoryFilter change
  };

  const handlePost = async (content: string, files: File[], locationId: number, category: string | null) => {
    let media: { url: string; media_type: string }[] = [];
    if (files.length > 0) {
      const form = new FormData();
      files.forEach((f) => form.append('files', f));
      const res = await fetch(`${API_BASE}/upload/`, { method: 'POST', headers: authHeader(), body: form });
      media = (await res.json()).media;
    }
    await fetch(`${API_BASE}/posts/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader() },
      body: JSON.stringify({ content, location_id: locationId, media, category }),
    });
    refreshFeed();
  };

  const handleEdit = async (
    postId: number,
    changes: { content: string; locationId: number | null; locationName: string | null; category: string | null },
  ) => {
    const update = (prev: Post[]) => prev.map((p) => p.id !== postId ? p : {
      ...p,
      content: changes.content,
      ...(changes.locationId !== null ? { location_name: changes.locationName } : {}),
      category: changes.category,
    });
    if (searchQuery) setSearchPosts(update); else setPosts(update);
    const body: Record<string, unknown> = { content: changes.content };
    if (changes.locationId !== null) body.location_id = changes.locationId;
    body.category = changes.category ?? '';
    try {
      const res = await fetch(`${API_BASE}/posts/${postId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeader() },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        console.error('[PATCH /posts] failed:', res.status, await res.text());
        refreshFeed();
      } else {
        const saved = await res.json();
        console.log('[PATCH /posts] saved:', saved);
        const confirm = (prev: Post[]) => prev.map((p) => p.id !== postId ? p : {
          ...p,
          content: saved.content,
          ...(saved.location_name != null ? { location_name: saved.location_name } : {}),
          category: saved.category ?? null,
        });
        if (searchQuery) setSearchPosts(confirm); else setPosts(confirm);
      }
    } catch { refreshFeed(); }
  };

  const handleDelete = async (postId: number) => {
    const filter = (prev: Post[]) => prev.filter((p) => p.id !== postId);
    if (searchQuery) setSearchPosts(filter); else setPosts(filter);
    try {
      await fetch(`${API_BASE}/posts/${postId}`, { method: 'DELETE', headers: authHeader() });
    } catch { refreshFeed(); }
  };

  const openDM = (targetUserId?: number) => {
    setDmTargetUserId(targetUserId ?? null);
    setShowDM(true);
  };

  const isSearchMode = searchQuery !== '';
  const isLocationMode = !isSearchMode && locationFilter !== null;
  const displayPosts = isSearchMode ? searchPosts : posts;
  const displayLoading = isSearchMode ? searchLoading : loading;

  return (
    <>
      <Navbar
        onProfileClick={() => user && setProfileUserId(user.id)}
        onSearch={handleSearch}
        onLocationSelect={(id, name, lat, lng) => handleSearchSelect(id, name, lat, lng)}
        onDMClick={() => openDM()}
        dmUnreadCount={dmUnread}
        isDark={theme === 'dark'}
        onThemeToggle={toggleTheme}
      />
      <div className="layout">
        <CategoryNav selected={categoryFilter} onSelect={handleCategorySelect} />

        <main className="feed">
          {!isSearchMode && !isLocationMode && user && (
            <div className="feed-tabs">
              <button
                className={`feed-tab${feedTab === 'discover' ? ' feed-tab--active' : ''}`}
                onClick={() => setFeedTab('discover')}
              >발견</button>
              <button
                className={`feed-tab${feedTab === 'following' ? ' feed-tab--active' : ''}`}
                onClick={() => setFeedTab('following')}
              >팔로잉</button>
            </div>
          )}

          {isSearchMode && (
            <div className="search-results-header">
              <strong>"{searchQuery}"</strong> 검색 결과 {searchTotal}개
            </div>
          )}
          {isLocationMode && (
            <div className="search-results-header">
              📍 <strong>{locationFilter!.name}</strong> 게시물
            </div>
          )}

          {!isSearchMode && !isLocationMode && (
            user ? (
              <PostComposer fallbackLocationId={defaultLocationId} onSubmit={handlePost} />
            ) : (
              <div className="feed__login-prompt">
                게시물을 올리려면 <strong>로그인</strong>이 필요합니다.
              </div>
            )
          )}

          {displayLoading ? (
            <p className="feed__state">불러오는 중…</p>
          ) : displayPosts.length === 0 ? (
            <>
              <p className="feed__state">
                {isSearchMode ? '검색 결과가 없습니다.' : isLocationMode ? '이 위치의 게시물이 없습니다.' : '아직 게시물이 없습니다.'}
              </p>
              {isLocationMode && nearbyCities.length > 0 && (
                <NearbyCitiesBox
                  cities={nearbyCities}
                  onSelect={(id, name, lat, lng) => handleSearchSelect(id, name, lat, lng)}
                />
              )}
            </>
          ) : (
            <>
              <div className="feed-grid">
                {displayPosts.map((post) => (
                  <PostCard
                    key={post.id}
                    post={post}
                    currentUserId={user?.id ?? null}
                    onDelete={handleDelete}
                    onEdit={handleEdit}
                    onProfileClick={(uid) => setProfileUserId(uid)}
                  />
                ))}
              </div>
              {isLocationMode && nearbyCities.length > 0 && (
                <NearbyCitiesBox
                  cities={nearbyCities}
                  onSelect={(id, name, lat, lng) => handleSearchSelect(id, name, lat, lng)}
                />
              )}
            </>
          )}
        </main>

        <aside className="sidebar">
          <MapPanel
            userCoords={coords}
            geoStatus={geoStatus}
            onSearchSelect={handleSearchSelect}
            onLocationClear={handleLocationClear}
          />
        </aside>
      </div>

      {profileUserId !== null && (
        <ProfileModal
          userId={profileUserId}
          onClose={() => setProfileUserId(null)}
          onDMOpen={(uid) => openDM(uid)}
        />
      )}

      {showDM && (
        <DMModal
          onClose={() => { setShowDM(false); setDmTargetUserId(null); }}
          initialUserId={dmTargetUserId}
        />
      )}
    </>
  );
}
