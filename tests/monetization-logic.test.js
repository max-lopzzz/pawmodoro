const {
  hasUsedFreeTrial,
  recordFreeTrialUsed,
  FREE_TRIAL_KEY
} = require('../renderer/monetization-logic')

function createFakeStorage() {
  var store = {}
  return {
    getItem: function (key) {
      return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null
    },
    setItem: function (key, value) {
      store[key] = value
    }
  }
}

describe('hasUsedFreeTrial', () => {
  test('returns false when nothing has been stored', () => {
    var storage = createFakeStorage()
    expect(hasUsedFreeTrial(storage)).toBe(false)
  })

  test('returns true after recordFreeTrialUsed has been called', () => {
    var storage = createFakeStorage()
    recordFreeTrialUsed(storage)
    expect(hasUsedFreeTrial(storage)).toBe(true)
  })
})

describe('recordFreeTrialUsed', () => {
  test('writes the expected key to storage', () => {
    var storage = createFakeStorage()
    recordFreeTrialUsed(storage)
    expect(storage.getItem(FREE_TRIAL_KEY)).toBe('true')
  })

  test('is idempotent across repeated calls', () => {
    var storage = createFakeStorage()
    recordFreeTrialUsed(storage)
    recordFreeTrialUsed(storage)
    expect(hasUsedFreeTrial(storage)).toBe(true)
  })
})
