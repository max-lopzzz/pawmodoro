// ── Supabase client ──────────────────────────────

var supabaseClient = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY)

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
  supabaseClient.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: 'pawmodoro://auth-callback', skipBrowserRedirect: true }
  }).then(function (result) {
    if (result.error || !result.data.url) {
      showAuthError('Could not start sign-in. Try again.')
      return
    }
    window.platformControls.openExternal(result.data.url)
  })
}

function handleAuthCallbackUrl(url) {
  var code
  try {
    code = new URL(url).searchParams.get('code')
  } catch (e) {
    return
  }
  if (!code) return
  supabaseClient.auth.exchangeCodeForSession(code).then(function (result) {
    if (result.error || !isRealSession(result.data.session)) {
      showAuthError('Sign-in failed. Try again.')
      return
    }
    showApp()
  })
}

elBtnGoogle.addEventListener('click', signInWithGoogle)

// ── Sign out ──────────────────────────────────────

function signOut() {
  supabaseClient.auth.signOut().then(function () {
    showAuthGate()
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

// ── Boot ──────────────────────────────────────────

getSession().then(function (session) {
  if (isRealSession(session)) showApp()
})
