import { useTranslation } from 'react-i18next';
import { CATEGORIES } from '../categories';

interface Props {
  selected: string | null;
  onSelect: (id: string | null) => void;
}

export function CategoryNav({ selected, onSelect }: Props) {
  const { t } = useTranslation();
  return (
    <nav className="cat-nav">
      <div className="cat-nav__label">{t('cat.label')}</div>
      <button
        className={`cat-nav__item${selected === null ? ' cat-nav__item--active' : ''}`}
        onClick={() => onSelect(null)}
      >
        <span className="cat-nav__emoji">🗺️</span>
        <span className="cat-nav__text">{t('cat.all')}</span>
      </button>
      {CATEGORIES.map((c) => (
        <button
          key={c.id}
          className={`cat-nav__item${selected === c.id ? ' cat-nav__item--active' : ''}`}
          onClick={() => onSelect(selected === c.id ? null : c.id)}
        >
          <span className="cat-nav__emoji">{c.emoji}</span>
          <span className="cat-nav__text">{t(`cat.${c.id}`)}</span>
        </button>
      ))}
    </nav>
  );
}
