import { useEffect, useState, useCallback } from 'react';
import { Navbar } from './components/Navbar';
import { PostComposer } from './components/PostComposer';
import { PostCard } from './components/PostCard';
import { MapPanel } from './components/MapPanel';
import { ProfileModal } from './components/ProfileModal';
import { API_BASE } from './config';
import { useAuth } from './AuthContext';
import type { Post } from './types';
import './App.css';

const DEFAULT_COORDS = { lat: 37.5665, lng: 126.978 }; // Seoul

export default function App() {
  const { user } = useAuth();
  const [posts, setPosts] = useState<Post[]>([]);
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [defaultLocationId, setDefaultLocationId] = useState(1);
  const [loading, setLoading] = useState(false);
  const [geoStatus, setGeoStatus] = useState<'pending' | 'granted' | 'denied'>('pending');
  const [profileUserId, setProfileUserId] = useState<number | null>(null);

  const coords = userCoords ?? DEFAULT_COORDS;

  const authHeader = (): Record<string, string> =>
    user ? { Authorization: `Bearer ${user.token}` } : {};

  const fetchFeed = useCallback(async (lat: number, lng: number) => {
    setLoading(true);
    try {
      const headers: Record<string, string> = user
        ? { Authorization: `Bearer ${user.token}` }
        : {};
      const res = await fetch(`${API_BASE}/feed/?lat=${lat}&lng=${lng}`, { headers });
      const data = await res.json();
      setPosts(data.posts ?? []);
    } catch (err) {
      console.error('Failed to fetch feed:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Get browser geolocation
  useEffect(() => {
    if (!navigator.geolocation) {
      setGeoStatus('denied');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords: c }) => {
        setUserCoords({ lat: c.latitude, lng: c.longitude });
        setGeoStatus('granted');
      },
      () => setGeoStatus('denied'),
      { timeout: 10_000, maximumAge: 300_000 },
    );
  }, []);

  // Reverse-geocode user position to get a default location for the composer
  useEffect(() => {
    if (!userCoords) return;
    fetch(`${API_BASE}/location/reverse-geocode/?lat=${userCoords.lat}&lng=${userCoords.lng}`)
      .then((r) => r.json())
      .then((d) => setDefaultLocationId(d.location_id))
      .catch(() => {});
  }, [userCoords]);

  // Fetch proximity feed
  useEffect(() => {
    fetchFeed(coords.lat, coords.lng);
  }, [coords.lat, coords.lng, fetchFeed]);

  const refreshFeed = () => fetchFeed(coords.lat, coords.lng);

  const handleSearchSelect = async (locationId: number) => {
    if (user) {
      try {
        await fetch(`${API_BASE}/search-history/`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeader() },
          body: JSON.stringify({ location_id: locationId }),
        });
      } catch { /* ignore */ }
    }
    refreshFeed();
  };

  const handlePost = async (content: string, files: File[], locationId: number) => {
    let media: { url: string; media_type: string }[] = [];
    if (files.length > 0) {
      const form = new FormData();
      files.forEach((f) => form.append('files', f));
      const res = await fetch(`${API_BASE}/upload/`, {
        method: 'POST',
        headers: authHeader(),
        body: form,
      });
      const data = await res.json();
      media = data.media;
    }
    await fetch(`${API_BASE}/posts/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader() },
      body: JSON.stringify({ content, location_id: locationId, media }),
    });
    refreshFeed();
  };

  const handleEdit = async (
    postId: number,
    changes: { content: string; locationId: number | null; locationName: string | null },
  ) => {
    setPosts((prev) =>
      prev.map((p) => {
        if (p.id !== postId) return p;
        return {
          ...p,
          content: changes.content,
          ...(changes.locationId !== null ? { location_name: changes.locationName } : {}),
        };
      }),
    );
    const body: Record<string, unknown> = { content: changes.content };
    if (changes.locationId !== null) body.location_id = changes.locationId;
    try {
      await fetch(`${API_BASE}/posts/${postId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeader() },
        body: JSON.stringify(body),
      });
    } catch (err) {
      console.error('Edit failed:', err);
      refreshFeed();
    }
  };

  const handleDelete = async (postId: number) => {
    setPosts((prev) => prev.filter((p) => p.id !== postId));
    try {
      await fetch(`${API_BASE}/posts/${postId}`, {
        method: 'DELETE',
        headers: authHeader(),
      });
    } catch (err) {
      console.error('Delete failed:', err);
      refreshFeed();
    }
  };

  return (
    <>
      <Navbar onProfileClick={() => user && setProfileUserId(user.id)} />
      <div className="layout">
        <main className="feed">
          {user ? (
            <PostComposer fallbackLocationId={defaultLocationId} onSubmit={handlePost} />
          ) : (
            <div className="feed__login-prompt">
              게시물을 올리려면 <strong>로그인</strong>이 필요합니다.
            </div>
          )}
          {loading ? (
            <p className="feed__state">불러오는 중…</p>
          ) : posts.length === 0 ? (
            <p className="feed__state">아직 게시물이 없습니다.</p>
          ) : (
            <div className="feed-grid">
              {posts.map((post) => (
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
          )}
        </main>
        <aside className="sidebar">
          <MapPanel
            userCoords={coords}
            geoStatus={geoStatus}
            onSearchSelect={handleSearchSelect}
          />
        </aside>
      </div>

      {profileUserId !== null && (
        <ProfileModal userId={profileUserId} onClose={() => setProfileUserId(null)} />
      )}
    </>
  );
}
