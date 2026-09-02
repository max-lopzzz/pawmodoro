var AMBIENT_GIFS = {
  cat: {
    idle: 'Cat Idle.gif',
    'work-running': 'Cat Working.gif',
    'work-paused': 'Cat Idle.gif',
    'short-break': 'Cat Resting.gif',
    'long-break': 'Cat Resting.gif'
  },
  dog: {
    idle: 'Perrito Idle.GIF',
    'work-running': 'Perrito Estudiando.GIF',
    'work-paused': 'Perrito Idle.GIF',
    'short-break': 'Perrito Descansando.GIF',
    'long-break': 'Perrito Descansando.GIF'
  },
  rabbit: {
    idle: 'Conejito Idle.GIF',
    'work-running': 'Conejito trabajando.GIF',
    'work-paused': 'Conejito Idle.GIF',
    'short-break': 'Conejito Descansando.GIF',
    'long-break': 'Conejito Descansando.GIF'
  }
}

var CELEBRATION_GIFS = {
  cat: ['Cat Celebrating.gif'],
  dog: ['Perrito Celebrando.GIF'],
  rabbit: ['Conejito Celebrando.GIF']
}

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

function getAmbientGif(sessionType, timerState, skin) {
  var gifs = AMBIENT_GIFS[skin]
  if (timerState === 'idle' || timerState === 'complete') {
    return gifs.idle
  }
  if (sessionType === 'work') {
    return timerState === 'paused' ? gifs['work-paused'] : gifs['work-running']
  }
  if (sessionType === 'short-break') return gifs['short-break']
  if (sessionType === 'long-break') return gifs['long-break']
  return gifs.idle
}

function pickCelebrationGif(skin) {
  var gifs = CELEBRATION_GIFS[skin]
  return gifs[Math.floor(Math.random() * gifs.length)]
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
