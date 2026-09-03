// ── Supabase client ──────────────────────────────

var supabaseClient = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY)

var AUTH_REDIRECT = (window.Capacitor || window.authBridge)
  ? 'pawmodoro://auth-callback'
  : window.location.origin + '/'

// ── DOM refs ──────────────────────────────────────

var elAuthError  = document.getElementById('auth-error')
var elBtnGoogle  = document.getElementById('btn-sign-in-google')
var elBtnSignOut = document.getElementById('btn-sign-out')

// ── Session ───────────────────────────────────────

function isRealSession(session) {
  return !!(session && session.user && !session.user.is_anonymous)
}

function getSession() {
  return supabaseClient.auth.getSession().then(function (result) {
    return result.data.session
  })
}

function showApp() {
  document.body.classList.add('signed-in')
}

function showAuthGate() {
  document.body.classList.remove('signed-in')
}

// ── Errors ────────────────────────────────────────

function showAuthError(message) {
  elAuthError.textContent = message
}

function clearAuthError() {
  elAuthError.textContent = ''
}

// ── Sign in ───────────────────────────────────────

function signInWithGoogle() {
  clearAuthError()
  elBtnGoogle.disabled = true
  supabaseClient.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: AUTH_REDIRECT, skipBrowserRedirect: true }
  }).then(function (result) {
    if (result.error || !result.data.url) {
      showAuthError('Could not start sign-in. Try again.')
      elBtnGoogle.disabled = false
      return
    }
    window.platformControls.openExternal(result.data.url)
    elBtnGoogle.disabled = false
  }).catch(function () {
    showAuthError('Could not start sign-in. Try again.')
    elBtnGoogle.disabled = false
  })
}

function handleAuthCallbackUrl(url) {
  var parsed
  try {
    parsed = new URL(url)
  } catch (e) {
    return
  }
  var oauthError = parsed.searchParams.get('error_description') || parsed.searchParams.get('error')
  if (oauthError) {
    showAuthError(oauthError)
    return
  }
  var code = parsed.searchParams.get('code')
  if (!code) return
  supabaseClient.auth.exchangeCodeForSession(code).then(function (result) {
    if (result.error || !isRealSession(result.data.session)) {
      showAuthError('Sign-in failed. Try again.')
    }
  }).catch(function () {
    showAuthError('Sign-in failed. Try again.')
  })
}

elBtnGoogle.addEventListener('click', signInWithGoogle)

// ── Sign out ──────────────────────────────────────

function signOut() {
  supabaseClient.auth.signOut().catch(function () {}).then(function () {
    location.reload()
  })
}

elBtnSignOut.addEventListener('click', signOut)

// ── Deep link listeners ───────────────────────────

if (window.authBridge) {
  window.authBridge.onDeepLink(handleAuthCallbackUrl)
}

if (window.Capacitor) {
  window.Capacitor.addListener('App', 'appUrlOpen', function (data) {
    handleAuthCallbackUrl(data.url)
  })
}

// ── Auth state ────────────────────────────────────

supabaseClient.auth.onAuthStateChange(function (event, session) {
  if (event === 'SIGNED_OUT') {
    location.reload()
    return
  }
  if (isRealSession(session)) {
    showApp()
  } else {
    showAuthGate()
  }
})
