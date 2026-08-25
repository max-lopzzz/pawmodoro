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
  lastStatus: null
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

// ── Create / Join / Leave ───────────────────────

function subscribeToRoom(roomId) {
  var channel = supabaseClient.channel('room:' + roomId, {
    config: { presence: { key: roomId + ':' + Math.random().toString(36).slice(2) } }
  })

  channel.on('presence', { event: 'sync' }, renderParticipants)

  channel.subscribe(function (status) {
    if (status === 'SUBSCRIBED') {
      roomState.channel = channel
      trackPresence()
      renderParticipants()
    }
  })

  return channel
}

function enterRoom(roomId, joinCode) {
  roomState.roomId = roomId
  roomState.joinCode = joinCode
  roomState.nickname = getNickname()
  localStorage.setItem('room-nickname', roomState.nickname)
  subscribeToRoom(roomId)
  elRoomCodeValue.textContent = joinCode
  elRoomPanel.classList.add('in-room')
  clearRoomError()
}

elBtnRoomCreate.addEventListener('click', function () {
  clearRoomError()
  ensureAnonSession().then(function () {
    var code = generateJoinCode()
    return supabaseClient.from('rooms').insert({ join_code: code }).select().single().then(function (result) {
      if (result.error) {
        showRoomError('Could not create room. Try again.')
        return
      }
      enterRoom(result.data.id, result.data.join_code)
    })
  }).catch(function () {
    showRoomError('Could not connect. Check your connection.')
  })
})

elBtnRoomJoin.addEventListener('click', function () {
  clearRoomError()
  var code = elInputJoinCode.value.trim().toUpperCase()
  if (!code) return
  ensureAnonSession().then(function () {
    return supabaseClient.from('rooms').select().eq('join_code', code).single().then(function (result) {
      if (result.error || !result.data) {
        showRoomError('Room not found.')
        return
      }
      enterRoom(result.data.id, result.data.join_code)
    })
  }).catch(function () {
    showRoomError('Could not connect. Check your connection.')
  })
})

elBtnRoomLeave.addEventListener('click', function () {
  if (roomState.channel) {
    supabaseClient.removeChannel(roomState.channel)
  }
  roomState.roomId = null
  roomState.joinCode = null
  roomState.channel = null
  roomState.lastStatus = null
  elRoomParticipants.innerHTML = ''
  elRoomPanel.classList.remove('in-room')
})
