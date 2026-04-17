export const CATEGORIES = [
  { id: 'food',          label: '음식',     emoji: '🍜' },
  { id: 'drinks',        label: '술/바',    emoji: '🍺' },
  { id: 'cafe',          label: '카페',     emoji: '☕' },
  { id: 'entertainment', label: '오락',     emoji: '🎭' },
  { id: 'nature',        label: '자연',     emoji: '🌿' },
  { id: 'seasonal',      label: '시즌 한정', emoji: '🌸' },
  { id: 'shopping',      label: '쇼핑',     emoji: '🛍️' },
  { id: 'culture',       label: '문화/예술', emoji: '🎨' },
  { id: 'sports',        label: '스포츠',   emoji: '🏃' },
  { id: 'wellness',      label: '웰니스',   emoji: '💆' },
  { id: 'nightscape',    label: '야경',     emoji: '🌃' },
  { id: 'lodging',       label: '숙박',     emoji: '🏨' },
] as const;

export type CategoryId = typeof CATEGORIES[number]['id'];

export function getCategoryInfo(id: string | null | undefined) {
  if (!id) return null;
  return CATEGORIES.find((c) => c.id === id) ?? null;
}
