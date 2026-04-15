import { useState } from 'react';
import { APIProvider, Map, AdvancedMarker } from '@vis.gl/react-google-maps';
import { LocationSearchInput } from './LocationSearchInput';
import type { SelectedLocation } from './LocationSearchInput';

const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? '';

interface Props {
  userCoords: { lat: number; lng: number };
  geoStatus: 'pending' | 'granted' | 'denied';
  onSearchSelect: (locationId: number) => void;
}

export function MapPanel({ userCoords, geoStatus, onSearchSelect }: Props) {
  const [resetKey, setResetKey] = useState(0);

  const handleSelect = (loc: SelectedLocation) => {
    onSearchSelect(loc.id);
    setResetKey((k) => k + 1);
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
            <span>Google Maps API 키를 설정하면<br />지도가 표시됩니다</span>
          </div>
        )}
      </div>
      <div className="map-panel__footer-v2">
        <div className="map-panel__geo-status">
          <GpsIcon />
          <span>
            {geoStatus === 'pending'
              ? '위치 확인 중…'
              : geoStatus === 'granted'
                ? '내 위치 기준 정렬'
                : '기본 위치(서울) 기준 정렬'}
          </span>
        </div>
        <LocationSearchInput
          key={resetKey}
          placeholder="위치 검색으로 추천 개선"
          onSelect={handleSelect}
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
