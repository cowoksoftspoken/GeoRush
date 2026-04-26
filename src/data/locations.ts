import type { GeoLocation } from '../types'
import { findMapillaryImageNear } from '../services/mapillary'

type Region = 'asia' | 'europe' | 'americas' | 'oceania'

const REGIONAL_LOCATIONS: Record<Region, GeoLocation[]> = {
  asia: [
    { lat: 35.6895, lng: 139.6917, heading: 270, pitch: 0, zoom: 1, label: 'Tokyo, Japan' },
    { lat: 37.5796, lng: 126.9770, heading: 120, pitch: 0, zoom: 1, label: 'Seoul, South Korea' },
    { lat: 25.0330, lng: 121.5654, heading: 80, pitch: 0, zoom: 1, label: 'Taipei, Taiwan' },
    { lat: 22.3193, lng: 114.1694, heading: 45, pitch: 0, zoom: 1, label: 'Hong Kong' },
    { lat: 1.2903, lng: 103.8520, heading: 0, pitch: 0, zoom: 1, label: 'Singapore' },
    { lat: 13.7563, lng: 100.5018, heading: 160, pitch: 0, zoom: 1, label: 'Bangkok, Thailand' },
    { lat: 3.1390, lng: 101.6869, heading: 210, pitch: 0, zoom: 1, label: 'Kuala Lumpur, Malaysia' },
    { lat: 14.5995, lng: 120.9842, heading: 90, pitch: 0, zoom: 1, label: 'Manila, Philippines' },
    { lat: 21.0278, lng: 105.8342, heading: 320, pitch: 0, zoom: 1, label: 'Hanoi, Vietnam' },
    { lat: 10.8231, lng: 106.6297, heading: 20, pitch: 0, zoom: 1, label: 'Ho Chi Minh City, Vietnam' },
    { lat: -6.2000, lng: 106.8167, heading: 180, pitch: 0, zoom: 1, label: 'Jakarta, Indonesia' },
    { lat: -7.2575, lng: 112.7521, heading: 0, pitch: 0, zoom: 1, label: 'Surabaya, Indonesia' },
    { lat: -8.6705, lng: 115.2126, heading: 45, pitch: 0, zoom: 1, label: 'Denpasar, Bali, Indonesia' },
    { lat: 28.6139, lng: 77.2090, heading: 140, pitch: 0, zoom: 1, label: 'New Delhi, India' },
    { lat: 19.0760, lng: 72.8777, heading: 260, pitch: 0, zoom: 1, label: 'Mumbai, India' },
    { lat: 25.2048, lng: 55.2708, heading: 40, pitch: 0, zoom: 1, label: 'Dubai, UAE' },
    { lat: 31.7683, lng: 35.2137, heading: 300, pitch: 0, zoom: 1, label: 'Jerusalem' },
    { lat: 34.0209, lng: -6.8416, heading: 200, pitch: 0, zoom: 1, label: 'Rabat, Morocco' },
    { lat: 33.5731, lng: -7.5898, heading: 90, pitch: 0, zoom: 1, label: 'Casablanca, Morocco' },
    { lat: 30.0444, lng: 31.2357, heading: 120, pitch: 0, zoom: 1, label: 'Cairo, Egypt' },
    { lat: 35.6762, lng: 139.6503, heading: 30, pitch: 0, zoom: 1, label: 'Shinjuku, Tokyo, Japan' },
    { lat: 34.6937, lng: 135.5023, heading: 180, pitch: 0, zoom: 1, label: 'Osaka, Japan' },
    { lat: 35.0116, lng: 135.7681, heading: 100, pitch: 0, zoom: 1, label: 'Kyoto, Japan' }
  ],
  europe: [
    { lat: 59.3293, lng: 18.0686, heading: 270, pitch: 0, zoom: 1, label: 'Stockholm, Sweden' },
    { lat: 48.8566, lng: 2.3522, heading: 180, pitch: 0, zoom: 1, label: 'Paris, France' },
    { lat: 51.5074, lng: -0.1278, heading: 90, pitch: 0, zoom: 1, label: 'London, UK' },
    { lat: 52.5200, lng: 13.4050, heading: 0, pitch: 0, zoom: 1, label: 'Berlin, Germany' },
    { lat: 41.9028, lng: 12.4964, heading: 45, pitch: 0, zoom: 1, label: 'Rome, Italy' },
    { lat: 52.3676, lng: 4.9041, heading: 310, pitch: 0, zoom: 1, label: 'Amsterdam, Netherlands' },
    { lat: 41.3851, lng: 2.1734, heading: 100, pitch: 0, zoom: 1, label: 'Barcelona, Spain' },
    { lat: 40.4168, lng: -3.7038, heading: 60, pitch: 0, zoom: 1, label: 'Madrid, Spain' },
    { lat: 48.2082, lng: 16.3738, heading: 200, pitch: 0, zoom: 1, label: 'Vienna, Austria' },
    { lat: 50.0755, lng: 14.4378, heading: 20, pitch: 0, zoom: 1, label: 'Prague, Czechia' },
    { lat: 47.4979, lng: 19.0402, heading: 160, pitch: 0, zoom: 1, label: 'Budapest, Hungary' },
    { lat: 55.6761, lng: 12.5683, heading: 250, pitch: 0, zoom: 1, label: 'Copenhagen, Denmark' },
    { lat: 60.1699, lng: 24.9384, heading: 80, pitch: 0, zoom: 1, label: 'Helsinki, Finland' },
    { lat: 38.7223, lng: -9.1393, heading: 330, pitch: 0, zoom: 1, label: 'Lisbon, Portugal' },
    { lat: 37.9838, lng: 23.7275, heading: 130, pitch: 0, zoom: 1, label: 'Athens, Greece' },
    { lat: 59.9139, lng: 10.7522, heading: 45, pitch: 0, zoom: 1, label: 'Oslo, Norway' },
    { lat: 64.1265, lng: -21.8174, heading: 270, pitch: 0, zoom: 1, label: 'Reykjavik, Iceland' },
    { lat: 43.7696, lng: 11.2558, heading: 180, pitch: 0, zoom: 1, label: 'Florence, Italy' },
    { lat: 45.4408, lng: 12.3155, heading: 90, pitch: 0, zoom: 1, label: 'Venice, Italy' },
    { lat: 50.8503, lng: 4.3517, heading: 0, pitch: 0, zoom: 1, label: 'Brussels, Belgium' },
    { lat: 47.3769, lng: 8.5417, heading: 120, pitch: 0, zoom: 1, label: 'Zurich, Switzerland' },
    { lat: 46.2044, lng: 6.1432, heading: 210, pitch: 0, zoom: 1, label: 'Geneva, Switzerland' }
  ],
  americas: [
    { lat: 40.7128, lng: -74.0060, heading: 0, pitch: 0, zoom: 1, label: 'New York, USA' },
    { lat: 37.7749, lng: -122.4194, heading: 90, pitch: 0, zoom: 1, label: 'San Francisco, USA' },
    { lat: 34.0522, lng: -118.2437, heading: 180, pitch: 0, zoom: 1, label: 'Los Angeles, USA' },
    { lat: 41.8781, lng: -87.6298, heading: 20, pitch: 0, zoom: 1, label: 'Chicago, USA' },
    { lat: 25.7617, lng: -80.1918, heading: 120, pitch: 0, zoom: 1, label: 'Miami, USA' },
    { lat: 47.6062, lng: -122.3321, heading: 280, pitch: 0, zoom: 1, label: 'Seattle, USA' },
    { lat: 36.1699, lng: -115.1398, heading: 45, pitch: 0, zoom: 1, label: 'Las Vegas, USA' },
    { lat: 29.7604, lng: -95.3698, heading: 0, pitch: 0, zoom: 1, label: 'Houston, USA' },
    { lat: 39.7392, lng: -104.9903, heading: 270, pitch: 0, zoom: 1, label: 'Denver, USA' },
    { lat: 43.6532, lng: -79.3832, heading: 310, pitch: 0, zoom: 1, label: 'Toronto, Canada' },
    { lat: 45.5017, lng: -73.5673, heading: 110, pitch: 0, zoom: 1, label: 'Montreal, Canada' },
    { lat: 49.2827, lng: -123.1207, heading: 180, pitch: 0, zoom: 1, label: 'Vancouver, Canada' },
    { lat: 19.4326, lng: -99.1332, heading: 260, pitch: 0, zoom: 1, label: 'Mexico City, Mexico' },
    { lat: 20.6597, lng: -103.3496, heading: 90, pitch: 0, zoom: 1, label: 'Guadalajara, Mexico' },
    { lat: 4.7110, lng: -74.0721, heading: 150, pitch: 0, zoom: 1, label: 'Bogota, Colombia' },
    { lat: -12.0464, lng: -77.0428, heading: 70, pitch: 0, zoom: 1, label: 'Lima, Peru' },
    { lat: -33.4489, lng: -70.6693, heading: 200, pitch: 0, zoom: 1, label: 'Santiago, Chile' },
    { lat: -34.6037, lng: -58.3816, heading: 40, pitch: 0, zoom: 1, label: 'Buenos Aires, Argentina' },
    { lat: -23.5505, lng: -46.6333, heading: 320, pitch: 0, zoom: 1, label: 'Sao Paulo, Brazil' },
    { lat: -22.9068, lng: -43.1729, heading: 10, pitch: 0, zoom: 1, label: 'Rio de Janeiro, Brazil' },
    { lat: -15.7975, lng: -47.8919, heading: 180, pitch: 0, zoom: 1, label: 'Brasilia, Brazil' },
    { lat: 10.4806, lng: -66.9036, heading: 45, pitch: 0, zoom: 1, label: 'Caracas, Venezuela' }
  ],
  oceania: [
    { lat: -33.8688, lng: 151.2093, heading: 270, pitch: 0, zoom: 1, label: 'Sydney, Australia' },
    { lat: -37.8136, lng: 144.9631, heading: 0, pitch: 0, zoom: 1, label: 'Melbourne, Australia' },
    { lat: -27.4698, lng: 153.0251, heading: 70, pitch: 0, zoom: 1, label: 'Brisbane, Australia' },
    { lat: -31.9523, lng: 115.8613, heading: 130, pitch: 0, zoom: 1, label: 'Perth, Australia' },
    { lat: -34.9285, lng: 138.6007, heading: 220, pitch: 0, zoom: 1, label: 'Adelaide, Australia' },
    { lat: -35.2809, lng: 149.1300, heading: 20, pitch: 0, zoom: 1, label: 'Canberra, Australia' },
    { lat: -42.8821, lng: 147.3272, heading: 300, pitch: 0, zoom: 1, label: 'Hobart, Australia' },
    { lat: -37.7870, lng: 175.2793, heading: 45, pitch: 0, zoom: 1, label: 'Hamilton, New Zealand' },
    { lat: -36.8509, lng: 174.7645, heading: 170, pitch: 0, zoom: 1, label: 'Auckland, New Zealand' },
    { lat: -41.2865, lng: 174.7762, heading: 90, pitch: 0, zoom: 1, label: 'Wellington, New Zealand' },
    { lat: -43.5321, lng: 172.6362, heading: 240, pitch: 0, zoom: 1, label: 'Christchurch, New Zealand' },
    { lat: -45.8788, lng: 170.5028, heading: 0, pitch: 0, zoom: 1, label: 'Dunedin, New Zealand' },
    { lat: -45.0312, lng: 168.6626, heading: 60, pitch: 0, zoom: 1, label: 'Queenstown, New Zealand' },
    { lat: -17.7134, lng: 178.0650, heading: 180, pitch: 0, zoom: 1, label: 'Suva, Fiji' },
    { lat: -21.1394, lng: -175.2049, heading: 90, pitch: 0, zoom: 1, label: 'Nukuʻalofa, Tonga' }
  ]
}

export const WORLD_LOCATIONS: GeoLocation[] = Object.values(REGIONAL_LOCATIONS).flat()

function shuffle<T>(items: T[]): T[] {
  return [...items].sort(() => Math.random() - 0.5)
}

export function pickRandomLocations(count: number): GeoLocation[] {
  return shuffle(WORLD_LOCATIONS).slice(0, count)
}

export async function pickGameLocations(count: number): Promise<GeoLocation[]> {
  const regions = shuffle(Object.keys(REGIONAL_LOCATIONS) as Region[])
  const selected: GeoLocation[] = []
  const usedLabels = new Set<string>()

  for (const region of regions) {
    for (const seed of shuffle(REGIONAL_LOCATIONS[region])) {
      if (usedLabels.has(seed.label ?? '')) continue
      try {
        const location = await findMapillaryImageNear(seed)
        selected.push(location)
        usedLabels.add(seed.label ?? `${seed.lat},${seed.lng}`)
        break
      } catch (err) {
        console.warn((err as Error).message)
      }
    }
    if (selected.length === count) return selected
  }

  for (const seed of shuffle(WORLD_LOCATIONS)) {
    if (usedLabels.has(seed.label ?? '')) continue
    try {
      const location = await findMapillaryImageNear(seed)
      selected.push(location)
      usedLabels.add(seed.label ?? `${seed.lat},${seed.lng}`)
      if (selected.length === count) return selected
    } catch (err) {
      console.warn((err as Error).message)
    }
  }

  throw new Error(`Only found ${selected.length} Mapillary locations, need ${count}`)
}
