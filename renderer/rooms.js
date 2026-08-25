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
