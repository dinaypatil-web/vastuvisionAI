
export interface GeoPoint {
  lat: number;
  lng: number;
  heading: number;
  timestamp: number;
}

export type RoomType = 
  | 'Main Entrance'
  | 'Kitchen'
  | 'Master Bedroom'
  | 'Bedroom'
  | 'Drawing Room'
  | 'Living Room'
  | 'Pooja Room'
  | 'Toilet'
  | 'Bathroom'
  | 'Store Room'
  | 'Balcony'
  | 'Staircase';

export interface TaggedRoom {
  id: string;
  type: RoomType;
  point: GeoPoint;
}

export interface Floor {
  id: string;
  level: number;
  name: string;
  corners: GeoPoint[];
  rooms: TaggedRoom[];
}

export interface VastuReport {
  overallScore: number;
  summary: string;
  roomAnalysis: {
    roomType: RoomType;
    status: 'Good' | 'Fair' | 'Bad';
    observation: string;
    remedy?: string;
    floorName?: string;
  }[];
  generalRemedies: string[];
}

export type IndianLanguage = 
  | 'English'
  | 'Hindi (हिन्दी)'
  | 'Tamil (தமிழ்)'
  | 'Telugu (తెలుగు)'
  | 'Kannada (ಕನ್ನಡ)'
  | 'Malayalam (മലയാളം)'
  // Fix: Changed 'मರಾठी' (using Kannada RA) to 'मराठी' (using Devanagari RA) to match correct script and constants.ts
  | 'Marathi (मराठी)'
  | 'Gujarati (ગુજરાતી)'
  | 'Bengali (বাংলা)'
  | 'Punjabi (ਪੰਜਾਬੀ)';
