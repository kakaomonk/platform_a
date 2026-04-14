export interface MediaItem {
  url: string;
  media_type: 'image' | 'video';
}

export interface Post {
  id: number;
  content: string;
  user_id: number;
  location_name?: string | null;
  media: MediaItem[];
}
