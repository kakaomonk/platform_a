import { useEffect, useState } from 'react';

interface Post {
  id: number;
  content: string;
  user_id: number;
  image_url?: string;
}

function App() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [content, setContent] = useState('');
  const [locId, setLocId] = useState(2);

  const fetchPosts = async (id: number) => {
    try {
      const res = await fetch(`http://localhost:9000/search/?location_id=${id}`);
      const data = await res.json();
      console.log('Fetched posts:', data.posts); // 디버깅용 로그
      setPosts(data.posts || []);
    } catch (err) { console.error('Fetch error:', err); }
  };

  const createPost = async () => {
    if (!content.trim()) return;
    // 이미지 URL을 포함하지 않은 상태로 전송 중일 수 있음 (여기서는 하드코딩된 테스트 이미지 사용)
    const testImageUrl = 'https://images.unsplash.com/photo-1501594907352-04cda38ebc29?q=80&w=600';
    await fetch(`http://localhost:9000/posts/?user_id=1&content=${encodeURIComponent(content)}&location_id=${locId}&image_url=${encodeURIComponent(testImageUrl)}`, { method: 'POST' });
    setContent('');
    fetchPosts(locId);
  };

  useEffect(() => { fetchPosts(locId); }, [locId]);

  return (
    <div style={{ backgroundColor: '#f7f7f7', minHeight: '100vh', paddingBottom: '50px', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif' }}>
      <nav style={{ position: 'sticky', top: 0, zIndex: 10, backgroundColor: 'white', padding: '10px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
        <h1 style={{ fontSize: '1.5rem', color: '#ff2442', margin: 0, letterSpacing: '-0.5px' }}>Discovery</h1>
        <div style={{ background: '#f0f0f0', padding: '6px 12px', borderRadius: '20px' }}>
          📍 <input type="number" value={locId} onChange={(e) => setLocId(Number(e.target.value))} style={{ border: 'none', background: 'transparent', width: '30px', fontWeight: '600' }} />
        </div>
      </nav>
      
      <div style={{ maxWidth: '600px', margin: '20px auto', padding: '0 20px' }}>
        <div style={{ background: 'white', padding: '20px', borderRadius: '20px', boxShadow: '0 4px 16px rgba(0,0,0,0.04)' }}>
          <textarea value={content} onChange={(e) => setContent(e.target.value)} style={{ width: '100%', height: '70px', padding: '10px', borderRadius: '12px', border: 'none', backgroundColor: '#f9f9f9', fontSize: '1rem', resize: 'none', outline: 'none' }} placeholder="무엇을 발견했나요?" />
          <button onClick={createPost} style={{ width: '100%', marginTop: '10px', padding: '10px', background: '#ff2442', color: 'white', border: 'none', borderRadius: '12px', fontWeight: '600', cursor: 'pointer' }}>게시하기</button>
        </div>
      </div>

      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '0 15px' }}>
        <div style={{ columnCount: 2, columnGap: '15px' }}>
          {posts.map((post) => (
            <div key={post.id} style={{ breakInside: 'avoid', marginBottom: '15px', background: 'white', borderRadius: '20px', overflow: 'hidden', transition: 'transform 0.2s', border: '1px solid #eee' }}>
              {post.image_url ? (
                <img src={post.image_url} alt="Post" style={{ width: '100%', display: 'block', borderRadius: '20px 20px 0 0' }} />
              ) : (
                <div style={{ height: '200px', background: '#f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ccc' }}>No Image</div>
              )}
              <div style={{ padding: '15px' }}>
                <p style={{ margin: '0 0 10px 0', fontSize: '0.95rem', color: '#333', lineHeight: '1.5' }}>{post.content}</p>
                <small style={{ color: '#999' }}>ID: {post.id} | Image: {post.image_url ? 'Yes' : 'No'}</small>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default App;
