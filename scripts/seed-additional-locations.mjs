import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const envText = readFileSync('.env', 'utf8')
const env = Object.fromEntries(
  envText
    .split(/\r?\n/)
    .filter((line) => line.trim() && !line.trim().startsWith('#'))
    .map((line) => {
      const index = line.indexOf('=')
      return [line.slice(0, index), line.slice(index + 1)]
    })
)

const projectId = process.env.FIREBASE_PROJECT_ID || env.VITE_FIREBASE_PROJECT_ID
const mapillaryToken = process.env.MAPILLARY_ACCESS_TOKEN || env.VITE_MAPILLARY_ACCESS_TOKEN

if (!projectId) throw new Error('Missing VITE_FIREBASE_PROJECT_ID in .env')
if (!mapillaryToken) throw new Error('Missing VITE_MAPILLARY_ACCESS_TOKEN in .env')

const firebaseCli = process.platform === 'win32' ? 'firebase.cmd' : 'firebase'
const loginJson = execSync(`${firebaseCli} login:list --json`, {
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe']
})
const login = JSON.parse(loginJson)
const accessToken = login.result?.[0]?.tokens?.access_token
if (!accessToken) throw new Error('Firebase CLI is not logged in. Run firebase login first.')

const rawTargets = [
  // 🇸🇬 Singapore
  { id: "sg_1", "lat": 1.3521, "lng": 103.8198, country: "Singapore", region: "asia" },
  { id: "sg_2", "lat": 1.2903, "lng": 103.8519, country: "Singapore", region: "asia" },
  { id: "sg_3", "lat": 1.3000, "lng": 103.8000, country: "Singapore", region: "asia" },

  // 🇯🇵 Japan
  { id: "jp_1", "lat": 35.6762, "lng": 139.6503, country: "Japan", region: "asia" },
  { id: "jp_2", "lat": 34.6937, "lng": 135.5023, country: "Japan", region: "asia" },
  { id: "jp_3", "lat": 43.0618, "lng": 141.3545, country: "Japan", region: "asia" },
  { id: "jp_4", "lat": 35.0116, "lng": 135.7681, country: "Japan", region: "asia" },
  { id: "jp_5", "lat": 33.5904, "lng": 130.4017, country: "Japan", region: "asia" },

  // 🇰🇷 Korea
  { id: "kr_1", "lat": 37.5665, "lng": 126.9780, country: "South Korea", region: "asia" },
  { id: "kr_2", "lat": 35.1796, "lng": 129.0756, country: "South Korea", region: "asia" },
  { id: "kr_3", "lat": 35.9078, "lng": 127.7669, country: "South Korea", region: "asia" },

  // 🇮🇩 Indonesia
  { id: "id_1", "lat": -6.2088, "lng": 106.8456, country: "Indonesia", region: "asia" },
  { id: "id_2", "lat": -7.2575, "lng": 112.7521, country: "Indonesia", region: "asia" },
  { id: "id_3", "lat": -6.9175, "lng": 107.6191, country: "Indonesia", region: "asia" },
  { id: "id_4", "lat": -8.4095, "lng": 115.1889, country: "Indonesia", region: "asia" },

  // 🇹🇭 Thailand
  { id: "th_1", "lat": 13.7563, "lng": 100.5018, country: "Thailand", region: "asia" },
  { id: "th_2", "lat": 18.7883, "lng": 98.9853, country: "Thailand", region: "asia" },
  { id: "th_3", "lat": 7.8804, "lng": 98.3923, country: "Thailand", region: "asia" },

  // 🇲🇾 Malaysia
  { id: "my_1", "lat": 3.1390, "lng": 101.6869, country: "Malaysia", region: "asia" },
  { id: "my_2", "lat": 5.4141, "lng": 100.3288, country: "Malaysia", region: "asia" },
  { id: "my_3", "lat": 1.4927, "lng": 103.7414, country: "Malaysia", region: "asia" },

  // 🇦🇪 UAE
  { id: "ae_1", "lat": 25.2048, "lng": 55.2708, country: "UAE", region: "asia" },
  { id: "ae_2", "lat": 24.4539, "lng": 54.3773, country: "UAE", region: "asia" },

  // 🇹🇷 Turkey
  { id: "tr_1", "lat": 41.0082, "lng": 28.9784, country: "Turkey", region: "europe" },
  { id: "tr_2", "lat": 39.9334, "lng": 32.8597, country: "Turkey", region: "europe" },
  { id: "tr_3", "lat": 38.4237, "lng": 27.1428, country: "Turkey", region: "europe" },

  // 🇬🇧 UK
  { id: "uk_1", "lat": 51.5074, "lng": -0.1278, country: "UK", region: "europe" },
  { id: "uk_2", "lat": 53.4808, "lng": -2.2426, country: "UK", region: "europe" },
  { id: "uk_3", "lat": 55.9533, "lng": -3.1883, country: "UK", region: "europe" },

  // 🇫🇷 France
  { id: "fr_1", "lat": 48.8566, "lng": 2.3522, country: "France", region: "europe" },
  { id: "fr_2", "lat": 43.2965, "lng": 5.3698, country: "France", region: "europe" },
  { id: "fr_3", "lat": 45.7640, "lng": 4.8357, country: "France", region: "europe" },

  // 🇩🇪 Germany
  { id: "de_1", "lat": 52.5200, "lng": 13.4050, country: "Germany", region: "europe" },
  { id: "de_2", "lat": 48.1351, "lng": 11.5820, country: "Germany", region: "europe" },
  { id: "de_3", "lat": 50.1109, "lng": 8.6821, country: "Germany", region: "europe" },

  // 🇳🇱 Netherlands
  { id: "nl_1", "lat": 52.3676, "lng": 4.9041, country: "Netherlands", region: "europe" },
  { id: "nl_2", "lat": 51.9244, "lng": 4.4777, country: "Netherlands", region: "europe" },
  { id: "nl_3", "lat": 52.0907, "lng": 5.1214, country: "Netherlands", region: "europe" },

  // 🇪🇸 Spain
  { id: "es_1", "lat": 40.4168, "lng": -3.7038, country: "Spain", region: "europe" },
  { id: "es_2", "lat": 41.3851, "lng": 2.1734, country: "Spain", region: "europe" },
  { id: "es_3", "lat": 37.3891, "lng": -5.9845, country: "Spain", region: "europe" },

  // 🇮🇹 Italy
  { id: "it_1", "lat": 41.9028, "lng": 12.4964, country: "Italy", region: "europe" },
  { id: "it_2", "lat": 45.4642, "lng": 9.1900, country: "Italy", region: "europe" },
  { id: "it_3", "lat": 43.7696, "lng": 11.2558, country: "Italy", region: "europe" },

  // 🇺🇸 USA
  { id: "us_1", "lat": 40.7128, "lng": -74.0060, country: "USA", region: "americas" },
  { id: "us_2", "lat": 34.0522, "lng": -118.2437, country: "USA", region: "americas" },
  { id: "us_3", "lat": 41.8781, "lng": -87.6298, country: "USA", region: "americas" },
  { id: "us_4", "lat": 29.7604, "lng": -95.3698, country: "USA", region: "americas" },
  { id: "us_5", "lat": 47.6062, "lng": -122.3321, country: "USA", region: "americas" },

  // 🇨🇦 Canada
  { id: "ca_1", "lat": 43.6532, "lng": -79.3832, country: "Canada", region: "americas" },
  { id: "ca_2", "lat": 49.2827, "lng": -123.1207, country: "Canada", region: "americas" },
  { id: "ca_3", "lat": 45.5017, "lng": -73.5673, country: "Canada", region: "americas" },

  // 🇧🇷 Brazil
  { id: "br_1", "lat": -23.5505, "lng": -46.6333, country: "Brazil", region: "americas" },
  { id: "br_2", "lat": -22.9068, "lng": -43.1729, country: "Brazil", region: "americas" },
  { id: "br_3", "lat": -19.9167, "lng": -43.9345, country: "Brazil", region: "americas" },

  // 🇦🇷 Argentina
  { id: "ar_1", "lat": -34.6037, "lng": -58.3816, country: "Argentina", region: "americas" },
  { id: "ar_2", "lat": -32.9442, "lng": -60.6505, country: "Argentina", region: "americas" },

  // 🇨🇱 Chile
  { id: "cl_1", "lat": -33.4489, "lng": -70.6693, country: "Chile", region: "americas" },

  // 🇨🇴 Colombia
  { id: "co_1", "lat": 4.7110, "lng": -74.0721, country: "Colombia", region: "americas" },

  // 🇿🇦 South Africa
  { id: "za_1", "lat": -33.9249, "lng": 18.4241, country: "South Africa", region: "africa" },
  { id: "za_2", "lat": -26.2041, "lng": 28.0473, country: "South Africa", region: "africa" },
  { id: "za_3", "lat": -29.8587, "lng": 31.0218, country: "South Africa", region: "africa" },

  // 🇰🇪 Kenya
  { id: "ke_1", "lat": -1.2921, "lng": 36.8219, country: "Kenya", region: "africa" },

  // 🇲🇦 Morocco
  { id: "ma_1", "lat": 33.5731, "lng": -7.5898, country: "Morocco", region: "africa" },
  { id: "ma_2", "lat": 34.0209, "lng": -6.8416, country: "Morocco", region: "africa" },

  // 🇦🇺 Australia
  { id: "au_1", "lat": -33.8688, "lng": 151.2093, country: "Australia", region: "oceania" },
  { id: "au_2", "lat": -37.8136, "lng": 144.9631, country: "Australia", region: "oceania" },
  { id: "au_3", "lat": -27.4698, "lng": 153.0251, country: "Australia", region: "oceania" },

  // 🇳🇿 New Zealand
  { id: "nz_1", "lat": -36.8485, "lng": 174.7633, country: "New Zealand", region: "oceania" },
  { id: "nz_2", "lat": -41.2865, "lng": 174.7762, country: "New Zealand", region: "oceania" }
].map(t => ({...t, difficulty: 'mixed'}))

function firestoreValue(value) {
  if (typeof value === 'string') return { stringValue: value }
  if (typeof value === 'number') return { doubleValue: value }
  if (typeof value === 'boolean') return { booleanValue: value }
  throw new Error(`Unsupported Firestore value: ${value}`)
}

function firestoreDocument(data) {
  return {
    fields: Object.fromEntries(
      Object.entries(data).map(([key, value]) => [key, firestoreValue(value)])
    )
  }
}

async function patchDocument(path, data) {
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${path}`
  const response = await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(firestoreDocument(data))
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Failed writing ${path}: ${response.status} ${text}`)
  }
}

async function getMapillaryImage(target) {
  const delta = 0.001
  const bbox = [
    target.lng - delta,
    target.lat - delta,
    target.lng + delta,
    target.lat + delta
  ].join(',')
  const url = `https://graph.mapillary.com/images?fields=id,computed_geometry,geometry&is_pano=true&bbox=${bbox}&limit=1&access_token=${mapillaryToken}`
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Mapillary ${target.id}: ${response.status} ${await response.text()}`)
  }

  const data = await response.json()
  const image = data.data?.[0]
  if (!image) throw new Error(`Mapillary ${target.id}: no image found`)

  const coordinates = image.computed_geometry?.coordinates || image.geometry?.coordinates
  if (!coordinates) throw new Error(`Mapillary ${target.id}: image has no geometry`)

  return {
    imageId: String(image.id),
    lat: Number(coordinates[1]),
    lng: Number(coordinates[0])
  }
}

async function main() {
  const seeded = []
  for (const target of rawTargets) {
    try {
      const image = await getMapillaryImage(target)
      await patchDocument(`publicLocations/${target.id}`, {
        imageId: image.imageId,
        country: target.country,
        region: target.region,
        difficulty: target.difficulty,
        mapPackId: 'world',
        isActive: true
      })
      await patchDocument(`privateLocations/${target.id}`, {
        lat: image.lat,
        lng: image.lng
      })
      seeded.push(target.id)
      console.log(`seeded ${target.id}`)
    } catch (error) {
      console.warn(`skipped ${target.id}: ${error.message}`)
    }
    // delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 500))
  }

  console.log(`Done. Seeded ${seeded.length} additional Firestore locations.`)
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
