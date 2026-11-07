import { useState, useEffect, useRef, useContext } from 'react'
import RelDate from './RelDate'
import DateInput from './DateInput'
import Busy from './Busy'
import { lastReplyColor } from '@core/dateColors'
import { displayDateText, normalizeDateText } from '@core/parseDate'
import { parseReplyStatus, composeReplyStatus } from '@core/replyStatus'
import { ReplyIcon, AutoReplyIcon, PencilIcon } from './icons'
import { MailContext } from '../lib/mailHistory'
import { useDateOrder } from '../lib/dateOrder'
import { t, useT } from '../i18n'

// Used in the table's Reply Status column and the venue panel.
// The Reply Status kind reads as a recorded fact (a tinted badge with an inbound
// icon), deliberately unlike the additive +pills of the Outreach action column.
// Same palette as the row tint (see lib/health.js) so the badge and the colour of
// the row it sits in never tell different stories.
const REPLY_BADGE = {
  reply: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300',
  'auto-reply': 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
  none: 'border border-dashed border-gray-300 text-gray-400 dark:border-gray-600 dark:text-gray-500',
}
const REPLY_LABEL = { reply: () => t('replied'), 'auto-reply': () => t('auto-reply'), none: () => t('no reply') }
const REPLY_ICON = { reply: ReplyIcon, 'auto-reply': AutoReplyIcon, none: null }
// Last-reply editor: the reply date (typed or picked) with its countdown on top, the
// reply kind (dropdown) underneath. Both recompose the single `Status` CSV field.
// With a mailbox to ask (MailContext.ready), clicking the date opens the email
// it stands for and the pencil beside it edits; a date no email matches (typed
// by hand, say) is edited on click as before.
export default function ReplyStatusCell({ rowIndex, value, email, edits, onEdit }) {
  const t = useT()
  const mail = useContext(MailContext)
  useDateOrder()
  const [opening, setOpening] = useState(false)
  const raw = edits[rowIndex]?.['Status'] ?? value ?? ''
  const { kind, dateStr } = parseReplyStatus(raw)
  const isEdited = edits[rowIndex]?.['Status'] !== undefined
  const [editingDate, setEditingDate] = useState(false)
  const [editingKind, setEditingKind] = useState(false)
  const kindRef = useRef(null)
  useEffect(() => { if (editingKind && kindRef.current) kindRef.current.focus() }, [editingKind])

  function commitDate(text) {
    setEditingDate(false)
    if (text === normalizeDateText(dateStr)) return
    // Setting a date on an uncategorised row implies a real reply.
    const nextKind = kind === 'none' && text ? 'reply' : kind
    onEdit(rowIndex, 'Status', composeReplyStatus(nextKind, text))
  }
  function commitKind(e) {
    setEditingKind(false)
    onEdit(rowIndex, 'Status', composeReplyStatus(e.target.value, dateStr))
  }

  const colorFn = kind === 'auto-reply' ? () => 'text-gray-400' : lastReplyColor
  const KindIcon = REPLY_ICON[kind]
  return (
    <div className={`space-y-1 min-w-[8rem] rounded px-1 -mx-1 ${isEdited ? 'bg-amber-50 ring-1 ring-amber-300 dark:bg-amber-900/20 dark:ring-amber-700' : ''}`}>
      {editingDate ? (
        <DateInput
          value={dateStr}
          autoFocus
          onCommit={commitDate}
          onCancel={() => setEditingDate(false)}
          className="w-24 rounded border border-indigo-400 dark:border-indigo-600 bg-white dark:bg-gray-700 dark:text-gray-100 px-1.5 py-0.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-300"
        />
      ) : (
        <div className="group/reply flex items-start gap-1">
          <div
            onClick={async e => {
              e.stopPropagation()
              if (!(mail.ready && dateStr && email.trim()) || opening) { setEditingDate(true); return }
              setOpening(true)
              const opened = await mail.openReply(email, dateStr).catch(() => false)
              setOpening(false)
              if (!opened) setEditingDate(true)
            }}
            className={`${mail.ready && dateStr ? 'cursor-pointer' : 'cursor-text'} hover:bg-gray-100 dark:hover:bg-gray-700 rounded px-1 -mx-1`}
            title={mail.ready && dateStr ? t('Click to read this reply') : t("Click to set the reply date")}
          >
            {dateStr ? (
              <div className="leading-tight">
                <span className="text-xs text-gray-600 dark:text-gray-300">{opening ? <Busy label={t('Opening…')} /> : displayDateText(dateStr)}</span>
                <div><RelDate raw={dateStr} colorFn={colorFn} /></div>
              </div>
            ) : (
              <span className="text-gray-300 dark:text-gray-600 text-xs">{t("— set date —")}</span>
            )}
          </div>
          {mail.ready && dateStr && (
            <button type="button" onClick={e => { e.stopPropagation(); setEditingDate(true) }}
              title={t('Edit date')} aria-label={t('Edit date')}
              className="shrink-0 mt-0.5 p-0.5 rounded text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 opacity-0 group-hover/reply:opacity-100 focus:opacity-100 [@media(hover:none)]:opacity-100">
              <PencilIcon className="w-3 h-3" />
            </button>
          )}
        </div>
      )}
      {editingKind ? (
        <select
          ref={kindRef}
          value={kind}
          onChange={commitKind}
          onBlur={() => setEditingKind(false)}
          onClick={e => e.stopPropagation()}
          className="rounded border border-indigo-400 dark:border-indigo-600 bg-white dark:bg-gray-700 dark:text-gray-100 px-1 py-0.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-300"
        >
          <option value="none">{t("— no reply —")}</option>
          <option value="reply">{t("replied")}</option>
          <option value="auto-reply">{t("auto-reply")}</option>
        </select>
      ) : (
        <button
          onClick={e => { e.stopPropagation(); setEditingKind(true) }}
          title={t("Click to change the reply type")}
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap transition-colors hover:opacity-80 ${REPLY_BADGE[kind]}`}
        >
          {KindIcon && <KindIcon className="w-3 h-3 shrink-0" />}
          {REPLY_LABEL[kind]()}
        </button>
      )}
    </div>
  )
}

