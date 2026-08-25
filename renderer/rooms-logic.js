var JOIN_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
var JOIN_CODE_LENGTH = 6

function generateJoinCode() {
  var code = ''
  for (var i = 0; i < JOIN_CODE_LENGTH; i++) {
    code += JOIN_CODE_ALPHABET.charAt(Math.floor(Math.random() * JOIN_CODE_ALPHABET.length))
  }
  return code
}

function deriveStatus(timerState, sessionType, isAway) {
  if (isAway) return 'away'
  if (timerState === 'running' && sessionType === 'work') return 'focusing'
  if (timerState === 'running' && (sessionType === 'short-break' || sessionType === 'long-break')) return 'break'
  return 'idle'
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    generateJoinCode,
    deriveStatus,
    JOIN_CODE_ALPHABET,
    JOIN_CODE_LENGTH
  }
}
