var AMBIENT_GIFS = {
  idle: 'Wake Up Art Sticker.gif',
  'work-running': 'Running.gif',
  'work-paused': 'Confused Wait What Sticker.gif',
  'short-break': 'Cat Lick Sticker.gif',
  'long-break': 'Cat Camping Sticker.gif'
}

var CELEBRATION_GIFS = [
  'Cat Hooray Sticker.gif',
  'Cat Party Sticker.gif',
  'Happy Dance Sticker.gif',
  'Standing Ovation Applause Sticker.gif',
  'Cat Clap Sticker.gif',
  'Table Clap.gif',
  'Cat Wow Sticker.gif'
]

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

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    formatTime,
    getNextSession,
    getAmbientGif,
    pickCelebrationGif,
    getAccentColor,
    AMBIENT_GIFS,
    CELEBRATION_GIFS
  }
}
