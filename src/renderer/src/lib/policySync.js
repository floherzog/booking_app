import { api } from '../platform'

// OpenClaw drafts and sends from the same CSV, deciding for itself which venues
// to hold back. The app's hold keywords and override window (Rules) are meant to
// mirror that script, so the web build reads it and says when the two disagree.
// Only where caps.openclawPolicy is on; nothing here ever changes the rules.

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

// → where the two differ, or null when they agree:
//   appOnly    hold words only the Rules have (OpenClaw still writes to those venues)
//   scriptOnly hold words only the script has (the app shows those venues as due)
//   days       { script, app } when a hold ends after a different time
export function diffPolicy(remote, localKeywords, localHoldDays) {
  const remoteSet = new Set(remote.keywords)
  const localSet = new Set(localKeywords)
  const appOnly = localKeywords.filter(k => !remoteSet.has(k))
  const scriptOnly = remote.keywords.filter(k => !localSet.has(k))
  const days = remote.holdOverrideDays !== localHoldDays ? { script: remote.holdOverrideDays, app: localHoldDays } : null
  return appOnly.length || scriptOnly.length || days ? { appOnly, scriptOnly, days } : null
}

// Read once per page load (reloading reads a changed script again); a missing
// script or token just means no warning.
let cached = null
export async function checkOpenclawPolicy(settings, rules) {
  const { repo, path } = settings?.openclaw || {}
  if (!repo || !path) return null
  const key = `${repo}/${path}`
  if (cached?.key !== key) {
    const src = await api.fetchOpenclawScript({ repo, path })
    if (!src) return null
    cached = { key, policy: extractPolicy(src) }
  }
  return diffPolicy(cached.policy, rules.holdKeywords, rules.holdOverrideDays)
}
