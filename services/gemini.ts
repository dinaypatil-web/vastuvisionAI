
import { GoogleGenAI } from "@google/genai";
import { Floor, VastuReport, IndianLanguage } from "../types";
import { VASTU_SYSTEM_PROMPT } from "../constants";

/**
 * Service to analyze multi-floor house layout for Vastu compliance using Gemini API.
 * Leverages Google Maps grounding for environmental context on desktop/accurate locations.
 */
export const analyzeVastu = async (
  floors: Floor[],
  language: IndianLanguage = 'English',
  location?: { lat: number; lng: number }
): Promise<VastuReport> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const floorsDescription = floors.map((f, i) => `
    Floor: ${f.name} (Level ${f.level})
    Boundary Corners:
    ${f.corners.map((c, ci) => `Corner ${ci + 1}: Lat ${c.lat}, Lng ${c.lng}`).join('\n')}
    
    Room Placements on this Floor:
    ${f.rooms.map(r => `- ${r.type}: Lat ${r.point.lat}, Lng ${r.point.lng}, Facing ${r.point.heading}°`).join('\n')}
  `).join('\n--- Next Floor ---\n');

  const prompt = `
    Analyze this multi-floor house layout for Vastu compliance and provide the report in ${language}.
    
    House Location Context: ${location ? `Latitude: ${location.lat}, Longitude: ${location.lng}` : "Unknown exact address"}
    
    Spatial Data:
    ${floorsDescription}
    
    Notes: 0° is North, 90° is East, 180° is South, 270° is West.
    Consider the vertical alignment as well (e.g., toilets shouldn't be above kitchens or pooja rooms).
    
    CRITICAL: Use the googleMaps tool to check the surrounding geography (roads, T-junctions, nearby water bodies, or slopes) at this coordinate to provide a professional contextual analysis.
    
    Return the analysis ONLY as a valid JSON object matching the requested schema.
  `;

  try {
    const config: any = {
      systemInstruction: VASTU_SYSTEM_PROMPT,
      // Fix: Removed responseMimeType and responseSchema because they are not supported when using googleMaps tool.
      tools: [{ googleMaps: {} }],
    };

    // Add geolocation to tool config if available
    if (location) {
      config.toolConfig = {
        retrievalConfig: {
          latLng: {
            latitude: location.lat,
            longitude: location.lng
          }
        }
      };
    }

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash", // Maps grounding works best here
      contents: prompt,
      config: config
    });

    // Fix: Access response.text directly (it is a property, not a method).
    const responseText = response.text || '{}';
    // Fix: Extract JSON from the potentially markdown-wrapped text response.
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    const cleanJson = jsonMatch ? jsonMatch[0] : responseText;
    const data = JSON.parse(cleanJson);
    return data as VastuReport;
  } catch (error) {
    console.error("Vastu Analysis Error:", error);
    throw new Error("Analysis failed. Ensure markers are properly placed and try again.");
  }
};

/**
 * Search for a location using Gemini + Google Maps grounding
 */
export const searchLocation = async (query: string): Promise<{ lat: number, lng: number, address: string } | null> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: `Find the precise coordinates (latitude and longitude) and full address for: "${query}". Return the result strictly as a JSON object with keys "lat", "lng", and "address".`,
    config: {
      tools: [{ googleMaps: {} }],
      // Fix: Removed forbidden responseMimeType and responseSchema when using googleMaps tool.
    }
  });

  try {
    // Fix: Access response.text property and manually parse the JSON.
    const responseText = response.text || '';
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    const cleanJson = jsonMatch ? jsonMatch[0] : responseText;
    return JSON.parse(cleanJson);
  } catch {
    return null;
  }
};
