// ── RevenueCat SDK reference ────────────────────

var RevenueCatPurchases = window.Purchases.Purchases

// ── State ────────────────────────────────────────

var monetizationState = {
  configured: false,
  purchasesClient: null
}

// ── Configuration ────────────────────────────────

function ensureConfigured(userId) {
  if (!monetizationState.configured) {
    monetizationState.purchasesClient = RevenueCatPurchases.configure(window.REVENUECAT_API_KEY, userId)
    monetizationState.configured = true
  }
  return monetizationState.purchasesClient
}

// ── Free trial ────────────────────────────────────

function markFreeTrialUsed() {
  recordFreeTrialUsed(localStorage)
}

// ── Room access gate ──────────────────────────────

function ensureRoomAccess(userId) {
  var client = ensureConfigured(userId)
  if (!hasUsedFreeTrial(localStorage)) {
    return Promise.resolve(true)
  }
  return client.isEntitledTo('pawmodoro_pro').then(function (entitled) {
    if (entitled) return true
    return client.presentPaywall({}).catch(function () {}).then(function () {
      return client.isEntitledTo('pawmodoro_pro')
    })
  })
}

// ── Skin access gate ──────────────────────────────

function ensureSkinAccess(userId) {
  var client = ensureConfigured(userId)
  return client.isEntitledTo('pawmodoro_pro').then(function (entitled) {
    if (entitled) return true
    return client.presentPaywall({}).catch(function () {}).then(function () {
      return client.isEntitledTo('pawmodoro_pro')
    })
  })
}
