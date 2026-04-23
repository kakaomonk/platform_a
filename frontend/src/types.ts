export interface MediaItem {
  url: string;
  media_type: 'image' | 'video';
}

export interface Post {
  id: number;
  content: string;
  user_id: number;
  username: string;
  avatar_url?: string | null;
  location_name?: string | null;
  location_id?: number;
  distance_km?: number | null;
  category?: string | null;
  media: MediaItem[];
  like_count: number;
  comment_count: number;
  is_liked: boolean;
  is_bookmarked?: boolean;
  is_marketplace?: boolean;
  listing_type?: 'sell' | 'buy' | null;
  price?: number | null;
  currency?: string | null;
  sold?: boolean;
}

export interface Comment {
  id: number;
  user_id: number;
  username: string;
  avatar_url?: string | null;
  content: string;
  created_at: string | null;
}

export interface AuthUser {
  id: number;
  username: string;
  token: string;
  avatar_url?: string | null;
}

export interface UserProfile {
  id: number;
  username: string;
  avatar_url: string | null;
  bio: string | null;
  post_count: number;
  follower_count: number;
  following_count: number;
  is_following: boolean;
  created_at: string | null;
}
