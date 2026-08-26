const {
  generateJoinCode,
  deriveStatus,
  computeSecondsLeft,
  computeAdvancePayload,
  shouldFlagOverworking,
  canNudge,
  JOIN_CODE_ALPHABET,
  JOIN_CODE_LENGTH
} = require('../renderer/rooms-logic')

describe('generateJoinCode', () => {
  test('generates a code of the expected length', () => {
    var code = generateJoinCode()
    expect(code.length).toBe(JOIN_CODE_LENGTH)
  })

  test('only uses characters from the safe alphabet', () => {
    var code = generateJoinCode()
    for (var i = 0; i < code.length; i++) {
      expect(JOIN_CODE_ALPHABET.indexOf(code.charAt(i))).toBeGreaterThanOrEqual(0)
    }
  })

  test('excludes ambiguous characters', () => {
    var code = generateJoinCode()
    expect(code).not.toMatch(/[0O1IL]/)
  })

  test('generates different codes across many calls', () => {
    var codes = {}
    for (var i = 0; i < 50; i++) codes[generateJoinCode()] = true
    expect(Object.keys(codes).length).toBeGreaterThan(1)
  })
})

describe('deriveStatus', () => {
  test('returns "away" when away, regardless of timer state', () => {
    expect(deriveStatus('running', 'work', true)).toBe('away')
    expect(deriveStatus('idle', 'work', true)).toBe('away')
  })

  test('returns "focusing" when running a work session', () => {
    expect(deriveStatus('running', 'work', false)).toBe('focusing')
  })

  test('returns "break" when running a short or long break', () => {
    expect(deriveStatus('running', 'short-break', false)).toBe('break')
    expect(deriveStatus('running', 'long-break', false)).toBe('break')
  })

  test('returns "idle" when paused', () => {
    expect(deriveStatus('paused', 'work', false)).toBe('idle')
  })

  test('returns "idle" when stopped or complete', () => {
    expect(deriveStatus('idle', 'work', false)).toBe('idle')
    expect(deriveStatus('complete', 'work', false)).toBe('idle')
  })
})

describe('computeSecondsLeft', () => {
  test('returns durationSeconds unchanged when not running', () => {
    expect(computeSecondsLeft({ durationSeconds: 100, startedAt: null, isRunning: false }, Date.now())).toBe(100)
  })

  test('counts down from durationSeconds based on elapsed time when running', () => {
    var now = Date.now()
    var startedAt = new Date(now - 10000).toISOString()
    expect(computeSecondsLeft({ durationSeconds: 100, startedAt: startedAt, isRunning: true }, now)).toBe(90)
  })

  test('can go negative once time is up (caller checks <= 0)', () => {
    var now = Date.now()
    var startedAt = new Date(now - 150000).toISOString()
    expect(computeSecondsLeft({ durationSeconds: 100, startedAt: startedAt, isRunning: true }, now)).toBe(-50)
  })
})

describe('computeAdvancePayload', () => {
  var config = { work: 25, shortBreak: 5, longBreak: 30, sessionsBeforeLongBreak: 4 }

  test('advances from work to short-break, incrementing completedWork', () => {
    var row = { phase: 'work', completedWork: 1 }
    var payload = computeAdvancePayload(row, config, 1500)
    expect(payload).toEqual({ phase: 'short-break', durationSeconds: 300, completedWork: 2 })
  })

  test('advances from work to long-break on the Nth session, incrementing completedWork', () => {
    var row = { phase: 'work', completedWork: 3 }
    var payload = computeAdvancePayload(row, config, 1500)
    expect(payload).toEqual({ phase: 'long-break', durationSeconds: 1800, completedWork: 4 })
  })

  test('advances from a break back to work, using the supplied work duration, completedWork unchanged', () => {
    var row = { phase: 'short-break', completedWork: 2 }
    var payload = computeAdvancePayload(row, config, 900)
    expect(payload).toEqual({ phase: 'work', durationSeconds: 900, completedWork: 2 })
  })
})

describe('shouldFlagOverworking', () => {
  test('returns false below the threshold', () => {
    expect(shouldFlagOverworking(0)).toBe(false)
    expect(shouldFlagOverworking(1)).toBe(false)
  })

  test('returns true at and above the threshold', () => {
    expect(shouldFlagOverworking(2)).toBe(true)
    expect(shouldFlagOverworking(5)).toBe(true)
  })
})

describe('canNudge', () => {
  test('returns true when no prior nudge has been sent', () => {
    expect(canNudge(null, Date.now(), 30000)).toBe(true)
    expect(canNudge(undefined, Date.now(), 30000)).toBe(true)
  })

  test('returns false within the cooldown window', () => {
    var now = Date.now()
    expect(canNudge(now - 10000, now, 30000)).toBe(false)
  })

  test('returns true once the cooldown window has elapsed', () => {
    var now = Date.now()
    expect(canNudge(now - 30000, now, 30000)).toBe(true)
    expect(canNudge(now - 40000, now, 30000)).toBe(true)
  })
})
