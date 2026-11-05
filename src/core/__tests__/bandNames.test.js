import { describe, it, expect } from 'vitest'
import { bandsNamed, bandOfMessage, textOfSource } from '../bandNames.js'

const BANDS = ['Almost Natural', 'Trillmann', 'Just Another Foundry', 'AN']

describe('bandsNamed', () => {
  it('ignores case, spacing and punctuation', () => {
    expect(bandsNamed('Anfrage: ALMOST-NATURAL live', BANDS)).toEqual(['Almost Natural'])
    expect(bandsNamed('justanotherfoundry 2027', BANDS)).toEqual(['Just Another Foundry'])
  })
  it('finds a short name only as a word of its own', () => {
    expect(bandsNamed('Anfrage Konzert', BANDS)).toEqual([])
    expect(bandsNamed('Anfrage AN 2027', BANDS)).toEqual(['AN'])
  })
  it('does not guess at a misspelling', () => {
    expect(bandsNamed('Trilmann Tour', BANDS)).toEqual([])
  })
})

describe('bandOfMessage', () => {
  it('takes the subject first, then the text, and only one band', () => {
    expect(bandOfMessage({ subject: 'Trillmann 2027', text: 'Almost Natural' }, BANDS)).toBe('Trillmann')
    expect(bandOfMessage({ subject: 'Anfrage', text: 'mit Trillmann' }, BANDS)).toBe('Trillmann')
    expect(bandOfMessage({ subject: 'Trillmann & Almost Natural' }, BANDS)).toBe(null)
    expect(bandOfMessage({ subject: 'Anfrage', text: 'Hallo' }, BANDS)).toBe(null)
  })
})

describe('textOfSource', () => {
  it('reads quoted-printable and base64 parts', () => {
    const qp = 'Content-Transfer-Encoding: quoted-printable\r\n\r\n<p>Liebe Gr=C3=BC=\r\nsse, Trill=\r\nmann</p>'
    expect(textOfSource(qp)).toMatch(/Grüsse, Trillmann/)
    const b64 = Buffer.from('Hallo, hier ist Almost Natural mit einer Anfrage für 2027.').toString('base64')
    expect(textOfSource(`Content-Transfer-Encoding: base64\r\n\r\n${b64}\r\n`)).toMatch(/Almost Natural/)
  })
})
