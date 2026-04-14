import { APIProvider, Map, AdvancedMarker } from '@vis.gl/react-google-maps';

const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? '';

interface Props {
  locId: number;
  onLocChange: (id: number) => void;
}

export function MapPanel({ locId, onLocChange }: Props) {
  return (
    <div className="map-panel">
      <div className="map-panel__map">
        {API_KEY ? (
          <APIProvider apiKey={API_KEY}>
            <Map defaultCenter={{ lat: 37.7749, lng: -122.4194 }} defaultZoom={12} mapId="DEMO_MAP_ID">
              <AdvancedMarker position={{ lat: 37.7749, lng: -122.4194 }} />
            </Map>
          </APIProvider>
        ) : (
          <div className="map-panel__placeholder">
            <MapIcon />
            <span>Google Maps API 키를 설정하면<br />지도가 표시됩니다</span>
          </div>
        )}
      </div>
      <div className="map-panel__footer">
        <div className="map-panel__loc">
          <span className="map-panel__loc-label">위치 ID</span>
          <input
            type="number"
            className="map-panel__loc-input"
            value={locId}
            min={1}
            onChange={(e) => onLocChange(Number(e.target.value))}
          />
        </div>
        <span className="map-panel__hint">San Francisco</span>
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
