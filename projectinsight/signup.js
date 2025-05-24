// signup.js

// Select the form
const signupForm = document.getElementById('signup-form');
const errorBox = document.getElementById('errorBox');

// Listen to form submission
signupForm.addEventListener('submit', async function (e) {
  e.preventDefault(); // Prevent normal form submission

  // Clear any previous error messages
  errorBox.style.display = 'none';
  errorBox.textContent = '';

  // Extract form values
  const formData = new FormData(signupForm);
  const firstName = formData.get('firstName').trim();
  const lastName = formData.get('lastName').trim();
  const email = formData.get('email').trim();
  const country = formData.get('country');
  const countryCode = formData.get('countryCode');
  const phoneNumber = formData.get('phoneNumber').trim();
  const password = formData.get('password');
  const confirmPassword = formData.get('confirmPassword');
  const accountCurrency = formData.get('accountCurrency');
  const referrerCode = (formData.get('referrerCode') || '').trim(); // might be empty

  // Basic client-side checks
  if (password !== confirmPassword) {
    showError('Passwords do not match!');
    return;
  }

  // Combine countryCode + phoneNumber
  const phone = `${countryCode} ${phoneNumber}`;

  // Prepare signup payload (based on your backend’s API structure)
  const signupPayload = {
    firstName,
    lastName,
    email,
    phone,
    country,
    password,
    accountCurrency
  };

  // If user entered a referrer code, include it
  if (referrerCode) {
    signupPayload.referrerCode = referrerCode;
  }

  try {
    // 1) Call signup endpoint
    // NOTE: Use credentials: 'include' to allow cookies to be set if the server does so
    const signupRes = await fetch('/api/auth/signup', {
      method: 'POST',
      credentials: 'include', // so the server can set a cookie if it wants
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(signupPayload)
    });

    const signupData = await signupRes.json();

    if (!signupRes.ok) {
      // If signup response is not ok, handle error
      console.error('Signup error:', signupData);
      // Typically the server might return { error: "Email already in use" } 
      // or { message: "Email already taken" }, etc.
      const errorMsg = signupData.error || signupData.message || 'Signup failed. Please try again.';
      showError(errorMsg);
      return;
    }

    // If signup is successful, some backends might automatically log the user in by setting a cookie.
    // But if not, we can do an explicit sign-in next:
    // 2) Call sign-in endpoint with the same email/password
    const signinPayload = { email, password };
    const signinRes = await fetch('/api/auth/signin', {
      method: 'POST',
      credentials: 'include', // to store the auth cookie
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(signinPayload)
    });

    const signinData = await signinRes.json();

    if (!signinRes.ok) {
      console.error('Signin error:', signinData);
      const errorMsg = signinData.error || signinData.message || 'Login failed. Please try again.';
      showError(errorMsg);
      return;
    }

    // If sign-in is successful, the server should have set an auth cookie.
    // We can now redirect to the dashboard or any protected page.
    window.location.href = 'dashboard.html';

  } catch (error) {
    console.error('Network/Server error:', error);
    showError('Something went wrong. Please try again.');
  }
});

// Helper function to display errors
function showError(message) {
  errorBox.textContent = message;
  errorBox.style.display = 'block';
}
