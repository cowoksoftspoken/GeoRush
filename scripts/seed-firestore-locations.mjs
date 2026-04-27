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

const targets = [
  { id: 'singapore_sg_01', imageId: '475708497024067', country: 'Singapore', region: 'asia', difficulty: 'easy' },
  { id: 'auckland_nz_01', imageId: '1127722422268411', country: 'New Zealand', region: 'oceania', difficulty: 'medium' },
  { id: 'paris_fr_01', imageId: '132544045580789', country: 'France', region: 'europe', difficulty: 'easy' },
  { id: 'poland_warsaw_01', imageId: '264917715378049', country: 'Poland', region: 'europe', difficulty: 'medium' },
  { id: 'switzerland_alps_01', imageId: '524234155604844', country: 'Switzerland', region: 'europe', difficulty: 'medium' },
  { id: 'norway_01', imageId: '201806584885253', country: 'Norway', region: 'europe', difficulty: 'hard' },
  { id: 'portland_us_01', imageId: '1191640781273579', country: 'United States', region: 'americas', difficulty: 'medium' },
  { id: 'maryland_us_01', imageId: '1104115866966513', country: 'United States', region: 'americas', difficulty: 'hard' },
  { id: 'france_north_01', imageId: '1142579596266208', country: 'France', region: 'europe', difficulty: 'medium' },
  { id: 'ethiopia_addis_01', imageId: '860883924772882', country: 'Ethiopia', region: 'africa', difficulty: 'hard' }
]

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
  if (target.imageId) {
    const url = `https://graph.mapillary.com/${target.imageId}?fields=id,computed_geometry,geometry&access_token=${mapillaryToken}`
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`Mapillary ${target.id}: ${response.status} ${await response.text()}`)
    }

    const image = await response.json()
    const coordinates = image.computed_geometry?.coordinates || image.geometry?.coordinates
    if (!coordinates) throw new Error(`Mapillary ${target.id}: image has no geometry`)

    return {
      imageId: String(image.id),
      lat: Number(coordinates[1]),
      lng: Number(coordinates[0])
    }
  }

  const delta = 0.04
  const bbox = [
    target.lng - delta,
    target.lat - delta,
    target.lng + delta,
    target.lat + delta
  ].join(',')
  const url = `https://graph.mapillary.com/images?fields=id,computed_geometry,geometry&bbox=${bbox}&limit=1&access_token=${mapillaryToken}`
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
  await patchDocument('mapPacks/world', {
    name: 'World Mix',
    description: 'Curated global Mapillary seed locations',
    region: 'world',
    difficulty: 'mixed',
    isPublic: true
  })

  const seeded = []
  for (const target of targets) {
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
  }

  if (seeded.length < 5) {
    throw new Error(`Only seeded ${seeded.length} locations. Need at least 5 active publicLocations.`)
  }

  console.log(`Done. Seeded ${seeded.length} Firestore locations.`)
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
