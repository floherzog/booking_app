// Filling in translated sentences — shared by the app's t() (src/renderer/src/i18n)
// and the core functions that build sentences for the UI. Those take an optional
// `t` and default to `plainT`, which is English: the English text is the key.
//
// `{name}` is replaced from `vars`. A text with a `|` is a plural pair,
// 'one|other', picked by vars.n: t('{n} venue|{n} venues', { n }).
export function formatText(text, vars) {
  let s = String(text)
  if (s.includes('|') && vars && typeof vars.n === 'number') {
    const [one, other] = s.split('|')
    s = vars.n === 1 ? one : (other ?? one)
  }
  if (!vars) return s
  return s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] === undefined || vars[k] === null ? m : String(vars[k])))
}

export const plainT = (text, vars) => formatText(text, vars)
