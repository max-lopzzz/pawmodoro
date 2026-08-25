const {
  formatTime,
  getNextSession,
  getAmbientGif,
  pickCelebrationGif,
  getAccentColor,
  getDarkAccentColor,
  CELEBRATION_GIFS
} = require('../renderer/timer-logic')

const defaultConfig = {
  work: 25,
  shortBreak: 5,
  longBreak: 30,
  sessionsBeforeLongBreak: 4
}

describe('formatTime', () => {
  test('formats full minutes', () => {
    expect(formatTime(1500)).toBe('25:00')
  })
  test('formats with leading zero on seconds', () => {
    expect(formatTime(65)).toBe('01:05')
  })
  test('formats zero', () => {
    expect(formatTime(0)).toBe('00:00')
  })
})

describe('getNextSession', () => {
  test('after work session goes to short break (not last in cycle)', () => {
    const next = getNextSession('work', 1, defaultConfig)
    expect(next).toEqual({ type: 'short-break', duration: 5 * 60 })
  })
  test('after work session goes to long break (last in cycle)', () => {
    const next = getNextSession('work', 4, defaultConfig)
    expect(next).toEqual({ type: 'long-break', duration: 30 * 60 })
  })
  test('after short break goes to work', () => {
    const next = getNextSession('short-break', 1, defaultConfig)
    expect(next).toEqual({ type: 'work', duration: 25 * 60 })
  })
  test('after long break goes to work', () => {
    const next = getNextSession('long-break', 4, defaultConfig)
    expect(next).toEqual({ type: 'work', duration: 25 * 60 })
  })
})

describe('getAmbientGif', () => {
  test('returns idle gif when timerState is idle', () => {
    expect(getAmbientGif('work', 'idle')).toBe('Cat Idle.gif')
  })
  test('returns idle gif when timerState is complete', () => {
    expect(getAmbientGif('work', 'complete')).toBe('Cat Idle.gif')
  })
  test('returns working gif for work+running', () => {
    expect(getAmbientGif('work', 'running')).toBe('Cat Working.gif')
  })
  test('returns idle gif for work+paused', () => {
    expect(getAmbientGif('work', 'paused')).toBe('Cat Idle.gif')
  })
  test('returns resting gif for short-break', () => {
    expect(getAmbientGif('short-break', 'running')).toBe('Cat Resting.gif')
  })
  test('returns resting gif for long-break', () => {
    expect(getAmbientGif('long-break', 'running')).toBe('Cat Resting.gif')
  })
})

describe('pickCelebrationGif', () => {
  test('returns a string from CELEBRATION_GIFS', () => {
    const gif = pickCelebrationGif()
    expect(CELEBRATION_GIFS).toContain(gif)
  })
})

describe('getAccentColor', () => {
  test('work returns olive', () => {
    expect(getAccentColor('work')).toBe('#738122')
  })
  test('short-break returns blue', () => {
    expect(getAccentColor('short-break')).toBe('#4A5CD0')
  })
  test('long-break returns red', () => {
    expect(getAccentColor('long-break')).toBe('#C62A33')
  })
})

describe('getDarkAccentColor', () => {
  test('work returns bright olive', () => {
    expect(getDarkAccentColor('work')).toBe('#95A82B')
  })
  test('short-break returns bright blue', () => {
    expect(getDarkAccentColor('short-break')).toBe('#6A7FE8')
  })
  test('long-break returns bright red', () => {
    expect(getDarkAccentColor('long-break')).toBe('#E8434E')
  })
})
