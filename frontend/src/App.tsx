import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useTheme } from './useTheme';
import { Navbar } from './components/Navbar';
import { PostComposer } from './components/PostComposer';
import type { ComposerSubmit } from './components/PostComposer';
import { PostCard } from './components/PostCard';
import { MapPanel } from './components/MapPanel';
import { ProfileModal } from './components/ProfileModal';
import { CategoryNav } from './components/CategoryNav';
import { DMModal } from './components/DMModal';
import { NotificationsModal } from './components/NotificationsModal';
import { PullToRefresh } from './components/PullToRefresh';
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
  const { t } = useTranslation();
  return (
    <div className="nearby-cities">
      <div className="nearby-cities__header">
        <span className="nearby-cities__title">{t('feed.nearby_cities')}</span>
        <span className="nearby-cities__sub">{t('feed.cities_with_posts')}</span>
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
              {t('feed.posts_count', { count: city.post_count })}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

const DEFAULT_COORDS = { lat: 37.5665, lng: 126.978 };

function FeedSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="feed-grid" aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="post-card-skeleton" style={{ animationDelay: `${i * 60}ms` }}>
          <div className="skeleton post-card-skeleton__media" />
          <div className="post-card-skeleton__body">
            <div className="skeleton post-card-skeleton__line" style={{ width: '45%', height: 10 }} />
            <div className="skeleton post-card-skeleton__line" style={{ width: '90%' }} />
            <div className="skeleton post-card-skeleton__line" style={{ width: '70%' }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="feed__state">
      <div className="feed__state-icon">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      </div>
      <div className="feed__state-title">{title}</div>
      {sub && <div className="feed__state-sub">{sub}</div>}
    </div>
  );
}

export default function App() {
  const { t } = useTranslation();
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

  // Marketplace mode
  const [marketplaceMode, setMarketplaceMode] = useState(false);
  const [marketPosts, setMarketPosts] = useState<Post[]>([]);
  const [marketLoading, setMarketLoading] = useState(false);

  // DM modal
  const [showDM, setShowDM] = useState(false);
  const [dmTargetUserId, setDmTargetUserId] = useState<number | null>(null);
  const [dmInitialText, setDmInitialText] = useState<string | null>(null);
  const [dmUnread, setDmUnread] = useState(0);

  // Notifications
  const [showNotifs, setShowNotifs] = useState(false);
  const [notifUnread, setNotifUnread] = useState(0);

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

  const fetchMarketplace = useCallback(async (lat: number, lng: number, cat: string | null = null) => {
    setMarketLoading(true);
    try {
      const headers: Record<string, string> = user ? { Authorization: `Bearer ${user.token}` } : {};
      const catParam = cat ? `&category=${cat}` : '';
      const res = await fetch(`${API_BASE}/marketplace/?lat=${lat}&lng=${lng}${catParam}`, { headers });
      const data = await res.json();
      setMarketPosts(data.posts ?? []);
    } catch (err) {
      console.error('Marketplace fetch failed:', err);
    } finally {
      setMarketLoading(false);
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

  // Normal feed — only when not in search/location/marketplace mode
  useEffect(() => {
    if (searchQuery || locationFilter || marketplaceMode) return;
    fetchFeed(coords.lat, coords.lng, feedTab, categoryFilter);
  }, [coords.lat, coords.lng, fetchFeed, feedTab, searchQuery, locationFilter, categoryFilter, marketplaceMode]);

  // Marketplace feed
  useEffect(() => {
    if (!marketplaceMode) return;
    fetchMarketplace(coords.lat, coords.lng, categoryFilter);
  }, [marketplaceMode, coords.lat, coords.lng, categoryFilter, fetchMarketplace]);

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

  // Poll notification unread count
  useEffect(() => {
    if (!user) { setNotifUnread(0); return; }
    const poll = async () => {
      try {
        const res = await fetch(`${API_BASE}/notifications/unread-count`, { headers: authHeader() });
        const data = await res.json();
        setNotifUnread(data.unread_count ?? 0);
      } catch { /* ignore */ }
    };
    poll();
    const id = setInterval(poll, 30_000);
    return () => clearInterval(id);
  }, [user]);

  const refreshFeed = () => {
    if (marketplaceMode) void fetchMarketplace(coords.lat, coords.lng, categoryFilter);
    else if (searchQuery) void handleSearch(searchQuery);
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
    // Lifestyle categories belong to the regular feed — selecting one exits marketplace mode
    // so the user doesn't get stuck on an empty filtered marketplace view.
    if (marketplaceMode) setMarketplaceMode(false);
    setCategoryFilter(cat);
    if (searchQuery) void handleSearch(searchQuery);
    else if (locationFilter) void fetchLocationPosts(locationFilter.id, cat);
    // else: normal feed useEffect will fire due to categoryFilter / marketplaceMode change
  };

  const handleMarketplaceToggle = () => {
    // Marketplace uses a different category set (MARKET_CATEGORIES), so clear any lifestyle
    // filter when entering/leaving marketplace.
    setMarketplaceMode((v) => !v);
    setCategoryFilter(null);
    setSearchQuery('');
    setSearchPosts([]);
    setLocationFilter(null);
    setNearbyCities([]);
  };

  const handlePost = async (data: ComposerSubmit) => {
    let media: { url: string; media_type: string }[] = [];
    if (data.files.length > 0) {
      const form = new FormData();
      data.files.forEach((f) => form.append('files', f));
      const res = await fetch(`${API_BASE}/upload/`, { method: 'POST', headers: authHeader(), body: form });
      media = (await res.json()).media;
    }
    const res = await fetch(`${API_BASE}/posts/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader() },
      body: JSON.stringify({
        content: data.content,
        location_id: data.locationId,
        media,
        category: data.category,
        is_marketplace: data.isMarketplace,
        listing_type: data.listingType,
        price: data.price,
        currency: 'KRW',
      }),
    });
    if (!res.ok) {
      console.error('[POST /posts] failed:', res.status, await res.text());
      return;
    }
    // Route the viewer to the tab where their new post will be visible, then fetch explicitly
    // (setMarketplaceMode is async, so refreshFeed() using the stale value would hit the wrong feed).
    if (data.isMarketplace) {
      if (!marketplaceMode) setMarketplaceMode(true);
      setSearchQuery('');
      setSearchPosts([]);
      setLocationFilter(null);
      void fetchMarketplace(coords.lat, coords.lng, categoryFilter);
    } else {
      if (marketplaceMode) setMarketplaceMode(false);
      setSearchQuery('');
      setSearchPosts([]);
      setLocationFilter(null);
      void fetchFeed(coords.lat, coords.lng, feedTab, categoryFilter);
    }
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

  const openDM = (targetUserId?: number, initialText?: string) => {
    setDmTargetUserId(targetUserId ?? null);
    setDmInitialText(initialText ?? null);
    setShowDM(true);
  };

  const isMarketMode = marketplaceMode;
  const isSearchMode = !isMarketMode && searchQuery !== '';
  const isLocationMode = !isMarketMode && !isSearchMode && locationFilter !== null;
  const displayPosts = isMarketMode ? marketPosts : isSearchMode ? searchPosts : posts;
  const displayLoading = isMarketMode ? marketLoading : isSearchMode ? searchLoading : loading;

  return (
    <>
      <Navbar
        onProfileClick={() => user && setProfileUserId(user.id)}
        onSearch={handleSearch}
        onLocationSelect={(id, name, lat, lng) => handleSearchSelect(id, name, lat, lng)}
        onDMClick={() => openDM()}
        dmUnreadCount={dmUnread}
        onNotificationsClick={() => setShowNotifs(true)}
        notifUnreadCount={notifUnread}
        isDark={theme === 'dark'}
        onThemeToggle={toggleTheme}
      />
      <div className="layout">
        <CategoryNav
          selected={categoryFilter}
          onSelect={handleCategorySelect}
          marketplaceActive={marketplaceMode}
          onMarketplaceToggle={handleMarketplaceToggle}
        />

        <main className="feed">
        <PullToRefresh onRefresh={refreshFeed}>
          {!isSearchMode && !isLocationMode && !isMarketMode && user && (
            <div className="feed-tabs">
              <button
                className={`feed-tab${feedTab === 'discover' ? ' feed-tab--active' : ''}`}
                onClick={() => setFeedTab('discover')}
              >{t('feed.discover')}</button>
              <button
                className={`feed-tab${feedTab === 'following' ? ' feed-tab--active' : ''}`}
                onClick={() => setFeedTab('following')}
              >{t('feed.following')}</button>
            </div>
          )}

          {isMarketMode && (
            <div className="market-header">
              <div className="market-header__icon">🛍️</div>
              <div>
                <div className="market-header__title">{t('market.title')}</div>
                <div className="market-header__sub">{t('market.subtitle')}</div>
              </div>
            </div>
          )}

          {isSearchMode && (
            <div className="search-results-header">
              {t('feed.search_results', { query: searchQuery, count: searchTotal })}
            </div>
          )}
          {isLocationMode && (
            <div className="search-results-header">
              {t('feed.location_posts', { name: locationFilter!.name })}
            </div>
          )}

          {!isSearchMode && !isLocationMode && (
            user ? (
              <PostComposer
                fallbackLocationId={defaultLocationId}
                defaultMarketplace={isMarketMode}
                onSubmit={handlePost}
              />
            ) : (
              <div className="feed__login-prompt">
                {t('feed.login_required')}
              </div>
            )
          )}

          {displayLoading ? (
            <FeedSkeleton count={6} />
          ) : displayPosts.length === 0 ? (
            <>
              <EmptyState
                title={isMarketMode ? t('market.empty')
                  : isSearchMode ? t('feed.no_results')
                  : isLocationMode ? t('feed.no_location_posts')
                  : t('feed.no_posts')}
              />
              {isLocationMode && nearbyCities.length > 0 && (
                <NearbyCitiesBox
                  cities={nearbyCities}
                  onSelect={(id, name, lat, lng) => handleSearchSelect(id, name, lat, lng)}
                />
              )}
            </>
          ) : (
            <>
              <div className={`feed-grid${isMarketMode ? ' feed-grid--market' : ''}`}>
                {displayPosts.map((post) => (
                  <PostCard
                    key={post.id}
                    post={post}
                    currentUserId={user?.id ?? null}
                    onDelete={handleDelete}
                    onEdit={handleEdit}
                    onProfileClick={(uid) => setProfileUserId(uid)}
                    onOffer={(uid, text) => openDM(uid, text)}
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
        </PullToRefresh>
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
          onClose={() => { setShowDM(false); setDmTargetUserId(null); setDmInitialText(null); }}
          initialUserId={dmTargetUserId}
          initialText={dmInitialText}
        />
      )}

      {showNotifs && (
        <NotificationsModal
          onClose={() => setShowNotifs(false)}
          onProfileOpen={(uid) => setProfileUserId(uid)}
          onRead={() => setNotifUnread(0)}
        />
      )}
    </>
  );
}
