// Several venue lists side by side (Settings ▸ Data & storage), one shown at a
// time and switched from the top left of the window.
//
// `storage` keeps the shape it always had: adapter / filePath / github /
// multiBand say where the list being shown lives, so everything that loads and
// saves it is unchanged. `storage.lists` adds the lists themselves —
// [{ id, name, adapter, filePath, github }] — and `storage.active` which one is
// shown. The shown list's own entry may be out of date; its source is whatever
// the top level says (listsOf brings it in step).
//
// Switching copies the chosen list's source to the top level. `github` only
// moves when the chosen list is on GitHub: it is also the CSV location the
// settings sync shares with the web app (core/settingsSync.js), and showing a
// local file on the Mac must not take the web app's list away.

const sourceOf = s => ({
  adapter: s?.adapter === 'github' ? 'github' : 'file',
  filePath: String(s?.filePath || ''),
  github: { repo: String(s?.github?.repo || ''), path: String(s?.github?.path || '') },
})

export function newListId(lists = []) {
  let n = lists.length + 1
  while (lists.some(l => l.id === `list-${n}`)) n++
  return `list-${n}`
}

// → { lists, active }, always at least one list, the shown one in step.
export function listsOf(storage = {}) {
  const raw = (Array.isArray(storage.lists) ? storage.lists : [])
    .filter(l => l && typeof l === 'object' && typeof l.id === 'string' && l.id)
  const lists = raw.map(l => ({ id: l.id, name: String(l.name || ''), ...sourceOf(l) }))
  let active = lists.some(l => l.id === storage.active) ? storage.active : null
  if (!active) {
    active = newListId(lists)
    lists.unshift({ id: active, name: '', ...sourceOf(storage) })
  }
  return {
    lists: lists.map(l => (l.id === active ? { ...l, ...sourceOf(storage) } : l)),
    active,
  }
}

// What a list is called: its name, else where it lives.
export function listLabel(list, t = s => s) {
  if (list?.name?.trim()) return list.name.trim()
  if (list?.adapter === 'github') return list.github?.path ? list.github.path.split('/').pop() : t('GitHub list')
  return list?.filePath ? list.filePath.split('/').pop() : t('Untitled list')
}

// Whether a list has what it needs to load here (a file needs the Mac app).
export function listUsable(list, { localFiles = true } = {}) {
  if (list?.adapter === 'github') return !!(list.github?.repo && list.github?.path)
  return localFiles && !!list?.filePath
}

// `storage` with list `id` shown.
export function activateList(storage, id) {
  const { lists, active } = listsOf(storage)
  const target = lists.find(l => l.id === id)
  if (!target || id === active) return { ...storage, lists, active }
  return {
    ...storage,
    adapter: target.adapter,
    filePath: target.filePath,
    ...(target.adapter === 'github' ? { github: target.github } : {}),
    // Band files (the old multi-band mode) belong to the list they were made
    // for; another list is one CSV.
    multiBand: { ...(storage.multiBand || {}), enabled: false },
    lists,
    active: id,
  }
}

// Whether two storages show the same list from the same place — what decides
// that the list has to be loaded again. Names and the other lists don't.
export function sameSource(a, b) {
  const key = s => JSON.stringify([sourceOf(s), !!s?.multiBand?.enabled, s?.multiBand?.dir || ''])
  return key(a) === key(b)
}
