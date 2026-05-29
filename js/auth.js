// ===== OPTIONAL CHECKOUT AUTH =====

const authClient = window.supabase
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

function setAuthMessage(message, isError = false) {
  const el = document.getElementById('auth-message');
  if (!el) return;
  el.textContent = message || '';
  el.classList.toggle('err', isError);
}

function normalizeIndiaPhone(phone) {
  const digits = (phone || '').replace(/\D/g, '');
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith('91')) return `+${digits}`;
  return phone && phone.startsWith('+') ? phone : '';
}

function fillIfEmpty(id, value) {
  const el = document.getElementById(id);
  if (el && value && !el.value) el.value = value;
}

async function applyAuthSession() {
  if (!authClient) return;

  const { data } = await authClient.auth.getSession();
  const session = data && data.session;
  const status = document.getElementById('auth-status');
  const logoutBtn = document.getElementById('auth-logout');

  if (!session || !session.user) {
    if (status) status.textContent = 'Continue as guest, or login for faster checkout.';
    if (logoutBtn) logoutBtn.style.display = 'none';
    return;
  }

  const user = session.user;
  const meta = user.user_metadata || {};
  fillIfEmpty('c-name', meta.full_name || meta.name);
  fillIfEmpty('c-email', user.email);
  fillIfEmpty('c-phone', user.phone ? user.phone.replace(/^\+91/, '') : '');

  if (status) status.textContent = user.email || user.phone || 'Logged in';
  if (logoutBtn) logoutBtn.style.display = '';
}

document.addEventListener('DOMContentLoaded', () => {
  if (!authClient) {
    setAuthMessage('Login is temporarily unavailable.', true);
    return;
  }

  applyAuthSession();

  const googleBtn = document.getElementById('google-login-btn');
  const phoneBtn = document.getElementById('phone-otp-btn');
  const verifyBtn = document.getElementById('verify-otp-btn');
  const logoutBtn = document.getElementById('auth-logout');

  googleBtn && googleBtn.addEventListener('click', async () => {
    setAuthMessage('');
    const { error } = await authClient.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/checkout.html` }
    });
    if (error) setAuthMessage(error.message, true);
  });

  phoneBtn && phoneBtn.addEventListener('click', async () => {
    const phone = normalizeIndiaPhone(document.getElementById('auth-phone').value);
    if (!phone) {
      setAuthMessage('Enter a valid mobile number.', true);
      return;
    }

    const { error } = await authClient.auth.signInWithOtp({ phone });
    if (error) {
      setAuthMessage(error.message, true);
      return;
    }

    document.getElementById('auth-otp-row').style.display = 'flex';
    setAuthMessage('OTP sent.');
  });

  verifyBtn && verifyBtn.addEventListener('click', async () => {
    const phone = normalizeIndiaPhone(document.getElementById('auth-phone').value);
    const token = document.getElementById('auth-otp').value.trim();
    if (!phone || !token) {
      setAuthMessage('Enter mobile number and OTP.', true);
      return;
    }

    const { error } = await authClient.auth.verifyOtp({ phone, token, type: 'sms' });
    if (error) {
      setAuthMessage(error.message, true);
      return;
    }

    setAuthMessage('Logged in.');
    applyAuthSession();
  });

  logoutBtn && logoutBtn.addEventListener('click', async () => {
    await authClient.auth.signOut();
    window.location.reload();
  });
});
