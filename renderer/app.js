// ── Config persistence ─────────────────────────

function loadConfig() {
  return {
    work: parseInt(localStorage.getItem('cfg-work') || '25', 10),
    shortBreak: parseInt(localStorage.getItem('cfg-shortBreak') || '5', 10),
    longBreak: parseInt(localStorage.getItem('cfg-longBreak') || '30', 10),
    sessionsBeforeLongBreak: parseInt(localStorage.getItem('cfg-sessions') || '4', 10)
  }
}

function saveConfig(config) {
  localStorage.setItem('cfg-work', config.work)
  localStorage.setItem('cfg-shortBreak', config.shortBreak)
  localStorage.setItem('cfg-longBreak', config.longBreak)
  localStorage.setItem('cfg-sessions', config.sessionsBeforeLongBreak)
}

function loadTasks() {
  try { return JSON.parse(localStorage.getItem('todo-tasks') || '[]') }
  catch (e) { return [] }
}

function saveTasks(tasks) {
  localStorage.setItem('todo-tasks', JSON.stringify(tasks))
}

var _mqListener = null

function attachMqListener() {
  var mq = window.matchMedia('(prefers-color-scheme: dark)')
  if (_mqListener) mq.removeEventListener('change', _mqListener)
  _mqListener = function (e) {
    if (!localStorage.getItem('theme-override')) applyTheme(e.matches ? 'dark' : 'light')
  }
  mq.addEventListener('change', _mqListener)
}

function applyTheme(mode) {
  if (mode === 'dark') document.body.classList.add('dark')
  else document.body.classList.remove('dark')
  render()
}

function initTheme() {
  var override = localStorage.getItem('theme-override')
  if (override === 'dark' || override === 'light') {
    applyTheme(override)
  } else {
    var mq = window.matchMedia('(prefers-color-scheme: dark)')
    applyTheme(mq.matches ? 'dark' : 'light')
    attachMqListener()
  }
}

// ── Audio context (reused across chimes) ───────

var _audioCtx = null
function getAudioCtx() {
  if (!_audioCtx || _audioCtx.state === 'closed') {
    _audioCtx = new AudioContext()
  }
  return _audioCtx
}

// ── State ──────────────────────────────────────

var config = loadConfig()

var state = {
  timerState: 'idle',       // idle | running | paused | complete
  sessionType: 'work',      // work | short-break | long-break
  secondsLeft: config.work * 60,
  completedWork: 0,
  interval: null,
  activeTaskId: null,
  sessionWorkMinutes: config.work
}

// ── DOM refs ───────────────────────────────────

var elTimer        = document.getElementById('timer-display')
var elLabel        = document.getElementById('session-label')
var elCatAmbient   = document.getElementById('cat-ambient')
var elDots         = document.getElementById('session-dots')
var elBtnStart     = document.getElementById('btn-start')
var elBtnReset     = document.getElementById('btn-reset')
var elBtnSettings  = document.getElementById('btn-settings')
var elBtnSetClose  = document.getElementById('btn-settings-close')
var elBtnSave      = document.getElementById('btn-save')
var elBtnMinimize  = document.getElementById('btn-minimize')
var elBtnClose     = document.getElementById('btn-close')
var elOverlay      = document.getElementById('overlay-celebration')
var elCatCelebr    = document.getElementById('cat-celebration')
var elSettingsPanel = document.getElementById('settings-panel')
var elInputWork    = document.getElementById('input-work')
var elInputShort   = document.getElementById('input-short-break')
var elInputLong    = document.getElementById('input-long-break')
var elInputSessions = document.getElementById('input-sessions')
var elActiveTaskLabel = document.getElementById('active-task-label')
var elThemeSelect     = document.getElementById('select-theme')

// ── Work duration ──────────────────────────────

function getWorkDuration() {
  if (state.activeTaskId) {
    var tasks = loadTasks()
    var task = findTask(tasks, state.activeTaskId)
    if (task && task.estimatedMinutes) {
      var remaining = task.estimatedMinutes - task.loggedMinutes
      if (remaining > 0) return remaining * 60
    }
  }
  return config.work * 60
}

// ── Render ─────────────────────────────────────

function render() {
  // Timer text
  elTimer.textContent = formatTime(state.secondsLeft)

  // Session label
  var labels = { work: 'Focus', 'short-break': 'Short Break', 'long-break': 'Long Break' }
  elLabel.textContent = labels[state.sessionType]

  // Accent color — use dark variants when dark mode active
  var accent = document.body.classList.contains('dark')
    ? getDarkAccentColor(state.sessionType)
    : getAccentColor(state.sessionType)
  document.documentElement.style.setProperty('--accent', accent)
  elBtnStart.style.background = accent

  // Start/Pause button label
  elBtnStart.textContent = state.timerState === 'running' ? 'Pause' : 'Start'

  // Ambient cat GIF
  var gifFile = getAmbientGif(state.sessionType, state.timerState)
  var newSrc = '../assets/' + gifFile
  if (elCatAmbient.getAttribute('src') !== newSrc) {
    elCatAmbient.src = newSrc
  }

  // Session dots
  var n = config.sessionsBeforeLongBreak
  var completed = state.completedWork % n
  elDots.innerHTML = ''
  for (var i = 0; i < n; i++) {
    var dot = document.createElement('span')
    dot.className = 'dot' + (i < completed ? ' filled' : '')
    elDots.appendChild(dot)
  }

  // Active task label
  var activeTask = state.activeTaskId ? findTask(loadTasks(), state.activeTaskId) : null
  if (elActiveTaskLabel) {
    elActiveTaskLabel.textContent = activeTask ? '\u2192 ' + activeTask.name : ''
    elActiveTaskLabel.style.display = activeTask ? 'block' : 'none'
  }
}

// ── Chime ──────────────────────────────────────

function playChime() {
  try {
    var ctx = getAudioCtx()
    function playNote(freq, startTime, duration) {
      var osc = ctx.createOscillator()
      var gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.frequency.value = freq
      osc.type = 'sine'
      gain.gain.setValueAtTime(0, startTime)
      gain.gain.linearRampToValueAtTime(0.3, startTime + 0.05)
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration)
      osc.start(startTime)
      osc.stop(startTime + duration)
    }
    playNote(880, ctx.currentTime, 0.5)
    playNote(660, ctx.currentTime + 0.25, 0.6)
  } catch (e) {
    // AudioContext unavailable — silently skip
  }
}

// ── Session complete ───────────────────────────

function onSessionComplete() {
  clearInterval(state.interval)
  state.interval = null
  state.timerState = 'complete'

  if (state.sessionType === 'work') {
    state.completedWork += 1
    if (state.activeTaskId) {
      var tasks = loadTasks()
      tasks = addMinutes(tasks, state.activeTaskId, state.sessionWorkMinutes)
      saveTasks(tasks)
      if (typeof renderTodoPanel === 'function') renderTodoPanel()
    }
  }

  playChime()
  showCelebration()
}

function showCelebration() {
  var gif = pickCelebrationGif()
  elCatCelebr.src = '../assets/' + gif
  elOverlay.classList.add('visible')

  var dismissed = false

  function hideCelebration() {
    if (dismissed) return
    dismissed = true
    clearTimeout(timeout)
    elOverlay.classList.remove('visible')
    advanceSession()
  }

  var timeout = setTimeout(hideCelebration, 3500)
  elOverlay.addEventListener('click', hideCelebration, { once: true })
}

function advanceSession() {
  var next = getNextSession(state.sessionType, state.completedWork, config)
  state.sessionType = next.type
  state.secondsLeft = next.type === 'work' ? getWorkDuration() : next.duration
  state.timerState = 'idle'
  render()
}

// ── Timer tick ─────────────────────────────────

function tick() {
  if (state.secondsLeft <= 0) {
    onSessionComplete()
    render()
    return
  }
  state.secondsLeft -= 1
  render()
}

// ── Controls ───────────────────────────────────

elBtnStart.addEventListener('click', function () {
  if (state.timerState === 'complete') return
  if (state.timerState === 'running') {
    clearInterval(state.interval)
    state.interval = null
    state.timerState = 'paused'
  } else {
    if (state.sessionType === 'work' && state.timerState === 'idle') {
      state.sessionWorkMinutes = Math.round(state.secondsLeft / 60)
    }
    state.timerState = 'running'
    state.interval = setInterval(tick, 1000)
  }
  render()
})

elBtnReset.addEventListener('click', function () {
  clearInterval(state.interval)
  state.interval = null
  state.timerState = 'idle'
  state.secondsLeft = state.sessionType === 'work'
    ? getWorkDuration()
    : config[state.sessionType === 'short-break' ? 'shortBreak' : 'longBreak'] * 60
  render()
})

// ── Settings ───────────────────────────────────

elBtnSettings.addEventListener('click', function () {
  elInputWork.value = config.work
  elInputShort.value = config.shortBreak
  elInputLong.value = config.longBreak
  elInputSessions.value = config.sessionsBeforeLongBreak
  elThemeSelect.value = localStorage.getItem('theme-override') || 'auto'
  document.getElementById('room-panel').classList.remove('visible')
  elSettingsPanel.classList.add('visible')
})

elBtnSetClose.addEventListener('click', function () {
  elSettingsPanel.classList.remove('visible')
})

elBtnSave.addEventListener('click', function () {
  var newWork = Math.max(1, parseInt(elInputWork.value, 10) || 0)
  var newShort = Math.max(1, parseInt(elInputShort.value, 10) || 0)
  var newLong = Math.max(1, parseInt(elInputLong.value, 10) || 0)
  var newSessions = Math.max(1, parseInt(elInputSessions.value, 10) || 0)

  config = { work: newWork, shortBreak: newShort, longBreak: newLong, sessionsBeforeLongBreak: newSessions }
  saveConfig(config)

  // Reset timer to idle with new config
  clearInterval(state.interval)
  state.interval = null
  state.timerState = 'idle'
  state.sessionType = 'work'
  state.secondsLeft = config.work * 60
  state.completedWork = 0

  elSettingsPanel.classList.remove('visible')
  render()
})

// ── Window controls ────────────────────────────

elBtnMinimize.addEventListener('click', function () {
  window.platformControls.minimize()
})

elBtnClose.addEventListener('click', function () {
  window.platformControls.close()
})

elThemeSelect.addEventListener('change', function () {
  var val = elThemeSelect.value
  if (val === 'auto') {
    localStorage.removeItem('theme-override')
    var mq = window.matchMedia('(prefers-color-scheme: dark)')
    applyTheme(mq.matches ? 'dark' : 'light')
    attachMqListener()
  } else {
    localStorage.setItem('theme-override', val)
    applyTheme(val)
  }
})

// ── Init ───────────────────────────────────────

// Must stay last: render() depends on findTask/addMinutes from todo-logic.js
initTheme()
