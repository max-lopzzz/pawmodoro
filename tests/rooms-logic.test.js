const {
  generateJoinCode,
  deriveStatus,
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
