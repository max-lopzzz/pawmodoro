var FREE_TRIAL_KEY = 'room-free-trial-used'

function hasUsedFreeTrial(storage) {
  return !!storage.getItem(FREE_TRIAL_KEY)
}

function recordFreeTrialUsed(storage) {
  storage.setItem(FREE_TRIAL_KEY, 'true')
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    hasUsedFreeTrial,
    recordFreeTrialUsed,
    FREE_TRIAL_KEY
  }
}
