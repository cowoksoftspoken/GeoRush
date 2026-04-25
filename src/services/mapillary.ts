import type { GeoLocation } from '../types'

interface MapillaryGeometry {
  type: 'Point'
  coordinates: [number, number]
}

interface MapillaryImage {
  id: string
  computed_geometry?: MapillaryGeometry
  geometry?: MapillaryGeometry
  computed_compass_angle?: number
  compass_angle?: number
  thumb_1024_url?: string
}

interface MapillaryImagesResponse {
  data?: MapillaryImage[]
}

const MAPILLARY_TOKEN = import.meta.env.VITE_MAPILLARY_ACCESS_TOKEN as string | undefined
const IMAGE_FIELDS = [
  'id',
  'computed_geometry',
  'geometry',
  'computed_compass_angle',
  'compass_angle',
  'thumb_1024_url'
].join(',')

function fromImage(seed: GeoLocation, image: MapillaryImage): GeoLocation {
  const geometry = image.computed_geometry ?? image.geometry
  const [lng, lat] = geometry?.coordinates ?? [seed.lng, seed.lat]

  return {
    ...seed,
    lat,
    lng,
    heading: image.computed_compass_angle ?? image.compass_angle ?? seed.heading,
    mapillaryId: image.id,
    thumbnailUrl: image.thumb_1024_url
  }
}

async function fetchImageById(imageId: string): Promise<MapillaryImage> {
  if (!MAPILLARY_TOKEN) {
    throw new Error('Mapillary Access Token not found in .env')
  }

  const params = new URLSearchParams({
    access_token: MAPILLARY_TOKEN,
    fields: IMAGE_FIELDS
  })

  const response = await fetch(`https://graph.mapillary.com/${imageId}?${params.toString()}`)
  if (!response.ok) {
    throw new Error(`Mapillary image ${imageId} is not available`)
  }

  return (await response.json()) as MapillaryImage
}

export async function resolveMapillaryLocation(seed: GeoLocation): Promise<GeoLocation> {
  if (seed.mapillaryId && seed.mapillaryId !== '175514681146746') {
    return fromImage(seed, await fetchImageById(seed.mapillaryId))
  }

  return findMapillaryImageNear(seed)
}

export async function findMapillaryImageNear(seed: GeoLocation): Promise<GeoLocation> {
  if (!MAPILLARY_TOKEN) {
    throw new Error('Mapillary Access Token not found in .env')
  }

  const params = new URLSearchParams({
    access_token: MAPILLARY_TOKEN,
    fields: IMAGE_FIELDS,
    limit: '12',
    lat: seed.lat.toString(),
    lng: seed.lng.toString(),
    radius: '50'
  })

  const response = await fetch(`https://graph.mapillary.com/images?${params.toString()}`)
  if (!response.ok) {
    throw new Error(`Mapillary API error: ${response.status}`)
  }

  const payload = (await response.json()) as MapillaryImagesResponse
  const images = payload.data ?? []
  if (images.length === 0) {
    throw new Error(`No Mapillary image found near ${seed.label ?? `${seed.lat},${seed.lng}`}`)
  }

  const image = images[Math.floor(Math.random() * Math.min(images.length, 5))]
  return fromImage(seed, image)
}

export async function enrichMapillaryLocations(seeds: GeoLocation[]): Promise<GeoLocation[]> {
  const settled = await Promise.allSettled(seeds.map((seed) => findMapillaryImageNear(seed)))
  return settled.map((result, index) => {
    if (result.status === 'fulfilled') return result.value
    return seeds[index]
  })
}
