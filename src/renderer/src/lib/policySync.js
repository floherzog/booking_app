import { api } from '../platform'

// OpenClaw drafts and sends from the same CSV, deciding for itself which venues
// to hold back. The app's hold keywords and override window (Rules) are meant to
// mirror that script, so the web build reads it and says when the two disagree.
// Only where caps.openclawPolicy is on; nothing here ever changes the rules.

const SESSION_KEY = 'booking_policy_sync'

function extractStringList(src, varName) {
  const m = src.match(new RegExp(String.raw`${varName}\s*=\s*\[([\s\S]*?)\]`))
  if (!m) return null
  return [...m[1].matchAll(/"([^"\\]*)"|'([^'\\]*)'/g)].map(x => x[1] ?? x[2])
}

function extractInt(src, varName) {
  const m = src.match(new RegExp(String.raw`${varName}\s*=\s*(\d+)`))
  return m ? parseInt(m[1], 10) : null
}

// The script's policy_decision(): its hard-stop and wait markers, and how long a
// hold lasts before it is overridden.
export function extractPolicy(src) {
  // Scoped to policy_decision so should_skip_by_note's copies are not picked up.
  const fn = src.match(/def policy_decision\b[\s\S]*?(?=\ndef \w)/)
  const scope = fn ? fn[0] : src
  const hardStop = extractStringList(scope, 'hard_stop') ?? []
  const waitMarkers = extractStringList(scope, 'wait_markers') ?? []
  return {
    keywords: [...new Set([...hardStop, ...waitMarkers])],
    holdOverrideDays: extractInt(scope, 'hold_override_days') ?? 365,
  }
}

// → human-readable differences, empty when the two agree.
export function diffPolicy(remote, localKeywords, localHoldDays) {
  const diffs = []
  const remoteSet = new Set(remote.keywords)
  const localSet = new Set(localKeywords)
  const added = remote.keywords.filter(k => !localSet.has(k))
  const removed = localKeywords.filter(k => !remoteSet.has(k))
  if (added.length) diffs.push(`New in script, missing in app: ${added.map(k => `"${k}"`).join(', ')}`)
  if (removed.length) diffs.push(`In app but removed from script: ${removed.map(k => `"${k}"`).join(', ')}`)
  if (remote.holdOverrideDays !== localHoldDays) {
    diffs.push(`Hold override threshold: script is ${remote.holdOverrideDays}d, app has ${localHoldDays}d`)
  }
  return diffs
}

// Read once per browser session; a missing script or token just means no warning.
export async function checkOpenclawPolicy(settings, rules) {
  const { repo, path } = settings?.openclaw || {}
  if (!repo || !path) return []
  let policy = null
  try { policy = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null') } catch { /* ignore */ }
  if (!policy) {
    const src = await api.fetchOpenclawScript({ repo, path })
    if (!src) return []
    policy = extractPolicy(src)
    try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(policy)) } catch { /* ignore */ }
  }
  return diffPolicy(policy, rules.holdKeywords, rules.holdOverrideDays)
}
