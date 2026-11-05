import { generateHTML } from '@tiptap/html'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import { VideoLink } from './videoLink.js'

// Re-exported for convenience; it lives apart so the main process can use it
// without dragging TipTap in (see core/htmlText.js).
export { htmlToText } from './htmlText.js'

// One extension set for the editor and for rendering, so what you type is what
// the email contains. StarterKit v3 already ships Link and Underline.
export const EMAIL_EXTENSIONS = [
  StarterKit.configure({
    link: { openOnClick: false, autolink: true },
  }),
  Image,
  VideoLink,
]

// For editing a draft that is already in Mail (components/DraftEditor.jsx):
// its images arrive as data: URLs, which the image extension otherwise refuses.
export const DRAFT_EXTENSIONS = [
  ...EMAIL_EXTENSIONS.filter(e => e !== Image),
  Image.configure({ allowBase64: true }),
]

// Mail clients strip <style> blocks and ignore classes, so every rule an email
// needs has to be an inline attribute.
export const EMAIL_BODY_STYLE = 'margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;font-size:14px;line-height:1.5;color:#111827'
// Single-spaced, the way a hand-written mail reads: Enter starts the next line,
// a blank line is an empty paragraph. A margin here would double every gap.
export const P_STYLE = 'margin:0;line-height:1.5'
const A_STYLE = 'color:#4f46e5;text-decoration:underline'
const IMG_STYLE = 'max-width:100%;height:auto;display:block'
const UL_STYLE = 'margin:0 0 0 0;padding-left:22px'
const LI_STYLE = 'margin:0;line-height:1.5'
const VIDEO_LABEL_STYLE = 'display:inline-block;margin-top:6px;color:#4f46e5;text-decoration:underline'
// Roughly the width Apple Mail gives its own link previews.
export const VIDEO_THUMB_WIDTH = 320

// Add a style attribute to a tag that has none, or prepend to an existing one so
// author styling still wins.
function addStyle(tag, style) {
  if (/\sstyle="/.test(tag)) {
    return tag.replace(/\sstyle="/, ` style="${style};`)
  }
  return tag.replace(/^<(\w+)/, `<$1 style="${style}"`)
}

// How an inline asset is addressed in the finished HTML. An email refers to its
// attachments by Content-ID, which is meaningless to a browser — so the in-app
// preview overrides this to point back at the app's own asset scheme. Everything
// else about the rendering stays identical, which is the point of the preview.
export const cidAssetSrc = assetId => `cid:asset-${assetId}`
export const appAssetSrc = assetId => `booking-asset://${assetId}`

// bodyJSON (already placeholder-substituted) → an email-ready HTML document plus
// the inline assets it references. Each booking-asset://<id> becomes cid:asset-<id>;
// the caller (main, when building the MIME) attaches the matching files.
export function renderEmailHtml(bodyJSON, { assetSrc = cidAssetSrc } = {}) {
  const doc = bodyJSON || { type: 'doc', content: [] }
  let html = generateHTML(doc, EMAIL_EXTENSIONS)

  const cids = []
  html = html.replace(/<img\b[^>]*>/g, tag => {
    const m = tag.match(/src="booking-asset:\/\/([^"]+)"/)
    let out = tag
    if (m) {
      const assetId = m[1]
      const cid = `asset-${assetId}`
      if (!cids.some(c => c.cid === cid)) cids.push({ cid, assetId })
      out = out.replace(m[0], `src="${assetSrc(assetId)}"`)
    }
    // A width="N" attribute (the video thumbnail) becomes a matching CSS width,
    // so clients that ignore the attribute still size it the same.
    const w = out.match(/\swidth="(\d+)"/)
    return addStyle(out, w ? `width:${w[1]}px;${IMG_STYLE}` : IMG_STYLE)
  })

  html = html.replace(/<p\b[^>]*>/g, tag => addStyle(tag, P_STYLE))
  html = html.replace(/<(ul|ol)\b[^>]*>/g, tag => addStyle(tag, UL_STYLE))
  html = html.replace(/<li\b[^>]*>/g, tag => addStyle(tag, LI_STYLE))
  html = html.replace(/<a\b[^>]*>/g, tag => addStyle(tag, A_STYLE))
  html = html.replace(/<span class="booking-video-label"[^>]*>/g, tag => addStyle(tag, VIDEO_LABEL_STYLE))

  // An empty paragraph is a deliberate blank line. Several mail clients collapse
  // <p></p> to nothing, so give it something to hold the line open.
  html = html.replace(/(<p\b[^>]*>)(<\/p>)/g, '$1&nbsp;$2')

  return {
    html: `<!doctype html><html><body style="${EMAIL_BODY_STYLE}">${html}</body></html>`,
    // The same markup without the document wrapper, for rendering the live
    // preview inside the app (innerHTML would drop the wrapper anyway).
    bodyHtml: html,
    cids,
  }
}
