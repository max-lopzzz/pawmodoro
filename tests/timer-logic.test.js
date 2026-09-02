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
  test('returns idle gif when timerState is idle (cat)', () => {
    expect(getAmbientGif('work', 'idle', 'cat')).toBe('Cat Idle.gif')
  })
  test('returns idle gif when timerState is complete (cat)', () => {
    expect(getAmbientGif('work', 'complete', 'cat')).toBe('Cat Idle.gif')
  })
  test('returns working gif for work+running (cat)', () => {
    expect(getAmbientGif('work', 'running', 'cat')).toBe('Cat Working.gif')
  })
  test('returns idle gif for work+paused (cat)', () => {
    expect(getAmbientGif('work', 'paused', 'cat')).toBe('Cat Idle.gif')
  })
  test('returns resting gif for short-break (cat)', () => {
    expect(getAmbientGif('short-break', 'running', 'cat')).toBe('Cat Resting.gif')
  })
  test('returns resting gif for long-break (cat)', () => {
    expect(getAmbientGif('long-break', 'running', 'cat')).toBe('Cat Resting.gif')
  })
  test('returns the correct dog gif for every state', () => {
    expect(getAmbientGif('work', 'idle', 'dog')).toBe('Perrito Idle.GIF')
    expect(getAmbientGif('work', 'complete', 'dog')).toBe('Perrito Idle.GIF')
    expect(getAmbientGif('work', 'running', 'dog')).toBe('Perrito Estudiando.GIF')
    expect(getAmbientGif('work', 'paused', 'dog')).toBe('Perrito Idle.GIF')
    expect(getAmbientGif('short-break', 'running', 'dog')).toBe('Perrito Descansando.GIF')
    expect(getAmbientGif('long-break', 'running', 'dog')).toBe('Perrito Descansando.GIF')
  })
  test('returns the correct rabbit gif for every state', () => {
    expect(getAmbientGif('work', 'idle', 'rabbit')).toBe('Conejito Idle.GIF')
    expect(getAmbientGif('work', 'complete', 'rabbit')).toBe('Conejito Idle.GIF')
    expect(getAmbientGif('work', 'running', 'rabbit')).toBe('Conejito trabajando.GIF')
    expect(getAmbientGif('work', 'paused', 'rabbit')).toBe('Conejito Idle.GIF')
    expect(getAmbientGif('short-break', 'running', 'rabbit')).toBe('Conejito Descansando.GIF')
    expect(getAmbientGif('long-break', 'running', 'rabbit')).toBe('Conejito Descansando.GIF')
  })
})

describe('pickCelebrationGif', () => {
  test('returns a cat gif from CELEBRATION_GIFS.cat', () => {
    const gif = pickCelebrationGif('cat')
    expect(CELEBRATION_GIFS.cat).toContain(gif)
  })
  test('returns a dog gif from CELEBRATION_GIFS.dog', () => {
    const gif = pickCelebrationGif('dog')
    expect(CELEBRATION_GIFS.dog).toContain(gif)
  })
  test('returns a rabbit gif from CELEBRATION_GIFS.rabbit', () => {
    const gif = pickCelebrationGif('rabbit')
    expect(CELEBRATION_GIFS.rabbit).toContain(gif)
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
