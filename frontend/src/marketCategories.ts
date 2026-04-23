export const MARKET_CATEGORIES = [
  { id: 'electronics', emoji: '📱' },
  { id: 'home',        emoji: '🏠' },
  { id: 'car',         emoji: '🚗' },
  { id: 'baby',        emoji: '👶' },
  { id: 'clothes',     emoji: '👕' },
  { id: 'beauty',      emoji: '💄' },
  { id: 'furniture',   emoji: '🛋️' },
  { id: 'books',       emoji: '📚' },
  { id: 'hobby',       emoji: '🎮' },
  { id: 'sports_gear', emoji: '⚽' },
  { id: 'pet',         emoji: '🐾' },
  { id: 'other',       emoji: '📦' },
] as const;

export type MarketCategoryId = typeof MARKET_CATEGORIES[number]['id'];

export function getMarketCategoryInfo(id: string | null | undefined) {
  if (!id) return null;
  return MARKET_CATEGORIES.find((c) => c.id === id) ?? null;
}
