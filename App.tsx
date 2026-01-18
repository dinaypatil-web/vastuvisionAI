
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { GeoPoint, TaggedRoom, Floor, VastuReport, RoomType, IndianLanguage } from './types';
import { ROOM_TYPES, INDIAN_LANGUAGES } from './constants';
import { analyzeVastu, searchLocation } from './services/gemini';
import { 
  CameraIcon, 
  MapPinIcon, 
  CompassIcon, 
  CheckCircleIcon, 
  ChevronRightIcon, 
  RotateCcwIcon,
  HomeIcon, 
  AlertTriangle,
  Info,
  Loader2,
  Globe,
  Undo2,
  Maximize2,
  Minimize2,
  HelpCircle,
  Download,
  Plus,
  Minus,
  Move,
  Layers,
  ArrowRight,
  Search,
  MousePointer2
} from 'lucide-react';

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
 * Enhanced Virtual Map Component
 * Supports interactive clicking for manual placement (Desktop Mode).
 */
const VirtualMap = ({ 
  floor,
  heading, 
  isExpanded,
  zoomLevel = 1,
  pan = { x: 0, y: 0 },
  onMapClick,
  isDesktop
}: { 
  floor: Floor,
  heading: number,
  isExpanded: boolean,
  zoomLevel?: number,
  pan?: { x: number, y: number },
  onMapClick?: (lat: number, lng: number) => void,
  isDesktop: boolean
}) => {
  const { corners, rooms } = floor;
  const svgRef = useRef<SVGSVGElement>(null);

  const bounds = useMemo(() => {
    if (corners.length === 0 && rooms.length === 0) return null;
    const allPoints = [...corners, ...rooms.map(r => r.point)];
    const lats = allPoints.map(p => p.lat);
    const lngs = allPoints.map(p => p.lng);
    return {
      minLat: Math.min(...lats),
      maxLat: Math.max(...lats),
      minLng: Math.min(...lngs),
      maxLng: Math.max(...lngs)
    };
  }, [corners, rooms]);

  const basePadding = 0.00008; 
  const viewSize = 200;

  // Use current location or bounds
  const currentBounds = bounds || {
    minLat: 0, maxLat: 0, minLng: 0, maxLng: 0
  };

  const width = Math.max((currentBounds.maxLng - currentBounds.minLng), 0.0001) + basePadding * 2;
  const height = Math.max((currentBounds.maxLat - currentBounds.minLat), 0.0001) + basePadding * 2;
  const scale = Math.min(viewSize / width, viewSize / height) * zoomLevel;

  const getX = (lng: number) => (lng - (currentBounds.minLng - basePadding)) * scale + pan.x;
  const getY = (lat: number) => viewSize - ((lat - (currentBounds.minLat - basePadding)) * scale) + pan.y;

  const handleSvgClick = (e: React.MouseEvent) => {
    if (!onMapClick || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * viewSize;
    const y = ((e.clientY - rect.top) / rect.height) * viewSize;

    // Inverse projection to get Lat/Lng
    // Note: This is approximate for a 2D line diagram representation
    const lng = (x - pan.x) / scale + (currentBounds.minLng - basePadding);
    const lat = (viewSize - y + pan.y) / scale + (currentBounds.minLat - basePadding);
    onMapClick(lat, lng);
  };

  const lineThickness = Math.max(3 / zoomLevel, 1.5);
  const nodeRadius = Math.max(5 / zoomLevel, 3);
  const roomBoxSize = Math.max(12 / zoomLevel, 8);

  return (
    <svg 
      ref={svgRef}
      width="100%" height="100%" 
      viewBox={`0 0 ${viewSize} ${viewSize}`} 
      className={`overflow-hidden touch-none bg-slate-950/90 ${isDesktop ? 'cursor-crosshair' : ''}`}
      onClick={isDesktop ? handleSvgClick : undefined}
    >
      <defs>
        <pattern id="blueprint-grid" width="20" height="20" patternUnits="userSpaceOnUse">
          <path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(99, 102, 241, 0.2)" strokeWidth="0.5"/>
        </pattern>
        <filter id="node-glow">
          <feGaussianBlur stdDeviation="1.5" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>
      <rect width="100%" height="100%" fill="url(#blueprint-grid)" />

      {corners.length > 1 && (
        <polyline
          points={corners.map(c => `${getX(c.lng)},${getY(c.lat)}`).join(' ')}
          fill="rgba(99, 102, 241, 0.1)"
          stroke="rgba(99, 102, 241, 1)"
          strokeWidth={lineThickness}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={corners.length < 3 ? "4,4" : "0"}
          className="transition-all duration-300"
        />
      )}
      {corners.length > 2 && (
        <line 
          x1={getX(corners[corners.length-1].lng)} 
          y1={getY(corners[corners.length-1].lat)} 
          x2={getX(corners[0].lng)} 
          y2={getY(corners[0].lat)} 
          stroke="rgba(99, 102, 241, 1)" 
          strokeWidth={lineThickness}
          strokeLinecap="round"
        />
      )}

      {corners.map((c, i) => (
        <g key={`c-${i}`}>
          <circle 
            cx={getX(c.lng)} cy={getY(c.lat)} 
            r={nodeRadius} 
            fill="#6366f1" 
            filter="url(#node-glow)"
            stroke="white"
            strokeWidth={1 / zoomLevel}
          />
          {isExpanded && (
            <text 
              x={getX(c.lng)} y={getY(c.lat) - nodeRadius - 5} 
              fontSize={9 / zoomLevel} fill="#a5b4fc" 
              textAnchor="middle" className="font-mono font-black select-none pointer-events-none"
              style={{ filter: 'drop-shadow(0 1px 2px black)' }}
            >
              V{i+1}
            </text>
          )}
        </g>
      ))}

      {rooms.map((r, i) => (
        <g key={`r-${i}`}>
          <rect 
            x={getX(r.point.lng) - roomBoxSize / 2} 
            y={getY(r.point.lat) - roomBoxSize / 2} 
            width={roomBoxSize} 
            height={roomBoxSize} 
            fill="#10b981" 
            stroke="white"
            strokeWidth={1.5 / zoomLevel}
            filter="url(#node-glow)"
            transform={`rotate(${r.point.heading}, ${getX(r.point.lng)}, ${getY(r.point.lat)})`} 
          />
          {isExpanded && (
            <text 
              x={getX(r.point.lng)} y={getY(r.point.lat) + roomBoxSize + 3} 
              fontSize={8 / zoomLevel} fill="white" 
              textAnchor="middle" className="font-bold select-none pointer-events-none uppercase"
              style={{ filter: 'drop-shadow(0 1px 2px black)' }}
            >
              {r.type.split(' ')[0]}
            </text>
          )}
        </g>
      ))}
      
      {corners.length > 0 && (
        <g transform={`translate(${getX(corners[corners.length-1].lng)}, ${getY(corners[corners.length-1].lat)}) rotate(${heading})`}>
          <path d="M 0 -14 L 7 0 L -7 0 Z" fill="#ef4444" stroke="white" strokeWidth={1} />
        </g>
      )}

      {!bounds && (
        <text x="100" y="100" textAnchor="middle" fill="#475569" fontSize="8" className="font-black italic">
          {isDesktop ? 'CLICK TO PLACE FIRST CORNER' : 'GPS POSITIONING...'}
        </text>
      )}
    </svg>
  );
};

export default function App() {
  const [step, setStep] = useState<'welcome' | 'map-corners' | 'tag-rooms' | 'analyzing' | 'report'>('welcome');
  const [floors, setFloors] = useState<Floor[]>([{ id: 'f1', level: 0, name: 'Ground Floor', corners: [], rooms: [] }]);
  const [activeFloorIdx, setActiveFloorIdx] = useState(0);
  const [report, setReport] = useState<VastuReport | null>(null);
  const [heading, setHeading] = useState<number>(0);
  const [location, setLocation] = useState<GeolocationCoordinates | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedRoomType, setSelectedRoomType] = useState<RoomType>('Main Entrance');
  const [language, setLanguage] = useState<IndianLanguage>('English');
  const [showLargeMap, setShowLargeMap] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [mapZoom, setMapZoom] = useState(1);
  const [mapPan, setMapPan] = useState({ x: 0, y: 0 });
  const [isDesktop, setIsDesktop] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const reportRef = useRef<HTMLDivElement>(null);

  const activeFloor = floors[activeFloorIdx];

  useEffect(() => {
    // Detect desktop/large screen
    const checkDesktop = () => setIsDesktop(window.innerWidth > 1024);
    checkDesktop();
    window.addEventListener('resize', checkDesktop);

    const geoId = navigator.geolocation.watchPosition(
      (pos) => setLocation(pos.coords),
      (err) => console.warn("GPS lock delayed. Use Map Search for manual entry."),
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
      if (isDesktop) setShowLargeMap(true); // Default to large map on desktop
    } catch (e) {
      if (!isDesktop) await startCamera();
      setStep('map-corners');
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
      console.warn("Camera failed. Continuing in Map mode.");
    }
  };

  const markPoint = (customLat?: number, customLng?: number) => {
    const lat = customLat ?? location?.latitude;
    const lng = customLng ?? location?.longitude;

    if (lat === undefined || lng === undefined) {
      setError("No coordinate detected. Click on map or search address.");
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

  // Fix: Added missing addNewFloor function to support adding multiple floors to the architectural layout.
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
    setError(null);
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery) return;
    setIsSearching(true);
    try {
      const result = await searchLocation(searchQuery);
      if (result) {
        // Center map on searched location by resetting pan
        setMapPan({ x: 0, y: 0 });
        setMapZoom(2);
        // Force location update for manual tagging
        setLocation({
          latitude: result.lat,
          longitude: result.lng,
          accuracy: 1,
          altitude: null,
          altitudeAccuracy: null,
          heading: null,
          speed: null
        } as any);
        setSearchQuery(result.address);
      } else {
        setError("Location not found. Try more details.");
      }
    } catch (err) {
      setError("Search service unavailable.");
    } finally {
      setIsSearching(false);
    }
  };

  const handleAnalyze = async () => {
    if (floors.some(f => f.corners.length < 3)) {
      setError("Every floor needs a closed boundary (min 3 corners).");
      return;
    }
    setStep('analyzing');
    try {
      const result = await analyzeVastu(floors, language, location ? { lat: location.latitude, lng: location.longitude } : undefined);
      setReport(result);
      setStep('report');
    } catch (err: any) {
      setError("Vastu Engine busy. Please try again.");
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
      pdf.save(`Vastu_Report.pdf`);
    } catch (err) {
      setError("PDF Export failed.");
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
  };

  return (
    <div className={`relative h-screen w-screen overflow-hidden bg-black touch-none ${isDesktop ? 'desktop-mode' : ''}`}>
      {!isDesktop && (
        <>
          <video ref={videoRef} autoPlay playsInline muted className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-700 ${step !== 'map-corners' && step !== 'tag-rooms' ? 'opacity-0' : 'opacity-100'}`} />
          <div className={`absolute inset-0 bg-black/60 transition-opacity duration-700 ${step !== 'map-corners' && step !== 'tag-rooms' ? 'opacity-0' : 'opacity-100'}`} />
        </>
      )}

      {/* Welcome Screen */}
      {step === 'welcome' && (
        <div className="absolute inset-0 z-50 bg-slate-950 flex flex-col items-center justify-center p-8 text-center space-y-8">
          <div className="p-8 bg-indigo-600 rounded-[2.5rem] shadow-2xl animate-pulse ring-8 ring-indigo-500/10 transform rotate-3">
            <Layers size={72} className="text-white -rotate-3" />
          </div>
          <div className="space-y-3">
            <h1 className="text-5xl font-black tracking-tight text-white uppercase italic">VastuVision</h1>
            <p className="text-slate-500 text-lg max-w-md font-bold uppercase tracking-widest">{isDesktop ? 'Desktop Map Modeler' : 'Augmented Reality Surveyor'}</p>
          </div>
          <div className="w-full max-w-xs space-y-4">
            <div className="space-y-1 text-left">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-3">Primary Language</label>
              <select 
                value={language}
                onChange={(e) => setLanguage(e.target.value as IndianLanguage)}
                className="w-full bg-slate-900 border border-white/10 text-white p-4 rounded-3xl focus:ring-2 focus:ring-indigo-500 outline-none appearance-none font-bold"
              >
                {INDIAN_LANGUAGES.map(lang => <option key={lang} value={lang}>{lang}</option>)}
              </select>
            </div>
            <button 
              onClick={requestPermission} disabled={isInitializing}
              className="w-full py-5 bg-indigo-500 hover:bg-indigo-400 text-white rounded-3xl font-black text-sm uppercase tracking-widest shadow-2xl flex items-center justify-center space-x-3 disabled:opacity-50 transition-all hover:scale-105"
            >
              {isInitializing ? <Loader2 className="animate-spin" /> : <><span>Initialize Engine</span><ArrowRight size={20} /></>}
            </button>
            <p className="text-[10px] text-slate-600 font-bold uppercase tracking-wider">{isDesktop ? 'Interactive map search enabled' : 'GPS + Compass + Camera enabled'}</p>
          </div>
        </div>
      )}

      {/* Analysis Screen */}
      {step === 'analyzing' && (
        <div className="absolute inset-0 z-50 bg-slate-950 flex flex-col items-center justify-center text-white p-8">
          <div className="relative mb-8">
            <div className="absolute inset-0 animate-ping bg-indigo-500/20 rounded-full" />
            <Loader2 size={80} className="animate-spin text-indigo-500 relative z-10" />
          </div>
          <h2 className="text-3xl font-black uppercase tracking-widest italic">Analyzing Geometry</h2>
          <p className="text-slate-500 text-sm mt-3 font-bold tracking-widest uppercase">Cross-referencing with Vastu Shastra scriptures...</p>
        </div>
      )}

      {/* Report View */}
      {step === 'report' && report && (
        <div className="absolute inset-0 z-50 bg-slate-950 text-white flex flex-col h-full overflow-hidden">
          <header className="glass p-6 border-b border-white/5 flex justify-between items-center shrink-0">
            <button onClick={reset} className="p-3 bg-white/5 rounded-2xl hover:bg-white/10 transition-colors"><RotateCcwIcon size={20}/></button>
            <div className="text-center">
              <h2 className="text-[10px] font-black uppercase tracking-[0.4em] text-indigo-400">Architectural Audit</h2>
              <div className="font-black text-sm uppercase">Vastu Compliance Result</div>
            </div>
            <button onClick={handleDownloadPDF} disabled={isDownloading} className="p-3 bg-indigo-500 rounded-2xl shadow-xl disabled:opacity-50 hover:bg-indigo-400">
              {isDownloading ? <Loader2 size={20} className="animate-spin" /> : <Download size={20} />}
            </button>
          </header>
          
          <main ref={reportRef} className="flex-1 overflow-y-auto p-8 space-y-8 pb-32 no-scrollbar max-w-4xl mx-auto w-full">
            <div className="glass p-12 rounded-[3rem] text-center relative overflow-hidden border-indigo-500/20">
              <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-indigo-500 via-emerald-500 to-indigo-500" />
              <div className="text-9xl font-black text-transparent bg-clip-text bg-gradient-to-b from-white to-slate-600 tracking-tighter leading-none">{report.overallScore}%</div>
              <div className="text-xs uppercase tracking-[0.5em] text-slate-500 font-black mt-4">Total Compliance Score</div>
            </div>

            <section className="glass p-8 rounded-[2.5rem] border-l-8 border-indigo-500 shadow-2xl">
              <h3 className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-3">Executive Summary</h3>
              <p className="text-slate-200 italic text-lg leading-relaxed font-medium">"{report.summary}"</p>
            </section>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {report.roomAnalysis.map((item, idx) => (
                <div key={idx} className="glass p-6 rounded-[2rem] border border-white/5 hover:border-white/10 transition-all flex flex-col h-full shadow-lg">
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex flex-col">
                      <span className="text-[9px] font-black text-indigo-500 uppercase tracking-widest mb-1">{item.floorName || 'Standard'}</span>
                      <h4 className="font-black text-slate-100 uppercase text-lg italic tracking-tight">{item.roomType}</h4>
                    </div>
                    <div className={`text-[9px] px-3 py-1.5 rounded-full font-black uppercase tracking-widest shadow-inner ${
                      item.status === 'Good' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 
                      item.status === 'Fair' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' : 
                      'bg-red-500/10 text-red-400 border border-red-500/20'
                    }`}>
                      {item.status}
                    </div>
                  </div>
                  <p className="text-slate-400 text-sm leading-relaxed mb-6 font-medium">{item.observation}</p>
                  {item.remedy && (
                    <div className="mt-auto p-5 bg-indigo-500/5 rounded-2xl border border-indigo-500/10 text-xs text-slate-300 font-bold leading-relaxed">
                      <span className="text-indigo-400 mr-2 uppercase tracking-widest">Correction:</span>{item.remedy}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <section className="glass p-8 rounded-[2.5rem] bg-emerald-500/5 border border-emerald-500/10">
              <h3 className="text-[10px] font-black text-emerald-400 uppercase tracking-widest mb-6">Expert Recommendations</h3>
              <ul className="grid grid-cols-1 gap-4">
                {report.generalRemedies.map((tip, idx) => (
                  <li key={idx} className="flex gap-4 text-sm text-slate-400 font-bold items-center bg-black/20 p-4 rounded-2xl border border-white/5">
                    <div className="w-8 h-8 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 font-black text-[10px]">{idx + 1}</div>
                    <span className="leading-tight">{tip}</span>
                  </li>
                ))}
              </ul>
            </section>
          </main>
        </div>
      )}

      {/* Mapping Engine UI */}
      {(step === 'map-corners' || step === 'tag-rooms') && (
        <>
          {/* Desktop Search Header */}
          {isDesktop && (
            <div className="absolute top-6 left-1/2 -translate-x-1/2 z-[60] w-full max-w-xl px-4 pointer-events-none">
              <form onSubmit={handleSearch} className="glass p-2 rounded-3xl border-white/10 shadow-2xl flex gap-2 pointer-events-auto backdrop-blur-3xl">
                <div className="relative flex-1">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                  <input 
                    type="text" 
                    placeholder="Search address or neighborhood..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-white/5 border border-white/5 text-white pl-12 pr-4 py-3 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none font-bold text-sm"
                  />
                </div>
                <button 
                  type="submit" 
                  disabled={isSearching}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 rounded-2xl font-black text-xs uppercase tracking-widest disabled:opacity-50 transition-colors"
                >
                  {isSearching ? <Loader2 className="animate-spin" /> : 'Search'}
                </button>
              </form>
            </div>
          )}

          {/* Left HUD Panel */}
          <div className="absolute top-6 left-6 z-20 space-y-3 pointer-events-none">
            <div className="glass p-3 px-4 rounded-2xl flex items-center space-x-3 text-[10px] font-black border-white/10 text-white uppercase tracking-tighter shadow-xl">
              <MapPinIcon size={14} className="text-red-500" />
              <span>{location ? `GPS ACCURACY: ${Math.round(location.accuracy)}m` : 'LOCATING...'}</span>
            </div>
            <div className="glass p-3 px-4 rounded-2xl flex items-center space-x-3 text-[10px] font-black border-indigo-500/40 text-indigo-300 uppercase tracking-tighter shadow-xl">
              <Layers size={14} />
              <span>{activeFloor.name.toUpperCase()}</span>
            </div>
          </div>

          {/* Right HUD Panel */}
          <div className="absolute top-6 right-6 z-20 flex flex-col items-end gap-4">
            <div className="glass p-4 rounded-3xl border-white/10 flex flex-col items-center pointer-events-none shadow-2xl backdrop-blur-2xl">
              <div className="relative w-16 h-16 flex items-center justify-center mb-2">
                <div className="absolute inset-0 border-2 border-white/5 rounded-full" />
                <CompassIcon size={40} className="text-indigo-400" style={{ transform: `rotate(${heading}deg)` }} />
                <div className="absolute -top-1 w-1.5 h-3 bg-red-600 rounded-full shadow-[0_0_10px_red]" />
              </div>
              <span className="text-[12px] font-black text-white">{heading}° {getDirection(heading)}</span>
            </div>

            {/* Interactive Map/Line Diagram Container */}
            <div 
              className={`glass border-white/20 rounded-[2.5rem] overflow-hidden transition-all duration-700 pointer-events-auto shadow-2xl backdrop-blur-3xl relative ${
                showLargeMap ? (isDesktop ? 'w-[65vw] h-[65vh] max-w-[1200px]' : 'w-[92vw] h-[60vh]') : 'w-32 h-32'
              }`}
            >
              <div className="absolute top-0 left-0 right-0 p-4 bg-black/80 flex justify-between items-center z-10 border-b border-white/5">
                 <span className="text-[10px] font-black text-slate-300 uppercase tracking-[0.3em] pl-2">{activeFloor.name} Layout</span>
                 {!isDesktop && (
                  <button onClick={() => setShowLargeMap(!showLargeMap)} className="text-white p-2 hover:bg-white/10 rounded-2xl transition-colors">
                    {showLargeMap ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                  </button>
                 )}
              </div>

              {showLargeMap && (
                <div className="absolute right-4 top-1/2 -translate-y-1/2 flex flex-col gap-4 z-10">
                  <button onClick={() => setMapZoom(z => Math.min(z + 0.5, 8))} className="p-4 bg-indigo-500 rounded-2xl text-white shadow-2xl active:scale-90 hover:bg-indigo-400"><Plus size={20} /></button>
                  <button onClick={() => setMapZoom(z => Math.max(z - 0.5, 0.4))} className="p-4 bg-indigo-500 rounded-2xl text-white shadow-2xl active:scale-90 hover:bg-indigo-400"><Minus size={20} /></button>
                  <button onClick={() => { setMapPan({x:0,y:0}); setMapZoom(1); }} className="p-4 bg-white/10 rounded-2xl text-white backdrop-blur-xl active:scale-90 hover:bg-white/20"><RotateCcwIcon size={20} /></button>
                </div>
              )}

              <div 
                className="w-full h-full pt-12 relative overflow-hidden" 
                onPointerMove={(e) => { if (showLargeMap && e.buttons === 1) setMapPan(p => ({ x: p.x + e.movementX, y: p.y + e.movementY })); }}
              >
                <VirtualMap 
                  floor={activeFloor} 
                  heading={heading} 
                  isExpanded={showLargeMap} 
                  zoomLevel={mapZoom} 
                  pan={mapPan} 
                  onMapClick={isDesktop ? (lat, lng) => markPoint(lat, lng) : undefined}
                  isDesktop={isDesktop}
                />
              </div>

              {showLargeMap && (
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-3 z-10">
                  <div className="text-[9px] font-black text-white bg-indigo-600 px-4 py-2 rounded-full border border-white/10 shadow-xl flex items-center gap-2 uppercase tracking-widest">
                    <Move size={12} /> {isDesktop ? 'Drag to Pan' : 'Pinch/Drag to Explore'}
                  </div>
                  {isDesktop && (
                    <div className="text-[9px] font-black text-emerald-400 bg-black/60 px-4 py-2 rounded-full border border-emerald-500/20 shadow-xl flex items-center gap-2 uppercase tracking-widest backdrop-blur-md">
                      <MousePointer2 size={12} /> Click to Plot Markers
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Aiming Reticle (Mobile only) */}
          {!isDesktop && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-25">
               <div className="relative w-56 h-56">
                  <div className="absolute top-1/2 left-0 w-full h-[1.5px] bg-white/50" />
                  <div className="absolute left-1/2 top-0 w-[1.5px] h-full bg-white/50" />
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-16 border-2 border-white/70 rounded-full" />
               </div>
            </div>
          )}

          {/* Footer Control Panel */}
          <div className={`absolute bottom-0 left-0 right-0 p-8 z-30 pb-12 space-y-6 ${isDesktop ? 'max-w-4xl mx-auto' : ''}`}>
            {/* Floor Swiper */}
            <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1 pointer-events-auto">
              {floors.map((f, idx) => (
                <button
                  key={f.id}
                  onClick={() => { setActiveFloorIdx(idx); setStep(f.corners.length < 3 ? 'map-corners' : 'tag-rooms'); }}
                  className={`px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest border transition-all shadow-xl ${
                    activeFloorIdx === idx ? 'bg-indigo-600 border-indigo-400 text-white' : 'bg-slate-900 border-white/5 text-slate-500 hover:text-slate-400'
                  }`}
                >
                  {f.name}
                </button>
              ))}
              <button 
                onClick={addNewFloor}
                className="px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest border border-indigo-500/50 text-indigo-400 bg-slate-950 shadow-xl hover:bg-indigo-950 transition-colors"
              >
                + Add Floor
              </button>
            </div>

            <div className="glass p-6 rounded-[3rem] space-y-6 border-white/10 shadow-2xl backdrop-blur-3xl">
              <div className="flex justify-between items-center px-2">
                <div className="flex items-center gap-4">
                  <div className={`w-3 h-3 rounded-full ${step === 'map-corners' ? 'bg-indigo-500 animate-pulse shadow-[0_0_12px_rgba(99,102,241,1)]' : 'bg-emerald-500 animate-pulse shadow-[0_0_12px_rgba(16,185,129,1)]'}`} />
                  <div>
                    <h3 className="font-black text-white text-[13px] tracking-[0.2em] uppercase italic">
                      {step === 'map-corners' ? 'Boundary Mapping' : 'Space Identification'}
                    </h3>
                    <p className="text-[10px] text-slate-500 font-bold tracking-widest uppercase">
                      {step === 'map-corners' ? `Defining corners for ${activeFloor.name}` : `Tagging rooms within boundary`}
                    </p>
                  </div>
                </div>
                <div className="text-[11px] font-black px-5 py-2 rounded-2xl bg-white/5 border border-white/10 text-slate-400 shadow-inner">
                  {step === 'map-corners' ? activeFloor.corners.length : activeFloor.rooms.length} SAVED
                </div>
              </div>
              
              {step === 'tag-rooms' && (
                <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar px-2">
                  {ROOM_TYPES.map(type => (
                    <button
                      key={type}
                      onClick={() => setSelectedRoomType(type)}
                      className={`whitespace-nowrap px-6 py-4 rounded-3xl text-[11px] font-black border transition-all uppercase tracking-widest ${
                        selectedRoomType === type ? 'bg-emerald-500 border-emerald-400 text-white shadow-2xl scale-105' : 'bg-white/5 border-white/5 text-slate-500 hover:border-white/20'
                      }`}
                    >
                      {type}
                    </button>
                  ))}
                </div>
              )}

              <div className="flex gap-4">
                {!isDesktop && (
                  <button 
                    onClick={() => markPoint()}
                    className={`flex-1 py-6 rounded-3xl font-black text-xs tracking-[0.3em] flex items-center justify-center space-x-4 shadow-2xl active:scale-95 transition-all uppercase ${
                      step === 'map-corners' ? 'bg-white text-black' : 'bg-emerald-500 text-white'
                    }`}
                  >
                    <CameraIcon size={20} strokeWidth={3} />
                    <span>Tag Marker</span>
                  </button>
                )}

                {(activeFloor.corners.length > 0 || activeFloor.rooms.length > 0) && (
                  <button onClick={removeLast} className="px-6 bg-slate-900 text-white rounded-3xl border border-white/10 active:scale-90 shadow-xl hover:bg-slate-800 transition-all">
                    <Undo2 size={24} strokeWidth={2.5} />
                  </button>
                )}

                {(step === 'map-corners' && activeFloor.corners.length >= 3) && (
                  <button 
                    onClick={() => { setStep('tag-rooms'); if (!isDesktop) setShowLargeMap(false); }}
                    className="px-10 bg-indigo-600 text-white rounded-3xl shadow-2xl active:scale-95 transition-all hover:bg-indigo-500 flex items-center justify-center"
                  >
                    <ChevronRightIcon size={32} strokeWidth={3} />
                  </button>
                )}

                {(step === 'tag-rooms' && activeFloor.rooms.length >= 1) && (
                  <button 
                    onClick={handleAnalyze}
                    className="px-10 bg-white text-black rounded-3xl shadow-2xl font-black text-[12px] tracking-widest active:scale-95 uppercase hover:bg-slate-100 transition-all"
                  >
                    Generate Report
                  </button>
                )}
              </div>
              
              {isDesktop && (
                <p className="text-center text-[9px] text-slate-600 font-bold uppercase tracking-widest animate-pulse">
                  Drawing Mode: Click on map to place architectural nodes
                </p>
              )}
            </div>
          </div>
        </>
      )}

      {error && (
        <div className="absolute top-28 left-1/2 -translate-x-1/2 z-[100] w-full max-w-md px-6 animate-in fade-in slide-in-from-top-6">
          <div className="bg-red-600 text-white p-5 rounded-3xl flex items-center justify-between shadow-2xl border border-red-500/50 backdrop-blur-xl">
            <div className="flex items-center gap-4 text-xs font-black uppercase tracking-widest">
              <AlertTriangle size={22} className="shrink-0" />
              <span>{error}</span>
            </div>
            <button onClick={() => setError(null)} className="p-2 hover:bg-white/20 rounded-full transition-colors font-black">×</button>
          </div>
        </div>
      )}
    </div>
  );
}
