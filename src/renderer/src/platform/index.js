// The one seam between the UI and the platform it runs on. Everything the UI
// needs from outside the browser sandbox goes through `api`; everything one
// build can do and the other cannot is a flag in `caps`, so `grep caps.` lists
// every difference between the Mac app and the web app.
//
// `@platform` is an alias: electron.js in electron.vite.config.mjs, web.js in
// vite.web.config.mjs. Both export the same names; apiCoverage.test.js keeps
// web.js answering for every method the preload exposes.
export { api, caps } from '@platform'
