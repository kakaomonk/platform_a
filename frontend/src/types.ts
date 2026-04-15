export interface MediaItem {
  url: string;
  media_type: 'image' | 'video';
}

export interface Post {
  id: number;
  content: string;
  user_id: number;
  username: string;
  location_name?: string | null;
  location_id?: number;
  distance_km?: number | null;
  media: MediaItem[];
}

export interface AuthUser {
  id: number;
  username: string;
  token: string;
}
