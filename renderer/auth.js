var supabaseClient = window.supabase.createClient(
  window.SUPABASE_URL,
  window.SUPABASE_ANON_KEY
)

// ── DOM refs ─────────────────────────────────────

var elAuthError = document.getElementById('auth-error')
var elAuthForm = document.getElementById('auth-form')
var elEmail = document.getElementById('auth-email')
var elPassword = document.getElementById('auth-password')
var elBtnSignIn = document.getElementById('btn-sign-in')
var elBtnCreateAccount = document.getElementById('btn-create-account')
var elBtnSignOut = document.getElementById('btn-sign-out')

// ── Session ──────────────────────────────────────

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

// ── Buttons ───────────────────────────────────────

function setAuthButtonsDisabled(disabled) {
  elBtnSignIn.disabled = disabled
  elBtnCreateAccount.disabled = disabled
}

// ── Sign in ───────────────────────────────────────

function signIn() {
  clearAuthError()

  var email = elEmail.value.trim()
  var password = elPassword.value

  if (!email || !password) {
    showAuthError('Please enter your email and password.')
    return
  }

  setAuthButtonsDisabled(true)

  supabaseClient.auth.signInWithPassword({
    email: email,
    password: password
  }).then(function (result) {
    if (result.error) {
      showAuthError(result.error.message)
      setAuthButtonsDisabled(false)
      return
    }

    if (!isRealSession(result.data.session)) {
      showAuthError('Sign-in failed. Try again.')
      setAuthButtonsDisabled(false)
    }
  }).catch(function () {
    showAuthError('Could not sign in. Try again.')
    setAuthButtonsDisabled(false)
  })
}

// ── Create account ───────────────────────────────

function createAccount() {
  clearAuthError()

  var email = elEmail.value.trim()
  var password = elPassword.value

  if (!email || !password) {
    showAuthError('Please enter your email and password.')
    return
  }

  if (password.length < 6) {
    showAuthError('Password must be at least 6 characters.')
    return
  }

  setAuthButtonsDisabled(true)

  supabaseClient.auth.signUp({
    email: email,
    password: password,
    options: {
      emailRedirectTo: 'pawmodoro://auth-callback'
    }
  }).then(function (result) {
    if (result.error) {
      showAuthError(result.error.message)
      setAuthButtonsDisabled(false)
      return
    }

    if (isRealSession(result.data.session)) {
      return
    }

    showAuthError('Account created. Check your email to confirm your account.')
    setAuthButtonsDisabled(false)
  }).catch(function () {
    showAuthError('Could not create account. Try again.')
    setAuthButtonsDisabled(false)
  })
}

elAuthForm.addEventListener('submit', function (event) {
  event.preventDefault()
  signIn()
})

elBtnCreateAccount.addEventListener('click', createAccount)

// ── Sign out ─────────────────────────────────────

elBtnSignOut.addEventListener('click', function () {
  supabaseClient.auth.signOut().catch(function () {}).then(function () {
    location.reload()
  })
})

// ── Email confirmation deep link ────────────────

function handleAuthCallbackUrl(url) {
  if (!url) return

  var parsed

  try {
    parsed = new URL(url)
  } catch (error) {
    return
  }

  if (parsed.protocol !== 'pawmodoro:') return
  if (parsed.hostname !== 'auth-callback') return

  var hash = parsed.hash ? parsed.hash.substring(1) : ''
  var params = new URLSearchParams(hash)

  var accessToken = params.get('access_token')
  var refreshToken = params.get('refresh_token')

  if (!accessToken || !refreshToken) {
    showAuthError('Email confirmation failed. Please try again.')
    return
  }

  supabaseClient.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken
  }).then(function (result) {
    if (result.error) {
      showAuthError('Email confirmation failed. Please try again.')
      return
    }

    if (isRealSession(result.data.session)) {
      clearAuthError()
      showApp()
    } else {
      showAuthError('Email confirmation failed. Please try again.')
    }
  }).catch(function () {
    showAuthError('Email confirmation failed. Please try again.')
  })
}

if (window.authBridge && typeof window.authBridge.onDeepLink === 'function') {
  window.authBridge.onDeepLink(handleAuthCallbackUrl)
}

// ── Auth state ───────────────────────────────────

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
