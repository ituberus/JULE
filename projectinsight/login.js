// login.js

document.addEventListener("DOMContentLoaded", () => {
  // Check if the user is already logged in by calling the /api/auth/me endpoint
  checkIfLoggedIn();

  const form = document.getElementById("login-form");
  const emailInput = document.getElementById("email");
  const passwordInput = document.getElementById("password");
  const errorMessageDiv = document.getElementById("error-message");

  form.addEventListener("submit", async (event) => {
    event.preventDefault(); // Prevent the default form submission

    // Clear any previous error message
    errorMessageDiv.style.display = "none";
    errorMessageDiv.textContent = "";

    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if (!email || !password) {
      showError("Please enter both email and password.");
      return;
    }

    try {
      const response = await fetch("/api/auth/signin", {
        method: "POST",
        credentials: "include", // include cookies
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        // If the server returns an error message, show it; otherwise use a fallback.
        const error = data.error || "Login failed, please try again.";
        showError(error);
      } else {
        // Successful login: data.user contains the user info (password excluded)
        console.log("Login successful", data.user);
        // Redirect to the dashboard page
        window.location.href = "dashboard.html";
      }
    } catch (error) {
      console.error("An error occurred:", error);
      showError("An unexpected error occurred. Please try again later.");
    }
  });

  // Function to show error messages in the UI
  function showError(message) {
    errorMessageDiv.textContent = message;
    errorMessageDiv.style.display = "block";
  }

  // Function to check if the user is already logged in
  async function checkIfLoggedIn() {
    try {
      const res = await fetch("/api/auth/me", {
        method: "GET",
        credentials: "include", // send cookies
      });
      if (res.ok) {
        // If the user is already logged in, redirect to the dashboard
        window.location.href = "dashboard.html";
      }
    } catch (err) {
      // If there's an error (e.g., network issues), we can log it but do not block login.
      console.error("Error checking login status:", err);
    }
  }
});
