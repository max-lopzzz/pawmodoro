var AMBIENT_GIFS = {
  idle: 'Cat Idle.gif',
  'work-running': 'Cat Working.gif',
  'work-paused': 'Cat Idle.gif',
  'short-break': 'Cat Resting.gif',
  'long-break': 'Cat Resting.gif'
}

var CELEBRATION_GIFS = ['Cat Celebrating.gif']

function formatTime(seconds) {
  var m = Math.floor(seconds / 60)
  var s = seconds % 60
  return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0')
}

function getNextSession(currentType, completedWork, config) {
  if (currentType !== 'work') {
    return { type: 'work', duration: config.work * 60 }
  }
  if (completedWork % config.sessionsBeforeLongBreak === 0) {
    return { type: 'long-break', duration: config.longBreak * 60 }
  }
  return { type: 'short-break', duration: config.shortBreak * 60 }
}

function getAmbientGif(sessionType, timerState) {
  if (timerState === 'idle' || timerState === 'complete') {
    return AMBIENT_GIFS.idle
  }
  if (sessionType === 'work') {
    return timerState === 'paused' ? AMBIENT_GIFS['work-paused'] : AMBIENT_GIFS['work-running']
  }
  if (sessionType === 'short-break') return AMBIENT_GIFS['short-break']
  if (sessionType === 'long-break') return AMBIENT_GIFS['long-break']
  return AMBIENT_GIFS.idle
}

function pickCelebrationGif() {
  return CELEBRATION_GIFS[Math.floor(Math.random() * CELEBRATION_GIFS.length)]
}

function getAccentColor(sessionType) {
  if (sessionType === 'work') return '#738122'
  if (sessionType === 'short-break') return '#4A5CD0'
  return '#C62A33'
}

function getDarkAccentColor(sessionType) {
  if (sessionType === 'work') return '#95A82B'
  if (sessionType === 'short-break') return '#6A7FE8'
  return '#E8434E'
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    formatTime,
    getNextSession,
    getAmbientGif,
    pickCelebrationGif,
    getAccentColor,
    getDarkAccentColor,
    AMBIENT_GIFS,
    CELEBRATION_GIFS
  }
}
