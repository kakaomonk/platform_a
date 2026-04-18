import { useTranslation } from 'react-i18next';
import { APIProvider, Map, AdvancedMarker } from '@vis.gl/react-google-maps';
import { LocationSearchInput } from './LocationSearchInput';
import type { SelectedLocation } from './LocationSearchInput';

const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? '';

interface Props {
  userCoords: { lat: number; lng: number };
  geoStatus: 'pending' | 'granted' | 'denied';
  onSearchSelect: (locationId: number, locationName: string, lat: number, lng: number) => void;
  onLocationClear: () => void;
}

export function MapPanel({ userCoords, geoStatus, onSearchSelect, onLocationClear }: Props) {
  const { t } = useTranslation();

  const handleSelect = (loc: SelectedLocation) => {
    onSearchSelect(loc.id, loc.name, loc.lat, loc.lng);
  };

  return (
    <div className="map-panel">
      <div className="map-panel__map">
        {API_KEY ? (
          <APIProvider apiKey={API_KEY}>
            <Map defaultCenter={userCoords} defaultZoom={12} mapId="DEMO_MAP_ID">
              <AdvancedMarker position={userCoords} />
            </Map>
          </APIProvider>
        ) : (
          <div className="map-panel__placeholder">
            <MapIcon />
            <span style={{ whiteSpace: 'pre-line' }}>{t('map.api_hint')}</span>
          </div>
        )}
      </div>
      <div className="map-panel__footer-v2">
        <div className="map-panel__geo-status">
          <GpsIcon />
          <span>
            {geoStatus === 'pending'
              ? t('map.locating')
              : geoStatus === 'granted'
                ? t('map.sorted_my')
                : t('map.sorted_default')}
          </span>
        </div>
        <LocationSearchInput
          placeholder={t('map.search_placeholder')}
          onSelect={handleSelect}
          onClear={onLocationClear}
        />
      </div>
    </div>
  );
}

function MapIcon() {
  return (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21" />
      <line x1="9" y1="3" x2="9" y2="18" />
      <line x1="15" y1="6" x2="15" y2="21" />
    </svg>
  );
}

function GpsIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
      <circle cx="12" cy="12" r="8" strokeDasharray="2 3" />
    </svg>
  );
}
