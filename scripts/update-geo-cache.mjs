#!/usr/bin/env node
// Fetches the booking CSV, geocodes any city+country pairs not already in
// web/public/geo_cache.json, and writes the updated cache back.
// Run by .github/workflows/deploy-web.yml on every web deploy; only new cities
// are looked up. CSV_REPO / CSV_PATH come from the repository's variables.

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CACHE_FILE = path.resolve(__dirname, '../web/public/geo_cache.json')
const TOKEN = process.env.VITE_GITHUB_TOKEN
const CSV_REPO = process.env.CSV_REPO
const CSV_PATH = process.env.CSV_PATH

async function fetchCsv() {
  const res = await fetch(
    `https://api.github.com/repos/${CSV_REPO}/contents/${CSV_PATH}`,
    { headers: { Authorization: `token ${TOKEN}`, Accept: 'application/vnd.github.v3.raw' } }
  )
  if (!res.ok) throw new Error(`GitHub ${res.status}: ${await res.text()}`)
  return res.text()
}

function parseLine(line) {
  const cols = []
  let field = '', inQuotes = false
  for (const ch of line) {
    if (ch === '"') { inQuotes = !inQuotes }
    else if (ch === ';' && !inQuotes) { cols.push(field); field = '' }
    else { field += ch }
  }
  cols.push(field)
  return cols
}

function parseCities(csv) {
  const lines = csv.replace(/^\uFEFF/, '').replace(/\r/g, '').split('\n')
  const headers = parseLine(lines[0]).map(h => h.trim())
  const cityIdx = headers.indexOf('City')
  const countryIdx = headers.indexOf('Country')
  if (cityIdx < 0 || countryIdx < 0) throw new Error('City/Country columns not found in CSV')
  const seen = new Set()
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue
    const cols = parseLine(lines[i])
    const city = (cols[cityIdx] || '').trim()
    const country = (cols[countryIdx] || '').trim()
    if (city || country) seen.add(`${city}||${country}`)
  }
  return [...seen]
}

async function geocode(city, country) {
  try {
    const url = `https://nominatim.openstreetmap.org/search?city=${encodeURIComponent(city)}&country=${encodeURIComponent(country)}&format=json&limit=1`
    const res = await fetch(url, { headers: { 'User-Agent': 'booking-app-web/1.0' } })
    const data = await res.json()
    return data[0] ? { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) } : null
  } catch {
    return null
  }
}

const sleep = ms => new Promise(r => setTimeout(r, ms))

async function main() {
  if (!TOKEN || !CSV_REPO || !CSV_PATH) {
    console.log('No token or CSV location configured — leaving the geo cache as it is.')
    return
  }
  const existing = fs.existsSync(CACHE_FILE)
    ? JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'))
    : {}

  const csv = await fetchCsv()
  const allCities = parseCities(csv)
  const newCities = allCities.filter(k => !(k in existing))

  if (newCities.length === 0) {
    console.log('Geo cache is up to date — nothing to geocode.')
    return
  }

  console.log(`Geocoding ${newCities.length} new city/country pair(s)...`)
  for (const key of newCities) {
    const [city, country] = key.split('||')
    process.stdout.write(`  → ${city}, ${country} ... `)
    existing[key] = await geocode(city, country)
    console.log(existing[key] ? `${existing[key].lat.toFixed(3)}, ${existing[key].lng.toFixed(3)}` : 'not found')
    await sleep(1100) // Nominatim rate limit: 1 req/sec
  }

  fs.writeFileSync(CACHE_FILE, JSON.stringify(existing, null, 2))
  console.log(`Done — ${newCities.length} new entry/entries written to web/public/geo_cache.json`)
}

main().catch(e => { console.error(e.message); process.exit(1) })
