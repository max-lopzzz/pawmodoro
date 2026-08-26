// ── Room panel toggle ──────────────────────────

var elBtnRoom      = document.getElementById('btn-room')
var elBtnRoomClose = document.getElementById('btn-room-close')
var elRoomPanel    = document.getElementById('room-panel')

elBtnRoom.addEventListener('click', function () {
  document.getElementById('settings-panel').classList.remove('visible')
  elRoomPanel.classList.add('visible')
})

elBtnRoomClose.addEventListener('click', function () {
  elRoomPanel.classList.remove('visible')
})

// ── Supabase client ─────────────────────────────

var supabaseClient = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY)

// ── Room state ──────────────────────────────────

var roomState = {
  roomId: null,
  joinCode: null,
  channel: null,
  nickname: '',
  isAway: false,
  lastStatus: null,
  timerRow: null,
  tickInterval: null,
  celebratedFor: null
}

// ── DOM refs (room feature) ─────────────────────

var elInputNickname    = document.getElementById('input-nickname')
var elBtnRoomCreate    = document.getElementById('btn-room-create')
var elInputJoinCode    = document.getElementById('input-join-code')
var elBtnRoomJoin      = document.getElementById('btn-room-join')
var elRoomError        = document.getElementById('room-error')
var elRoomCodeValue    = document.getElementById('room-code-value')
var elRoomParticipants = document.getElementById('room-participants')
var elBtnRoomLeave     = document.getElementById('btn-room-leave')

// ── Nickname persistence ────────────────────────

elInputNickname.value = localStorage.getItem('room-nickname') || ''

function getNickname() {
  var name = elInputNickname.value.trim()
  return name || 'Anonymous'
}

// ── Auth bootstrap ──────────────────────────────

function ensureAnonSession() {
  return supabaseClient.auth.getSession().then(function (result) {
    if (result.data.session) return result.data.session
    return supabaseClient.auth.signInAnonymously().then(function (signInResult) {
      if (signInResult.error || !signInResult.data.session) {
        throw signInResult.error || new Error('No session returned')
      }
      return signInResult.data.session
    })
  })
}

// ── Errors ───────────────────────────────────────

function showRoomError(message) {
  elRoomError.textContent = message
}

function clearRoomError() {
  elRoomError.textContent = ''
}

// ── Status tracking ──────────────────────────────

function currentStatus() {
  return deriveStatus(state.timerState, state.sessionType, roomState.isAway)
}

function trackPresence() {
  if (!roomState.channel) return
  roomState.channel.track({ nickname: roomState.nickname, status: currentStatus() })
}

function updateRoomStatus() {
  if (!roomState.channel) return
  var status = currentStatus()
  if (status === roomState.lastStatus) return
  roomState.lastStatus = status
  trackPresence()
}

document.addEventListener('visibilitychange', function () {
  roomState.isAway = document.hidden
  updateRoomStatus()
})

window.addEventListener('blur', function () {
  roomState.isAway = true
  updateRoomStatus()
})

window.addEventListener('focus', function () {
  roomState.isAway = false
  updateRoomStatus()
})

// ── Presence rendering ──────────────────────────

var STATUS_LABELS = { focusing: 'Focusing', break: 'On Break', idle: 'Idle', away: 'Away' }

function renderParticipants() {
  if (!roomState.channel) return
  var presenceState = roomState.channel.presenceState()
  elRoomParticipants.innerHTML = ''
  Object.keys(presenceState).forEach(function (key) {
    var presences = presenceState[key]
    var presence = presences[presences.length - 1]
    var row = document.createElement('div')
    row.className = 'room-participant-row'
    var nameSpan = document.createElement('span')
    nameSpan.textContent = presence.nickname
    var statusSpan = document.createElement('span')
    statusSpan.textContent = STATUS_LABELS[presence.status] || presence.status
    row.appendChild(nameSpan)
    row.appendChild(statusSpan)
    elRoomParticipants.appendChild(row)
  })
}

// ── Timer sync ───────────────────────────────────

function applyRoomTimerRow(row) {
  var prev = roomState.timerRow
  var isAdvance = prev && prev.is_running &&
    row.phase !== prev.phase &&
    roomState.celebratedFor !== prev.started_at
  var completedPhase = prev ? prev.phase : null

  roomState.timerRow = row
  state.sessionType = row.phase
  state.completedWork = row.completed_work
  state.timerState = row.is_running ? 'running' : 'idle'
  state.secondsLeft = computeSecondsLeft({
    durationSeconds: row.duration_seconds,
    startedAt: row.started_at,
    isRunning: row.is_running
  }, Date.now())

  if (isAdvance) {
    roomState.celebratedFor = prev.started_at
    roomCelebrate(completedPhase)
  }

  render()
}

function roomIsActive() {
  return !!roomState.roomId
}

function roomSecondsLeft() {
  return computeSecondsLeft({
    durationSeconds: roomState.timerRow.duration_seconds,
    startedAt: roomState.timerRow.started_at,
    isRunning: roomState.timerRow.is_running
  }, Date.now())
}

function roomHandleStart() {
  var row = roomState.timerRow
  var updates
  if (row.is_running) {
    var remaining = computeSecondsLeft({
      durationSeconds: row.duration_seconds,
      startedAt: row.started_at,
      isRunning: true
    }, Date.now())
    updates = { duration_seconds: remaining, started_at: null, is_running: false }
  } else {
    updates = { started_at: new Date().toISOString(), is_running: true }
  }
  supabaseClient.from('rooms').update(updates).eq('id', roomState.roomId).then(function (result) {
    if (result.error) showRoomError('Could not update the timer. Try again.')
  })
}

function roomHandleReset() {
  var row = roomState.timerRow
  var duration = row.phase === 'work'
    ? getWorkDuration()
    : config[row.phase === 'short-break' ? 'shortBreak' : 'longBreak'] * 60
  supabaseClient.from('rooms')
    .update({ duration_seconds: duration, started_at: null, is_running: false })
    .eq('id', roomState.roomId)
    .then(function (result) {
      if (result.error) showRoomError('Could not update the timer. Try again.')
    })
}

function roomAttemptAdvance() {
  var row = roomState.timerRow
  var workDuration = getWorkDuration()
  var payload = computeAdvancePayload(
    { phase: row.phase, completedWork: row.completed_work },
    config,
    workDuration
  )
  supabaseClient.from('rooms')
    .update({
      phase: payload.phase,
      duration_seconds: payload.durationSeconds,
      started_at: new Date().toISOString(),
      is_running: true,
      completed_work: payload.completedWork
    })
    .eq('id', roomState.roomId)
    .eq('phase', row.phase)
    .eq('started_at', row.started_at)
    .then(function (result) {
      if (result.error) showRoomError('Could not update the timer. Try again.')
    })
}

function roomCelebrate(completedPhase) {
  if (completedPhase === 'work' && state.activeTaskId) {
    var tasks = loadTasks()
    tasks = addMinutes(tasks, state.activeTaskId, state.sessionWorkMinutes)
    saveTasks(tasks)
    if (typeof renderTodoPanel === 'function') renderTodoPanel()
  }
  playChime()
  showCelebration()
}

function onRoomSessionComplete() {
  roomState.celebratedFor = roomState.timerRow.started_at
  roomCelebrate(state.sessionType)
  roomAttemptAdvance()
}

// ── Create / Join / Leave ───────────────────────

function subscribeToRoom(roomId) {
  var channel = supabaseClient.channel('room:' + roomId, {
    config: { presence: { key: roomId + ':' + Math.random().toString(36).slice(2) } }
  })

  channel.on('presence', { event: 'sync' }, renderParticipants)

  channel.on('postgres_changes', {
    event: 'UPDATE',
    schema: 'public',
    table: 'rooms',
    filter: 'id=eq.' + roomId
  }, function (payload) {
    applyRoomTimerRow(payload.new)
  })

  channel.subscribe(function (status) {
    if (status === 'SUBSCRIBED') {
      roomState.channel = channel
      trackPresence()
      renderParticipants()
      clearRoomError()
    } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
      showRoomError('Room connection lost — leave and rejoin.')
    }
  })

  return channel
}

function enterRoom(row) {
  roomState.roomId = row.id
  roomState.joinCode = row.join_code
  roomState.nickname = getNickname()
  localStorage.setItem('room-nickname', roomState.nickname)
  clearInterval(state.interval)
  state.interval = null
  applyRoomTimerRow(row)
  subscribeToRoom(row.id)
  roomState.tickInterval = setInterval(tick, 1000)
  elRoomCodeValue.textContent = row.join_code
  elRoomPanel.classList.add('in-room')
  clearRoomError()
  markFreeTrialUsed()
}

elBtnRoomCreate.addEventListener('click', function () {
  clearRoomError()
  ensureAnonSession().then(function (session) {
    return ensureRoomAccess(session.user.id).then(function (allowed) {
      if (!allowed) return
      var code = generateJoinCode()
      return supabaseClient.from('rooms').insert({ join_code: code }).select().single().then(function (result) {
        if (result.error) {
          showRoomError('Could not create room. Try again.')
          return
        }
        enterRoom(result.data)
      })
    })
  }).catch(function () {
    showRoomError('Could not connect. Check your connection.')
  })
})

elBtnRoomJoin.addEventListener('click', function () {
  clearRoomError()
  var code = elInputJoinCode.value.trim().toUpperCase()
  if (!code) return
  ensureAnonSession().then(function (session) {
    return ensureRoomAccess(session.user.id).then(function (allowed) {
      if (!allowed) return
      return supabaseClient.from('rooms').select().eq('join_code', code).single().then(function (result) {
        if (result.error || !result.data) {
          showRoomError('Room not found.')
          return
        }
        enterRoom(result.data)
      })
    })
  }).catch(function () {
    showRoomError('Could not connect. Check your connection.')
  })
})

elBtnRoomLeave.addEventListener('click', function () {
  if (roomState.channel) {
    supabaseClient.removeChannel(roomState.channel)
  }
  if (roomState.tickInterval) {
    clearInterval(roomState.tickInterval)
  }
  roomState.roomId = null
  roomState.joinCode = null
  roomState.channel = null
  roomState.lastStatus = null
  roomState.timerRow = null
  roomState.tickInterval = null
  roomState.celebratedFor = null
  elRoomParticipants.innerHTML = ''
  elRoomPanel.classList.remove('in-room')

  state.sessionType = 'work'
  state.secondsLeft = config.work * 60
  state.completedWork = 0
  state.timerState = 'idle'
  render()
})
