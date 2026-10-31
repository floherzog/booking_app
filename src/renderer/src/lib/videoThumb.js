import { t } from '../i18n'
// A play button has to be drawn *into* the thumbnail, not layered over it with
// CSS: mail clients strip positioning, and absolutely-positioned overlays fall
// apart in Outlook and Gmail. Baking it in means the thumbnail is still just an
// ordinary inline image, which every client already renders correctly.
//
// The trade-off is that the badge is part of the saved asset, so turning the
// option on or off only affects videos inserted from then on.

// Where the badge goes, as pure arithmetic so it can be tested without a canvas.
// Proportional to the image, so a 1280px maxres and a 480px hq thumbnail come
// out looking the same once scaled to the 320px display width.
export function playBadgeGeometry(width, height) {
  const w = Math.max(1, Math.round(width))
  const h = Math.max(1, Math.round(height))
  // Roughly YouTube's own proportions.
  const badgeW = Math.round(w * 0.18)
  const badgeH = Math.round(badgeW * 0.7)
  const triangleH = Math.round(badgeH * 0.44)
  // An equilateral-ish triangle reads as a play glyph at any size.
  const triangleW = Math.round(triangleH * 0.85)
  return {
    badge: {
      x: Math.round((w - badgeW) / 2),
      y: Math.round((h - badgeH) / 2),
      width: badgeW,
      height: badgeH,
      radius: Math.round(badgeH * 0.22),
    },
    triangle: {
      // Nudged right by an eighth of its width: a centred triangle looks
      // off-centre to the eye because its mass sits on the left.
      x: Math.round((w - triangleW) / 2 + triangleW * 0.12),
      y: Math.round((h - triangleH) / 2),
      width: triangleW,
      height: triangleH,
    },
  }
}

// bytes → a JPEG Blob with the badge drawn on. The source arrives as raw bytes
// from main rather than as a booking-asset:// URL on purpose: a canvas that has
// drawn a cross-origin image is tainted and refuses toBlob(), whereas a blob:
// URL made here is same-origin.
export async function drawPlayBadge(bytes, mime = 'image/jpeg') {
  const bitmap = await createImageBitmap(new Blob([bytes], { type: mime }))
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height

  const ctx = canvas.getContext('2d')
  ctx.drawImage(bitmap, 0, 0)
  bitmap.close?.()

  const { badge, triangle } = playBadgeGeometry(canvas.width, canvas.height)

  ctx.fillStyle = 'rgba(0, 0, 0, 0.72)'
  ctx.beginPath()
  ctx.roundRect(badge.x, badge.y, badge.width, badge.height, badge.radius)
  ctx.fill()

  ctx.fillStyle = '#ffffff'
  ctx.beginPath()
  ctx.moveTo(triangle.x, triangle.y)
  ctx.lineTo(triangle.x + triangle.width, triangle.y + triangle.height / 2)
  ctx.lineTo(triangle.x, triangle.y + triangle.height)
  ctx.closePath()
  ctx.fill()

  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.92))
  if (!blob) throw new Error(t('Could not draw the play button onto the thumbnail.'))
  return blob
}

// The finished thumbnail, ready for templates:saveAsset. Falls back to the plain
// image if drawing fails for any reason — a video without a play badge is a far
// better outcome than a failed insert.
export async function buildThumbFile({ data, mime, playOverlay, name = 'video-thumb.jpg' }) {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data)
  if (!playOverlay) return new File([bytes], name, { type: mime || 'image/jpeg' })
  try {
    return new File([await drawPlayBadge(bytes, mime)], name, { type: 'image/jpeg' })
  } catch {
    return new File([bytes], name, { type: mime || 'image/jpeg' })
  }
}
