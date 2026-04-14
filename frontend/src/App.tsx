import { useEffect, useState } from 'react';
import { Navbar } from './components/Navbar';
import { PostComposer } from './components/PostComposer';
import { PostCard } from './components/PostCard';
import { MapPanel } from './components/MapPanel';
import { API_BASE } from './config';
import type { Post } from './types';
import './App.css';

export default function App() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [feedLocId, setFeedLocId] = useState(2);
  const [loading, setLoading] = useState(false);

  const fetchPosts = async (id: number) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/search/?location_id=${id}`);
      const data = await res.json();
      setPosts(data.posts ?? []);
    } catch (err) {
      console.error('Failed to fetch posts:', err);
    } finally {
      setLoading(false);
    }
  };

  const handlePost = async (content: string, files: File[], locationId: number) => {
    let media: { url: string; media_type: string }[] = [];

    if (files.length > 0) {
      const form = new FormData();
      files.forEach((f) => form.append('files', f));
      const res = await fetch(`${API_BASE}/upload/`, { method: 'POST', body: form });
      const data = await res.json();
      media = data.media;
    }

    await fetch(`${API_BASE}/posts/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: 1, content, location_id: locationId, media }),
    });

    // If the post was tagged to a different location than the feed, switch feed to that location
    if (locationId !== feedLocId) setFeedLocId(locationId);
    else fetchPosts(feedLocId);
  };

  const handleEdit = async (
    postId: number,
    changes: { content: string; locationId: number | null; locationName: string | null }
  ) => {
    // Optimistic update
    setPosts((prev) => prev.map((p) => {
      if (p.id !== postId) return p;
      return {
        ...p,
        content: changes.content,
        ...(changes.locationId !== null ? { location_name: changes.locationName } : {}),
      };
    }));

    const body: Record<string, unknown> = { content: changes.content };
    if (changes.locationId !== null) body.location_id = changes.locationId;

    try {
      await fetch(`${API_BASE}/posts/${postId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch (err) {
      console.error('Edit failed:', err);
      fetchPosts(feedLocId);
    }
  };

  const handleDelete = async (postId: number) => {
    // Optimistic update
    setPosts((prev) => prev.filter((p) => p.id !== postId));
    try {
      await fetch(`${API_BASE}/posts/${postId}`, { method: 'DELETE' });
    } catch (err) {
      console.error('Delete failed:', err);
      fetchPosts(feedLocId); // rollback
    }
  };

  useEffect(() => { fetchPosts(feedLocId); }, [feedLocId]);

  return (
    <>
      <Navbar />
      <div className="layout">
        <main className="feed">
          <PostComposer fallbackLocationId={feedLocId} onSubmit={handlePost} />
          {loading ? (
            <p className="feed__state">불러오는 중…</p>
          ) : posts.length === 0 ? (
            <p className="feed__state">아직 게시물이 없습니다.</p>
          ) : (
            <div className="feed-grid">
              {posts.map((post) => (
                <PostCard key={post.id} post={post} onDelete={handleDelete} onEdit={handleEdit} />
              ))}
            </div>
          )}
        </main>
        <aside className="sidebar">
          <MapPanel locId={feedLocId} onLocChange={setFeedLocId} />
        </aside>
      </div>
    </>
  );
}
