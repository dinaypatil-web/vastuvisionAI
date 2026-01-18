
import { RoomType, IndianLanguage } from './types';

export const ROOM_TYPES: RoomType[] = [
  'Main Entrance',
  'Kitchen',
  'Master Bedroom',
  'Bedroom',
  'Drawing Room',
  'Living Room',
  'Pooja Room',
  'Toilet',
  'Bathroom',
  'Store Room',
  'Balcony',
  'Staircase'
];

export const INDIAN_LANGUAGES: IndianLanguage[] = [
  'English',
  'Hindi (हिन्दी)',
  'Tamil (தமிழ்)',
  'Telugu (తెలుగు)',
  'Kannada (ಕನ್ನಡ)',
  'Malayalam (മലയാളം)',
  'Marathi (मराठी)',
  'Gujarati (ગુજરાતી)',
  'Bengali (বাংলা)',
  'Punjabi (ਪੰਜਾਬੀ)'
];

export const VASTU_SYSTEM_PROMPT = `You are a world-class Vastu Shastra expert architect. 
Given a list of house corners (polygon) and room positions (GPS + Heading), analyze the layout.
The heading 0 is True North, 90 is East, 180 is South, 270 is West.

CRITICAL: You must provide the response content (summary, observations, remedies, and general tips) in the user's requested language. However, the JSON KEYS must remain in English as per the schema.

Output a JSON report strictly following this structure:
{
  "overallScore": number (0-100),
  "summary": "Short overview string in requested language",
  "roomAnalysis": [
    {
      "roomType": "The English RoomType name provided",
      "status": "Good" | "Fair" | "Bad",
      "observation": "detailed observation in requested language",
      "remedy": "practical remedy in requested language if status is not Good"
    }
  ],
  "generalRemedies": ["string list in requested language"]
}

Rules of Vastu to consider:
1. Kitchen: Best in South-East (Agni).
2. Master Bedroom: Best in South-West.
3. Pooja Room: Best in North-East (Ishanya).
4. Toilet: Best in North-West or West. Avoid North-East.
5. Entrance: North, North-East, or East are considered auspicious.
6. Center (Brahmasthan): Should be open and clutter-free.`;
