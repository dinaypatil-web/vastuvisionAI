
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { GeoPoint, TaggedRoom, Floor, VastuReport, RoomType, IndianLanguage } from './types';
import { ROOM_TYPES, INDIAN_LANGUAGES } from './constants';
import { analyzeVastu, searchLocation } from './services/gemini';
import { 
  CameraIcon, 
  MapPinIcon, 
  CompassIcon, 
  ChevronRightIcon, 
  RotateCcwIcon,
  AlertTriangle,
  Loader2,
  Undo2,
  Download,
  Plus,
  Minus,
  Move,
  Layers,
  Search,
  MousePointer2,
  Crosshair,
  Target,
  Maximize2,
  Minimize2,
  Info,
  ArrowRight
} from 'lucide-react';

// Leaflet Imports
import * as L from 'leaflet';
import { MapContainer, TileLayer, Marker, Polyline, Polygon, useMap, useMapEvents } from 'react-leaflet';

// Dynamic imports for PDF libraries
const getPDFLibs = async () => {
  const [html2canvas, { jsPDF }] = await Promise.all([
    import('html2canvas' as any),
    import('jspdf' as any)
  ]);
  return { html2canvas: html2canvas.default, jsPDF };
};

const getDirection = (heading: number): string => {
  const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return directions[Math.round(heading / 45) % 8];
};

/**
 * Map Controller to handle centering and clicks
 */
const MapEvents = ({ onMapClick, targetLocation }: { 
  onMapClick: (lat: number, lng: number) => void,
  targetLocation: { lat: number, lng: number } | null 
}) => {
  const map = useMap();
  
  useEffect(() => {
    if (targetLocation) {
      map.flyTo([targetLocation.lat, targetLocation.lng], 19, {
        duration: 1.5
      });
    }
  }, [targetLocation, map]);

  useMapEvents({
    click(e) {
      onMapClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
};

/**
 * Desktop Map Component
 */
const DesktopMap = ({ 
  floor, 
  onMapClick, 
  targetLocation,
  updatePointPosition
}: { 
  floor: Floor, 
  onMapClick: (lat: number, lng: number) => void,
  targetLocation: { lat: number, lng: number } | null,
  updatePointPosition: (type: 'corner' | 'room', index: number, lat: number, lng: number) => void
}) => {
  const center: [number, number] = targetLocation ? [targetLocation.lat, targetLocation.lng] : [20.5937, 78.9629];
  const cornerCoords = floor.corners.map(c => [c.lat, c.lng] as [number, number]);
  
  return (
    <MapContainer 
      center={center} 
      zoom={19} 
      scrollWheelZoom={true} 
      className="w-full h-full"
      zoomControl={false}
      attributionControl={false}
    >
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
      />
      
      <MapEvents onMapClick={onMapClick} targetLocation={targetLocation} />

      {/* Boundary Polygon */}
      {cornerCoords.length >= 3 && (
        <Polygon 
          positions={cornerCoords} 
          pathOptions={{ 
            color: '#6366f1', 
            fillColor: '#6366f1', 
            fillOpacity: 0.15, 
            weight: 3,
            lineJoin: 'round'
          }} 
        />
      )}

      {/* Perimeter Line */}
      {cornerCoords.length > 1 && cornerCoords.length < 3 && (
        <Polyline 
          positions={cornerCoords} 
          pathOptions={{ color: '#6366f1', weight: 3, dashArray: '8, 8' }} 
        />
      )}

      {/* Corner Markers - Draggable for exact positioning */}
      {floor.corners.map((c, i) => (
        <Marker 
          key={`c-${i}`} 
          position={[c.lat, c.lng]} 
          draggable={true}
          eventHandlers={{
            dragend: (e) => {
              const marker = e.target;
              const position = marker.getLatLng();
              updatePointPosition('corner', i, position.lat, position.lng);
            },
          }}
          icon={L.divIcon({
            className: 'custom-div-icon',
            html: `<div class="w-5 h-5 bg-indigo-500 rounded-full border-2 border-white shadow-[0_0_15px_rgba(99,102,241,1)] flex items-center justify-center text-[10px] font-black text-white cursor-move">${i+1}</div>`,
            iconSize: [20, 20],
            iconAnchor: [10, 10]
          })}
        />
      ))}

      {/* Room Markers - Draggable for exact positioning */}
      {floor.rooms.map((r, i) => (
        <Marker 
          key={`r-${i}`} 
          position={[r.point.lat, r.point.lng]} 
          draggable={true}
          eventHandlers={{
            dragend: (e) => {
              const marker = e.target;
              const position = marker.getLatLng();
              updatePointPosition('room', i, position.lat, position.lng);
            },
          }}
          icon={L.divIcon({
            className: 'custom-div-icon',
            html: `<div class="p-2 bg-emerald-500 rounded-xl border border-white shadow-2xl flex items-center gap-2 whitespace-nowrap cursor-move hover:scale-105 transition-transform">
                    <div class="w-2.5 h-2.5 bg-white rounded-full animate-pulse"></div>
                    <span class="text-[10px] font-black text-white uppercase tracking-tighter">${r.type}</span>
                  </div>`,
            iconAnchor: [20, 20]
          })}
        />
      ))}
    </MapContainer>
  );
};

export default function App() {
  const [step, setStep] = useState<'welcome' | 'map-corners' | 'tag-rooms' | 'analyzing' | 'report'>('welcome');
  const [floors, setFloors] = useState<Floor[]>([{ id: 'f1', level: 0, name: 'Ground Floor', corners: [], rooms: [] }]);
  const [activeFloorIdx, setActiveFloorIdx] = useState(0);
  const [report, setReport] = useState<VastuReport | null>(null);
  const [heading, setHeading] = useState<number>(0);
  const [location, setLocation] = useState<{ lat: number, lng: number, accuracy: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedRoomType, setSelectedRoomType] = useState<RoomType>('Main Entrance');
  const [language, setLanguage] = useState<IndianLanguage>('English');
  const [isInitializing, setIsInitializing] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [isMapReady, setIsMapReady] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const reportRef = useRef<HTMLDivElement>(null);

  const activeFloor = floors[activeFloorIdx];

  useEffect(() => {
    const checkDesktop = () => setIsDesktop(window.innerWidth > 1024);
    checkDesktop();
    window.addEventListener('resize', checkDesktop);

    const geoId = navigator.geolocation.watchPosition(
      (pos) => setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }),
      (err) => console.warn("GPS tracking unavailable. Using map search."),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 5000 }
    );

    const handleOrientation = (e: DeviceOrientationEvent) => {
      let compass = (e as any).webkitCompassHeading || (360 - (e.alpha || 0));
      if (isNaN(compass)) compass = 0;
      setHeading(Math.round(compass));
    };

    const win = window as any;
    if ('ondeviceorientationabsolute' in win) {
      win.addEventListener('deviceorientationabsolute', handleOrientation);
    } else {
      win.addEventListener('deviceorientation', handleOrientation);
    }

    return () => {
      window.removeEventListener('resize', checkDesktop);
      navigator.geolocation.clearWatch(geoId);
      win.removeEventListener('deviceorientationabsolute', handleOrientation);
      win.removeEventListener('deviceorientation', handleOrientation);
    };
  }, []);

  const requestPermission = async () => {
    setIsInitializing(true);
    const DeviceEvent = (window as any).DeviceOrientationEvent;
    try {
      if (DeviceEvent && typeof DeviceEvent.requestPermission === 'function') {
        await DeviceEvent.requestPermission();
      }
      if (!isDesktop) await startCamera();
      setStep('map-corners');
      if (isDesktop) setTimeout(() => setIsMapReady(true), 1000);
    } catch (e) {
      if (!isDesktop) await startCamera();
      setStep('map-corners');
      if (isDesktop) setTimeout(() => setIsMapReady(true), 1000);
    } finally {
      setIsInitializing(false);
    }
  };

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment' },
        audio: false 
      });
      if (videoRef.current) videoRef.current.srcObject = stream;
    } catch (err) {
      console.warn("Camera failed. Switching to map mode.");
    }
  };

  const markPoint = useCallback((customLat?: number, customLng?: number) => {
    const lat = customLat ?? location?.lat;
    const lng = customLng ?? location?.lng;

    if (lat === undefined || lng === undefined) {
      setError("Please search for a location or click on the map to mark a point.");
      return;
    }

    const newPoint: GeoPoint = {
      lat,
      lng,
      heading: heading,
      timestamp: Date.now()
    };
    
    setFloors(prev => {
      const newFloors = [...prev];
      const floor = { ...newFloors[activeFloorIdx] };
      if (step === 'map-corners') {
        floor.corners = [...floor.corners, newPoint];
      } else if (step === 'tag-rooms') {
        const newRoom: TaggedRoom = {
          id: Math.random().toString(36).substr(2, 9),
          type: selectedRoomType,
          point: newPoint
        };
        floor.rooms = [...floor.rooms, newRoom];
      }
      newFloors[activeFloorIdx] = floor;
      return newFloors;
    });
  }, [location, heading, activeFloorIdx, step, selectedRoomType]);

  const updatePointPosition = (type: 'corner' | 'room', index: number, lat: number, lng: number) => {
    setFloors(prev => {
      const newFloors = [...prev];
      const floor = { ...newFloors[activeFloorIdx] };
      if (type === 'corner') {
        floor.corners[index] = { ...floor.corners[index], lat, lng };
      } else {
        floor.rooms[index] = { ...floor.rooms[index], point: { ...floor.rooms[index].point, lat, lng } };
      }
      newFloors[activeFloorIdx] = floor;
      return newFloors;
    });
  };

  const removeLast = () => {
    setFloors(prev => {
      const newFloors = [...prev];
      const floor = { ...newFloors[activeFloorIdx] };
      if (step === 'map-corners') floor.corners = floor.corners.slice(0, -1);
      else if (step === 'tag-rooms') floor.rooms = floor.rooms.slice(0, -1);
      newFloors[activeFloorIdx] = floor;
      return newFloors;
    });
  };

  const addNewFloor = () => {
    const nextIdx = floors.length;
    const newFloor: Floor = {
      id: Math.random().toString(36).substring(2, 9),
      level: nextIdx,
      name: `Floor ${nextIdx + 1}`,
      corners: [],
      rooms: []
    };
    setFloors(prev => [...prev, newFloor]);
    setActiveFloorIdx(nextIdx);
    setStep('map-corners');
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery) return;
    setIsSearching(true);
    try {
      const result = await searchLocation(searchQuery);
      if (result) {
        setLocation({ lat: result.lat, lng: result.lng, accuracy: 1 });
        setSearchQuery(result.address);
      } else {
        setError("Could not find that location. Please be more specific.");
      }
    } catch (err) {
      setError("Search failed. Please check your connection.");
    } finally {
      setIsSearching(false);
    }
  };

  const handleAnalyze = async () => {
    if (floors.some(f => f.corners.length < 3)) {
      setError("Every floor must have a complete boundary (at least 3 corners).");
      return;
    }
    setStep('analyzing');
    try {
      const result = await analyzeVastu(floors, language, location ? { lat: location.lat, lng: location.lng } : undefined);
      setReport(result);
      setStep('report');
    } catch (err: any) {
      setError("AI analysis failed. Please try again with clearer marker placements.");
      setStep('tag-rooms');
    }
  };

  const handleDownloadPDF = async () => {
    if (!reportRef.current) return;
    setIsDownloading(true);
    try {
      const { html2canvas, jsPDF } = await getPDFLibs();
      const canvas = await html2canvas(reportRef.current, { scale: 2, useCORS: true, backgroundColor: '#0f172a' });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`VastuVision_Report.pdf`);
    } catch (err) {
      setError("Failed to generate PDF. Please try again.");
    } finally {
      setIsDownloading(false);
    }
  };

  const reset = () => {
    setFloors([{ id: 'f1', level: 0, name: 'Ground Floor', corners: [], rooms: [] }]);
    setActiveFloorIdx(0);
    setReport(null);
    setStep('welcome');
    setError(null);
    setIsMapReady(false);
  };

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-black touch-none">
      {!isDesktop && (
        <>
          <video ref={videoRef} autoPlay playsInline muted className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-700 ${step !== 'map-corners' && step !== 'tag-rooms' ? 'opacity-0' : 'opacity-100'}`} />
          <div className={`absolute inset-0 bg-black/60 transition-opacity duration-700 ${step !== 'map-corners' && step !== 'tag-rooms' ? 'opacity-0' : 'opacity-100'}`} />
        </>
      )}

      {/* Welcome */}
      {step === 'welcome' && (
        <div className="absolute inset-0 z-50 bg-slate-950 flex flex-col items-center justify-center p-8 text-center space-y-8">
          <div className="p-8 bg-indigo-600 rounded-[3rem] shadow-2xl animate-bounce ring-8 ring-indigo-500/10">
            <Layers size={80} className="text-white" />
          </div>
          <div className="space-y-4">
            <h1 className="text-7xl font-black tracking-tighter text-white uppercase italic drop-shadow-2xl">VastuVision</h1>
            <p className="text-slate-500 text-sm font-bold uppercase tracking-[0.4em]">{isDesktop ? 'Architectural Map Modeler' : 'AR Spatial Surveyor'}</p>
          </div>
          <div className="w-full max-w-xs space-y-4">
            <select 
              value={language}
              onChange={(e) => setLanguage(e.target.value as IndianLanguage)}
              className="w-full bg-slate-900 border border-white/10 text-white p-5 rounded-3xl font-black text-xs uppercase cursor-pointer hover:bg-slate-800 transition-colors"
            >
              {INDIAN_LANGUAGES.map(lang => <option key={lang} value={lang}>{lang}</option>)}
            </select>
            <button 
              onClick={requestPermission} disabled={isInitializing}
              className="w-full py-6 bg-indigo-500 hover:bg-indigo-400 text-white rounded-3xl font-black text-sm uppercase tracking-widest shadow-2xl transition-all hover:scale-105 active:scale-95"
            >
              {isInitializing ? <Loader2 className="animate-spin mx-auto" /> : 'Begin Mapping'}
            </button>
            <p className="text-[10px] text-slate-600 font-bold uppercase tracking-widest mt-4">Precision Vastu Auditing Platform</p>
          </div>
        </div>
      )}

      {/* Analyzing UI */}
      {step === 'analyzing' && (
        <div className="absolute inset-0 z-50 bg-slate-950 flex flex-col items-center justify-center text-white p-12 text-center">
          <div className="relative mb-12">
             <div className="absolute inset-0 animate-ping bg-indigo-500/20 rounded-full" />
             <Loader2 size={100} className="animate-spin text-indigo-500 relative z-10" />
          </div>
          <h2 className="text-5xl font-black uppercase italic tracking-tighter mb-4">Processing Geometry</h2>
          <p className="text-slate-500 text-sm font-bold uppercase tracking-[0.3em]">Cross-referencing with architectural scriptures...</p>
        </div>
      )}

      {/* Report View */}
      {step === 'report' && report && (
        <div className="absolute inset-0 z-50 bg-slate-950 text-white flex flex-col h-full overflow-hidden">
          <header className="glass p-6 border-b border-white/5 flex justify-between items-center z-10">
            <button onClick={reset} className="p-3 bg-white/5 rounded-2xl hover:bg-white/10 transition-colors" title="Start Over"><RotateCcwIcon size={20}/></button>
            <div className="text-center">
              <h2 className="text-[10px] font-black uppercase tracking-[0.5em] text-indigo-400 mb-1">Architectural Audit</h2>
              <div className="font-black text-lg uppercase italic tracking-tighter">Vastu Compliance Result</div>
            </div>
            <button onClick={handleDownloadPDF} disabled={isDownloading} className="p-4 bg-indigo-500 rounded-2xl shadow-xl hover:bg-indigo-400 transition-colors disabled:opacity-50">
              {isDownloading ? <Loader2 size={24} className="animate-spin" /> : <Download size={24} />}
            </button>
          </header>
          
          <main ref={reportRef} className="flex-1 overflow-y-auto p-8 lg:p-12 space-y-12 pb-32 no-scrollbar max-w-6xl mx-auto w-full">
            <div className="glass p-16 rounded-[4rem] text-center relative overflow-hidden border-indigo-500/20 shadow-2xl bg-gradient-to-br from-indigo-500/5 to-transparent">
              <div className="text-[10rem] font-black bg-gradient-to-b from-white to-slate-600 bg-clip-text text-transparent leading-none tracking-tighter">{Number(report.overallScore)}%</div>
              <div className="text-xs uppercase tracking-[0.6em] text-slate-500 font-black mt-8">Holistic Compliance Score</div>
              <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-indigo-500 via-emerald-500 to-indigo-500" />
            </div>

            <section className="glass p-12 rounded-[3.5rem] border-l-8 border-indigo-500 shadow-2xl relative overflow-hidden">
               <div className="absolute top-0 right-0 p-8 opacity-5">
                  <Layers size={120} />
               </div>
              <h3 className="text-xs font-black text-indigo-400 uppercase tracking-widest mb-6">Expert Summary</h3>
              <p className="text-slate-200 italic text-2xl leading-relaxed font-medium relative z-10">"{String(report.summary)}"</p>
            </section>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {report.roomAnalysis.map((item, idx) => (
                <div key={idx} className="glass p-8 rounded-[3rem] border border-white/5 hover:border-indigo-500/20 transition-all flex flex-col shadow-xl group">
                  <div className="flex justify-between items-start mb-6">
                    <div className="flex flex-col">
                      <span className="text-[10px] font-black text-indigo-500 uppercase tracking-widest mb-2">{String(item.floorName || 'Structure')}</span>
                      <h4 className="font-black text-slate-100 uppercase text-xl italic tracking-tight group-hover:text-indigo-300 transition-colors">{String(item.roomType)}</h4>
                    </div>
                    <div className={`text-[10px] px-4 py-2 rounded-full font-black uppercase tracking-widest shadow-inner ${
                      item.status === 'Good' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 
                      item.status === 'Fair' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' : 
                      'bg-red-500/10 text-red-400 border border-red-500/20'
                    }`}>
                      {String(item.status)}
                    </div>
                  </div>
                  <p className="text-slate-400 text-sm leading-relaxed mb-8 font-medium">{String(item.observation)}</p>
                  {item.remedy && (
                    <div className="mt-auto p-6 bg-indigo-500/5 rounded-3xl border border-indigo-500/10 text-xs text-slate-300 italic leading-relaxed">
                      <span className="text-indigo-400 mr-2 font-black not-italic uppercase tracking-wider">Corrective Action:</span>{String(item.remedy)}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <section className="glass p-12 rounded-[4rem] bg-indigo-500/5 border border-white/5 relative overflow-hidden">
              <div className="flex items-center gap-6 mb-10">
                 <div className="w-12 h-12 bg-indigo-500 rounded-2xl flex items-center justify-center text-white shadow-lg">
                    <Target size={24} />
                 </div>
                 <h3 className="text-lg font-black text-white uppercase tracking-[0.3em] italic">Vastu Enhancements</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {(report.generalRemedies || []).map((tip, idx) => (
                  <div key={idx} className="flex gap-6 items-center p-6 bg-black/30 rounded-[2.5rem] border border-white/5 hover:border-white/10 transition-colors">
                    <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center font-black text-sm shrink-0 shadow-inner border border-indigo-500/10">{idx + 1}</div>
                    <p className="text-slate-300 text-sm font-bold uppercase tracking-tight leading-snug">{String(tip)}</p>
                  </div>
                ))}
              </div>
            </section>
          </main>
        </div>
      )}

      {/* Mapping UI */}
      {(step === 'map-corners' || step === 'tag-rooms') && (
        <div className={`h-full w-full flex ${isDesktop ? 'flex-row' : 'flex-col'}`}>
          <div className="relative flex-1 bg-slate-900 overflow-hidden group">
            {isDesktop ? (
              <>
                {!isMapReady && (
                  <div className="absolute inset-0 z-[1001] bg-slate-950 flex flex-col items-center justify-center space-y-4">
                    <Loader2 size={48} className="animate-spin text-indigo-500" />
                    <p className="text-slate-500 font-black text-[10px] uppercase tracking-[0.3em] animate-pulse">Initializing Map Engine...</p>
                  </div>
                )}
                <DesktopMap 
                  floor={activeFloor} 
                  onMapClick={markPoint} 
                  targetLocation={location} 
                  updatePointPosition={updatePointPosition}
                />
              </>
            ) : (
              <div className="w-full h-full relative">
                <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-60">
                  <div className="w-72 h-72 border-4 border-dashed border-yellow-400/40 rounded-full flex items-center justify-center">
                    <Crosshair size={48} className="text-yellow-400 stroke-[3]" />
                    <div className="absolute w-2 h-2 bg-yellow-400 rounded-full shadow-[0_0_20px_rgba(250,204,21,1)]"></div>
                  </div>
                </div>
              </div>
            )}

            {isDesktop && (
              <div className="absolute top-10 left-1/2 -translate-x-1/2 z-[1000] w-full max-w-2xl px-8 pointer-events-none">
                <form onSubmit={handleSearch} className="glass p-3 rounded-[3rem] border-white/10 shadow-[0_30px_60px_rgba(0,0,0,0.5)] flex gap-4 pointer-events-auto backdrop-blur-[40px]">
                  <div className="relative flex-1 group">
                    <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-indigo-400 transition-colors" size={24} />
                    <input 
                      type="text" 
                      placeholder="Locate house by address or area..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full bg-white/5 border-none text-white pl-16 pr-8 py-5 rounded-[2rem] outline-none font-black text-[11px] uppercase tracking-wider placeholder:text-slate-600 focus:bg-white/10 transition-all"
                    />
                  </div>
                  <button 
                    type="submit" 
                    disabled={isSearching}
                    className="bg-indigo-600 hover:bg-indigo-500 text-white px-12 rounded-[2rem] font-black text-[11px] uppercase tracking-widest transition-all shadow-xl disabled:opacity-50 active:scale-95 flex items-center gap-3"
                  >
                    {isSearching ? <Loader2 className="animate-spin" size={18} /> : <><span>Load Map</span><ArrowRight size={18} /></>}
                  </button>
                </form>
              </div>
            )}

            <div className="absolute top-10 right-10 z-[1000] flex flex-col items-end gap-6 pointer-events-none">
              <div className="glass p-8 rounded-[4rem] border-white/10 flex flex-col items-center shadow-2xl backdrop-blur-3xl group">
                <div className="relative w-24 h-24 flex items-center justify-center mb-5">
                  <div className="absolute inset-0 border-2 border-white/5 rounded-full" />
                  <CompassIcon size={64} className="text-indigo-400 group-hover:scale-110 transition-transform duration-500" style={{ transform: `rotate(${heading}deg)` }} />
                  <div className="absolute -top-1 w-2.5 h-5 bg-red-600 rounded-full shadow-[0_0_20px_red]" />
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 bg-white rounded-full" />
                </div>
                <div className="text-center">
                  <div className="text-white font-black text-lg tracking-tighter">{heading}° {getDirection(heading)}</div>
                  <div className="text-slate-500 text-[9px] font-black uppercase tracking-[0.3em] mt-1">{isDesktop ? 'ORIENTATION' : 'DEVICE HEADING'}</div>
                </div>
              </div>

              {isDesktop && (
                <div className="flex flex-col gap-3 pointer-events-auto">
                   <button 
                    onClick={() => setLocation(prev => prev ? { ...prev } : null)} 
                    className="p-5 bg-white/5 hover:bg-white/10 rounded-3xl border border-white/10 text-white transition-all shadow-xl active:scale-90"
                    title="Recenter Map"
                   >
                     <Target size={24} />
                   </button>
                </div>
              )}
            </div>
          </div>

          <div className={`${isDesktop ? 'w-[500px] border-l border-white/10' : 'h-[360px] border-t border-white/10'} glass bg-slate-950/95 z-[2000] p-10 flex flex-col gap-8 backdrop-blur-[50px] shadow-[-20px_0_60px_rgba(0,0,0,0.5)]`}>
            <div className="flex justify-between items-start">
              <div className="space-y-2">
                <h3 className="text-white font-black text-3xl uppercase italic tracking-tighter leading-none">
                  {step === 'map-corners' ? 'Exterior Boundary' : 'Interior Layout'}
                </h3>
                <div className="flex items-center gap-3">
                   <p className="text-slate-500 font-bold text-[11px] uppercase tracking-[0.3em]">
                    {String(activeFloor.name).toUpperCase()}
                   </p>
                   {location && (
                     <div className="flex items-center gap-1.5 text-indigo-500/50 text-[9px] font-black uppercase tracking-widest">
                       <MapPinIcon size={10} />
                       GPS Linked
                     </div>
                   )}
                </div>
              </div>
              <div className="px-6 py-3 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 font-black text-[11px] uppercase tracking-widest shadow-inner">
                {step === 'map-corners' ? activeFloor.corners.length : activeFloor.rooms.length} POINTS
              </div>
            </div>

            <div className="flex gap-3 overflow-x-auto no-scrollbar py-2">
              {floors.map((f, idx) => (
                <button
                  key={f.id}
                  onClick={() => setActiveFloorIdx(idx)}
                  className={`px-8 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest border transition-all relative overflow-hidden group ${
                    activeFloorIdx === idx ? 'bg-indigo-600 border-indigo-400 text-white shadow-xl' : 'bg-slate-900 border-white/5 text-slate-500 hover:text-slate-400'
                  }`}
                >
                  {String(f.name)}
                  {activeFloorIdx === idx && <div className="absolute bottom-0 left-0 w-full h-1 bg-white/20" />}
                </button>
              ))}
              <button 
                onClick={addNewFloor}
                className="px-8 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest border border-dashed border-indigo-500/30 text-indigo-400 hover:bg-indigo-500/5 transition-all flex items-center gap-2"
              >
                <Plus size={14} /> New Floor
              </button>
            </div>

            {step === 'tag-rooms' && (
              <div className="flex gap-3 overflow-x-auto no-scrollbar py-2">
                {ROOM_TYPES.map(type => (
                  <button
                    key={type}
                    onClick={() => setSelectedRoomType(type)}
                    className={`whitespace-nowrap px-8 py-5 rounded-[2rem] text-[11px] font-black border uppercase tracking-widest transition-all ${
                      selectedRoomType === type ? 'bg-emerald-500 border-emerald-400 text-white shadow-[0_15px_30px_rgba(16,185,129,0.4)] scale-105' : 'bg-white/5 border-white/5 text-slate-500 hover:border-white/20'
                    }`}
                  >
                    {String(type)}
                  </button>
                ))}
              </div>
            )}

            <div className="mt-auto space-y-6">
              <div className="flex gap-5">
                {!isDesktop && (
                  <button 
                    onClick={() => markPoint()}
                    className={`flex-1 py-7 rounded-[2rem] font-black text-[12px] uppercase tracking-[0.3em] flex items-center justify-center gap-5 transition-all shadow-2xl active:scale-95 ${
                      step === 'map-corners' ? 'bg-white text-black' : 'bg-emerald-500 text-white'
                    }`}
                  >
                    <CameraIcon size={24} />
                    <span>Plot Node</span>
                  </button>
                )}

                {(activeFloor.corners.length > 0 || activeFloor.rooms.length > 0) && (
                  <button 
                    onClick={removeLast} 
                    className="px-10 bg-slate-900 text-white rounded-[2rem] border border-white/10 active:scale-90 hover:bg-slate-800 transition-all shadow-xl group"
                    title="Undo Last"
                  >
                    <Undo2 size={28} className="group-hover:-rotate-45 transition-transform" />
                  </button>
                )}

                {step === 'map-corners' && activeFloor.corners.length >= 3 && (
                  <button 
                    onClick={() => setStep('tag-rooms')}
                    className="flex-1 px-12 bg-indigo-600 hover:bg-indigo-500 text-white rounded-[2rem] font-black text-[12px] uppercase tracking-widest flex items-center justify-center gap-4 transition-all shadow-2xl active:scale-95"
                  >
                    Define Interiors <ChevronRightIcon size={28} />
                  </button>
                )}

                {step === 'tag-rooms' && activeFloor.rooms.length >= 1 && (
                  <button 
                    onClick={handleAnalyze}
                    className="flex-1 px-12 bg-white hover:bg-slate-100 text-black rounded-[2rem] font-black text-[12px] uppercase tracking-widest transition-all shadow-[0_20px_40px_rgba(255,255,255,0.1)] active:scale-95"
                  >
                    Finalize Audit
                  </button>
                )}
              </div>
              <div className="flex justify-between items-center px-4">
                 <div className="flex items-center gap-3 text-[10px] font-black text-slate-600 uppercase tracking-widest">
                    <Info size={14} />
                    {isDesktop ? 'Click map or drag nodes' : 'Align reticle and tap plot'}
                 </div>
                 <button onClick={reset} className="text-[10px] font-black text-red-500/50 hover:text-red-500 uppercase tracking-widest transition-colors">Abort Survey</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="absolute top-40 left-1/2 -translate-x-1/2 z-[4000] w-full max-w-xl px-10 animate-in fade-in slide-in-from-top-20 duration-500">
          <div className="bg-red-600 text-white p-8 rounded-[3rem] flex items-center justify-between shadow-[0_40px_80px_rgba(220,38,38,0.4)] border border-red-500 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-white/20" />
            <div className="flex items-center gap-6 font-black text-[11px] uppercase tracking-widest">
              <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center shrink-0">
                <AlertTriangle size={28} />
              </div>
              <span>{String(error)}</span>
            </div>
            <button 
              onClick={() => setError(null)} 
              className="w-10 h-10 rounded-full hover:bg-white/20 flex items-center justify-center font-black text-2xl transition-colors"
            >
              ×
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
