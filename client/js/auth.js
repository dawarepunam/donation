const API_BASE = window.appSession?.apiBase || `${window.location.origin}/api`;
let pendingProfilePhoto = "";

const authMessageNode = document.getElementById("authMessage");
const authParams = new URLSearchParams(window.location.search);
const authOrigin = window.appSession?.origin || window.location.origin;

const buildAuthUrl = (path, extra = {}) => {
  const nextParams = new URLSearchParams();
  const returnTo = authParams.get("returnTo");
  const reason = authParams.get("reason");

  if (returnTo) nextParams.set("returnTo", returnTo);
  if (reason) nextParams.set("reason", reason);

  Object.entries(extra).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      nextParams.set(key, String(value));
    }
  });

  return `${authOrigin}/${path}${nextParams.toString() ? `?${nextParams.toString()}` : ""}`;
};

const showMessage = (message, type = "info") => {
  if (!authMessageNode) return;
  authMessageNode.textContent = message;
  authMessageNode.classList.remove("hidden", "error");
  if (type === "error") {
    authMessageNode.classList.add("error");
  }
};

const saveSession = (data) => {
  localStorage.setItem("token", data.token);
  localStorage.setItem("user", JSON.stringify(data.user));
};

const getPostLoginTarget = (user) => {
  const returnTo = authParams.get("returnTo");

  if (user?.setup?.required) {
    return buildAuthUrl("account-setup.html");
  }

  if (returnTo && user?.role === "user") {
    return `${authOrigin}${returnTo}`;
  }

  return user?.role === "superadmin"
    ? `${authOrigin}/superadmin/dashboard`
    : user?.role === "admin"
      ? `${authOrigin}/admin/dashboard`
      : `${authOrigin}/index.html`;
};

const registerSwitchLink = document.getElementById("registerSwitchLink");
if (registerSwitchLink) {
  // Preserve the original donate page so registration can continue the same journey.
  registerSwitchLink.href = buildAuthUrl("register.html");
}

const loginSwitchLink = document.getElementById("loginSwitchLink");
if (loginSwitchLink) {
  loginSwitchLink.href = buildAuthUrl("login.html");
}

const readFileAsDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

const renderPhotoPreview = (value) => {
  const preview = document.getElementById("profilePhotoPreview");
  if (!preview) return;

  preview.innerHTML = value
    ? `<img src="${value}" alt="Profile preview" class="photo-preview-image" />`
    : `<div class="empty-state compact-empty">Upload a donor profile photo to personalize the dashboard and live impact feed.</div>`;
};

const photoInput = document.getElementById("profilePhotoInput");
if (photoInput) {
  renderPhotoPreview("");
  photoInput.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      pendingProfilePhoto = "";
      renderPhotoPreview("");
      return;
    }

    pendingProfilePhoto = await readFileAsDataUrl(file);
    renderPhotoPreview(pendingProfilePhoto);
  });
}

const registerForm = document.getElementById("registerForm");
if (registerForm) {
  if (authParams.get("reason") === "donate") {
    showMessage("Pehle account create kara, nantar login karun direct donation page var parat ja.");
  }

  registerForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submitButton = registerForm.querySelector("button[type='submit']");
    submitButton.disabled = true;
    submitButton.textContent = "Creating account...";

    try {
      const payload = {
        name: document.getElementById("name").value,
        email: document.getElementById("email").value,
        mobile: document.getElementById("mobile").value,
        password: document.getElementById("password").value,
        profilePhoto: pendingProfilePhoto,
      };

      const res = await fetch(`${API_BASE}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        showMessage(data.message || "Registration failed", "error");
        return;
      }

      showMessage("Registration successful. Redirecting to login...");
      window.setTimeout(() => {
        window.location.assign(buildAuthUrl("login.html", { registered: 1 }));
      }, 700);
    } catch (error) {
      showMessage("Unable to register right now. Please try again.", "error");
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = "Register";
    }
  });
}

const loginForm = document.getElementById("loginForm");
if (loginForm) {
  if (authParams.get("registered") === "1") {
    showMessage("Account created. Login kara.");
  }
  if (authParams.get("reason") === "donate") {
    showMessage("Already account asel tar login kara. Nahitar guest donation pan karta yeil from campaign page.");
  }

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submitButton = loginForm.querySelector("button[type='submit']");
    submitButton.disabled = true;
    submitButton.textContent = "Logging in...";

    try {
      const payload = {
        email: document.getElementById("email").value,
        password: document.getElementById("password").value,
      };

      const res = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        showMessage(data.message || "Login failed", "error");
        return;
      }

      saveSession(data);
      await window.appSession?.renderNav?.();
      const target = getPostLoginTarget(data.user);
      window.location.assign(target);
    } catch (error) {
      showMessage("Unable to login right now. Please try again.", "error");
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = "Login";
    }
  });
}

const setupForm = document.getElementById("accountSetupForm");
if (setupForm) {
  const sessionToken = localStorage.getItem("token");
  const storedSessionUser = JSON.parse(localStorage.getItem("user") || "null");
  const resendOtpButton = document.getElementById("resendOtpButton");

  if (!sessionToken || !storedSessionUser) {
    window.location.assign(buildAuthUrl("login.html"));
  } else if (!storedSessionUser.setup?.required) {
    window.location.assign("index.html");
  } else {
    showMessage("First login detected. Verify the OTP from your email and create a new password.");

    resendOtpButton?.addEventListener("click", async () => {
      resendOtpButton.disabled = true;
      resendOtpButton.textContent = "Sending...";

      try {
        const res = await fetch(`${API_BASE}/auth/setup/send-otp`, {
          method: "POST",
          headers: {
            Authorization: sessionToken,
          },
        });
        const data = await res.json();
        if (!res.ok) {
          showMessage(data.message || "Unable to send OTP", "error");
          return;
        }

        localStorage.setItem("user", JSON.stringify(data.user));
        showMessage(data.message || "OTP sent successfully");
      } catch (error) {
        showMessage("Unable to send OTP right now.", "error");
      } finally {
        resendOtpButton.disabled = false;
        resendOtpButton.textContent = "Resend OTP";
      }
    });

    setupForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const submitButton = setupForm.querySelector("button[type='submit']");
      submitButton.disabled = true;
      submitButton.textContent = "Securing account...";

      try {
        const res = await fetch(`${API_BASE}/auth/setup/complete`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: sessionToken,
          },
          body: JSON.stringify({
            otp: document.getElementById("setupOtp").value.trim(),
            newPassword: document.getElementById("setupNewPassword").value,
            confirmPassword: document.getElementById("setupConfirmPassword").value,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          showMessage(data.message || "Unable to complete account setup", "error");
          return;
        }

        saveSession(data);
        await window.appSession?.renderNav?.();
        window.location.assign("dashboard.html");
      } catch (error) {
        showMessage("Unable to complete account setup right now.", "error");
      } finally {
        submitButton.disabled = false;
        submitButton.textContent = "Verify OTP and Continue";
      }
    });
  }
}
