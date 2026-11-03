import { describe, it, expect, vi } from 'vitest'

const api = vi.hoisted(() => ({ fetchOpenclawScript: vi.fn() }))
vi.mock('../../platform', () => ({ api }))
const { extractPolicy, diffPolicy, checkOpenclawPolicy } = await import('../policySync.js')

const script = `
def should_skip_by_note(note, follow_up):
    hard_stop = ["not this one"]

def policy_decision(last_emailed, follow_up, note, frequency=""):
    hold_override_days = 365
    hard_stop = [
        "anrufen", "call",
    ]
    wait_markers = ["warten", 'later']
    return "send", ""

def main():
    pass
`

describe('policySync', () => {
  it('reads the hold words and days from policy_decision only', () => {
    expect(extractPolicy(script)).toEqual({ keywords: ['anrufen', 'call', 'warten', 'later'], holdOverrideDays: 365 })
  })

  it('names which side holds what, or null when they agree', () => {
    const remote = { keywords: ['anrufen', 'call'], holdOverrideDays: 365 }
    expect(diffPolicy(remote, ['call', 'anrufen'], 365)).toBeNull()
    expect(diffPolicy(remote, ['anrufen', 'abgesagt'], 180)).toEqual({
      appOnly: ['abgesagt'], scriptOnly: ['call'], days: { script: 365, app: 180 },
    })
  })

  it('reads the script once per page load, then compares again as the Rules change', async () => {
    api.fetchOpenclawScript.mockResolvedValue(script)
    const settings = { openclaw: { repo: 'me/claw', path: 'scripts/x.py' } }
    const rules = { holdKeywords: ['anrufen', 'call', 'warten', 'later', 'abgesagt'], holdOverrideDays: 365 }
    expect((await checkOpenclawPolicy(settings, rules)).appOnly).toEqual(['abgesagt'])
    expect(await checkOpenclawPolicy(settings, { ...rules, holdKeywords: rules.holdKeywords.slice(0, 4) })).toBeNull()
    expect(api.fetchOpenclawScript).toHaveBeenCalledTimes(1)
    expect(await checkOpenclawPolicy({}, rules)).toBeNull()
  })
})
