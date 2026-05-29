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

function getCheckoutRedirectUrl() {
  const liveHost = window.location.hostname.replace(/^www\./, '');
  if (liveHost === 'canecreme.co') return 'https://www.canecreme.co/checkout.html';
  return `${window.location.origin}/checkout.html`;
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
    googleBtn.disabled = true;
    googleBtn.textContent = 'Opening Google...';

    const { data, error } = await authClient.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: getCheckoutRedirectUrl(),
        queryParams: { prompt: 'select_account' },
      }
    });

    if (error) {
      googleBtn.disabled = false;
      googleBtn.innerHTML = '<span class="auth-google-mark">G</span>Continue with Google';
      setAuthMessage('Google login is not enabled yet. You can continue checkout as guest.', true);
      return;
    }

    if (data && data.url) window.location.href = data.url;
  });

  phoneBtn && phoneBtn.addEventListener('click', async () => {
    const phone = normalizeIndiaPhone(document.getElementById('auth-phone').value);
    if (!phone) {
      setAuthMessage('Enter a valid mobile number.', true);
      return;
    }

    phoneBtn.disabled = true;
    phoneBtn.textContent = 'Sending...';

    const { error } = await authClient.auth.signInWithOtp({ phone });
    if (error) {
      phoneBtn.disabled = false;
      phoneBtn.textContent = 'Send OTP';

      if (/unsupported phone provider/i.test(error.message)) {
        fillIfEmpty('c-phone', phone.replace(/^\+91/, ''));
        setAuthMessage('Phone OTP is not enabled yet. We added this mobile number to Delivery Details, so you can continue as guest.');
        return;
      }

      setAuthMessage('Phone OTP could not be sent. Please continue as guest.', true);
      return;
    }

    phoneBtn.disabled = false;
    phoneBtn.textContent = 'Send OTP';
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
