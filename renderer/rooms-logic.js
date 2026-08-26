var JOIN_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
var JOIN_CODE_LENGTH = 6
var getNextSession = (typeof require !== 'undefined') ? require('./timer-logic').getNextSession : window.getNextSession

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

function computeSecondsLeft(row, now) {
  if (!row.isRunning) return row.durationSeconds
  var elapsedSeconds = Math.floor((now - new Date(row.startedAt).getTime()) / 1000)
  return row.durationSeconds - elapsedSeconds
}

function computeAdvancePayload(row, config, workDurationSeconds) {
  var nextCompletedWork = row.phase === 'work' ? row.completedWork + 1 : row.completedWork
  var next = getNextSession(row.phase, nextCompletedWork, config)
  return {
    phase: next.type,
    durationSeconds: next.type === 'work' ? workDurationSeconds : next.duration,
    completedWork: nextCompletedWork
  }
}

function shouldFlagOverworking(skipStreak) {
  return skipStreak >= 2
}

function canNudge(lastNudgeAt, now, cooldownMs) {
  if (!lastNudgeAt) return true
  return (now - lastNudgeAt) >= cooldownMs
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    generateJoinCode,
    deriveStatus,
    computeSecondsLeft,
    computeAdvancePayload,
    shouldFlagOverworking,
    canNudge,
    JOIN_CODE_ALPHABET,
    JOIN_CODE_LENGTH
  }
}
