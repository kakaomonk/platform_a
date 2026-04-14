import { useEffect, useState, useRef } from 'react';
import { APIProvider, Map, AdvancedMarker } from '@vis.gl/react-google-maps';

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
  const [file, setFile] = useState<File | null>(null);

  const fetchPosts = async (id: number) => {
    try {
      const res = await fetch(`http://localhost:9000/search/?location_id=${id}`);
      const data = await res.json();
      setPosts(data.posts || []);
    } catch (err) { console.error('Fetch error:', err); }
  };

  const createPost = async () => {
    if (!content.trim()) return;
    
    let imageUrl = '';
    if (file) {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("http://localhost:9000/upload/", { method: "POST", body: formData });
      const data = await res.json();
      imageUrl = data.url;
    }

    await fetch(`http://localhost:9000/posts/?user_id=1&content=${encodeURIComponent(content)}&location_id=${locId}&image_url=${encodeURIComponent(imageUrl)}`, { method: 'POST' });
    setContent('');
    setFile(null);
    fetchPosts(locId);
  };

  useEffect(() => { fetchPosts(locId); }, [locId]);

  return (
    <div style={{ backgroundColor: '#f7f7f7', minHeight: '100vh', paddingBottom: '50px' }}>
      <nav style={{ position: 'sticky', top: 0, zIndex: 10, backgroundColor: 'white', padding: '10px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
        <h1 style={{ fontSize: '1.5rem', color: '#ff2442', margin: 0 }}>Discovery</h1>
        <input type="number" value={locId} onChange={(e) => setLocId(Number(e.target.value))} style={{ width: '40px' }} />
      </nav>
      
      {/* Google Map Section */}
      <div style={{ height: '300px', margin: '20px auto', maxWidth: '900px', borderRadius: '20px', overflow: 'hidden' }}>
        <APIProvider apiKey={"YOUR_GOOGLE_MAPS_API_KEY"}>
          <Map defaultCenter={{lat: 37.7749, lng: -122.4194}} defaultZoom={12} mapId={"DEMO_MAP_ID"}>
            <AdvancedMarker position={{lat: 37.7749, lng: -122.4194}} />
          </Map>
        </APIProvider>
      </div>

      <div style={{ maxWidth: '600px', margin: '20px auto', padding: '0 20px' }}>
        <div style={{ background: 'white', padding: '20px', borderRadius: '20px' }}>
          <textarea value={content} onChange={(e) => setContent(e.target.value)} style={{ width: '100%', height: '70px' }} placeholder="무엇을 발견했나요?" />
          <input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} />
          <button onClick={createPost}>게시하기</button>
        </div>
      </div>

      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '0 15px' }}>
        <div style={{ columnCount: 2, columnGap: '15px' }}>
          {posts.map((post) => (
            <div key={post.id} style={{ breakInside: 'avoid', marginBottom: '15px', background: 'white', borderRadius: '20px', overflow: 'hidden' }}>
              {post.image_url && <img src={post.image_url} alt="Post" style={{ width: '100%', display: 'block' }} />}
              <div style={{ padding: '15px' }}>
                <p>{post.content}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default App;
