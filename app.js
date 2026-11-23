import {
  auth,
  db,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  collection,
  addDoc,
  query,
  where,
  limit,
  getDocs
} from "./firebase.js";

/* =========================================
   LEADERS GROUP DIGITAL
   Main Application
========================================= */

const $ = (id) => document.getElementById(id);

const modal = $("authModal");
const form = $("authForm");
const message = $("authMessage");
const submit = $("authSubmit");

let authMode = "login";
let currentUser = null;
let currentUserProfile = null;
let publicGigs = [];
let myGigs = [];
let activeCategory = "all";
let visibleGigCount = 9;
let currentMemberTab = "overview";

const MAX_GIGS = 5;

if ($("year")) {
  $("year").textContent = new Date().getFullYear();
}

/* =========================================
   HELPERS
========================================= */

function toast(text) {
  const el = $("toast");
  if (!el) return;

  el.textContent = text;
  el.classList.add("show");

  clearTimeout(toast.timer);

  toast.timer = setTimeout(() => {
    el.classList.remove("show");
  }, 3200);
}

function showMessage(text, success = false) {
  if (!message) return;

  message.textContent = text;
  message.classList.toggle("success", success);
}

function setButtonLoading(button, loading, text = "Please wait...") {
  if (!button) return;

  if (loading) {
    button.dataset.originalText = button.textContent;
    button.disabled = true;
    button.textContent = text;
  } else {
    button.disabled = false;
    button.textContent = button.dataset.originalText || "Submit";
  }
}

function escapeHTML(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}

function formatPrice(value) {
  const amount = Number(value || 0);

  return "Rs " + amount.toLocaleString("en-PK");
}

function getDateValue(timestamp) {
  if (!timestamp) return 0;

  if (typeof timestamp.toMillis === "function") {
    return timestamp.toMillis();
  }

  return new Date(timestamp).getTime() || 0;
}

function getFirebaseError(error) {
  const errors = {
    "auth/email-already-in-use": "This email already has an account. Please log in.",
    "auth/invalid-email": "Please enter a valid email address.",
    "auth/weak-password": "Password must contain at least 6 characters.",
    "auth/invalid-credential": "Email or password is incorrect.",
    "auth/user-disabled": "This account has been disabled.",
    "auth/user-not-found": "No account found with this email.",
    "auth/wrong-password": "Incorrect password.",
    "auth/too-many-requests": "Too many attempts. Please try again later.",
    "auth/network-request-failed": "Network error. Check your internet connection.",
    "permission-denied": "Permission denied. Please check Firestore security rules."
  };

  return errors[error.code] || error.message || "Something went wrong.";
}

function setStatus(element, text, success = false) {
  if (!element) return;

  element.textContent = text;
  element.classList.toggle("success", success);
}

/* =========================================
   AUTH MODAL
========================================= */

function setMode(mode) {
  authMode = mode;

  const signup = mode === "signup";

  $("loginTab")?.classList.toggle("active", !signup);
  $("signupTab")?.classList.toggle("active", signup);

  $("nameField")?.classList.toggle("hidden", !signup);
  $("roleField")?.classList.toggle("hidden", !signup);

  if ($("authEyebrow")) {
    $("authEyebrow").textContent = signup
      ? "YOUR JOURNEY STARTS HERE"
      : "WELCOME BACK";
  }

  if ($("authTitle")) {
    $("authTitle").textContent = signup
      ? "Create your account."
      : "Welcome back.";
  }

  if ($("authSubtitle")) {
    $("authSubtitle").textContent = signup
      ? "Join a marketplace built for ambitious people."
      : "Sign in to continue to your member space.";
  }

  if ($("authSubmit")) {
    $("authSubmit").innerHTML = signup
      ? 'Create account <span>↗</span>'
      : 'Log in <span>↗</span>';
  }

  if ($("password")) {
    $("password").autocomplete = signup
      ? "new-password"
      : "current-password";
  }

  showMessage("");
}

function openAuth(mode = "login") {
  if (!modal) return;

  setMode(mode);

  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");

  document.body.style.overflow = "hidden";
}

function closeAuth() {
  if (!modal) return;

  modal.classList.remove("open");
  modal.setAttribute("aria-hidden", "true");

  document.body.style.overflow = "";
}

document.querySelectorAll("[data-open-auth]").forEach((button) => {
  button.addEventListener("click", () => {
    openAuth(button.dataset.openAuth || "login");
  });
});

$("closeAuth")?.addEventListener("click", closeAuth);

$("loginTab")?.addEventListener("click", () => {
  setMode("login");
});

$("signupTab")?.addEventListener("click", () => {
  setMode("signup");
});

modal?.addEventListener("click", (event) => {
  if (event.target === modal) closeAuth();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeAuth();
});

/* =========================================
   ACCOUNT CREATION
========================================= */

async function createUserProfile(user, name, role) {
  const userRef = doc(db, "users", user.uid);
  const profileRef = doc(db, "publicProfiles", user.uid);

  const privateProfile = {
    uid: user.uid,
    displayName: name,
    email: user.email,
    role,
    accountStatus: "active",
    kycStatus: "unverified",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };

  await setDoc(userRef, privateProfile);

  if (role === "expert") {
    await setDoc(profileRef, {
      uid: user.uid,
      displayName: name,
      headline: "New digital expert",
      bio: "",
      skills: [],
      country: "Pakistan",
      visibility: "published",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  }
}

/* =========================================
   AUTH FORM SUBMISSION
========================================= */

form?.addEventListener("submit", async (event) => {
  event.preventDefault();

  showMessage("");

  const email = $("email")?.value.trim().toLowerCase() || "";
  const password = $("password")?.value || "";
  const name = $("fullName")?.value.trim() || "";
  const role = $("accountRole")?.value || "client";

  if (!email) {
    showMessage("Please enter your email address.");
    return;
  }

  if (authMode === "signup" && name.length < 2) {
    showMessage("Please enter your full name.");
    return;
  }

  if (password.length < 6) {
    showMessage("Password must contain at least 6 characters.");
    return;
  }

  if (authMode === "signup" && !["client", "expert"].includes(role)) {
    showMessage("Please select a valid account type.");
    return;
  }

  submit.disabled = true;
  submit.textContent = authMode === "signup"
    ? "Creating account..."
    : "Signing in...";

  try {
    let user;

    if (authMode === "signup") {
      const credential = await createUserWithEmailAndPassword(
        auth,
        email,
        password
      );

      user = credential.user;

      await updateProfile(user, {
        displayName: name
      });

      await createUserProfile(user, name, role);

      toast("Your account has been created.");

    } else {
      const credential = await signInWithEmailAndPassword(
        auth,
        email,
        password
      );

      user = credential.user;

      toast("Signed in successfully.");
    }

    closeAuth();

    await loadMember(user);

  } catch (error) {
    console.error("Authentication error:", error);

    showMessage(getFirebaseError(error));

    if (
      authMode === "signup" &&
      error.code !== "auth/email-already-in-use"
    ) {
      toast("Account setup was not completed.");
    }

  } finally {
    submit.disabled = false;

    submit.innerHTML = authMode === "signup"
      ? 'Create account <span>↗</span>'
      : 'Log in <span>↗</span>';
  }
});

/* =========================================
   MEMBER DASHBOARD
========================================= */

async function loadMember(user) {
  if (!user) return;

  currentUser = user;

  try {
    const profileRef = doc(db, "users", user.uid);
    const snapshot = await getDoc(profileRef);

    if (!snapshot.exists()) {
      currentUserProfile = null;

      toast("Your account profile is missing. Please contact support.");
      return;
    }

    currentUserProfile = snapshot.data();

    if ($("memberName")) {
      $("memberName").textContent =
        currentUserProfile.displayName || user.displayName || "Member";
    }

    if ($("navUser")) {
      $("navUser").textContent =
        currentUserProfile.displayName || "Member";
    }

    if ($("memberRole")) {
      $("memberRole").textContent =
        currentUserProfile.role === "expert" ? "Expert" : "Client";
    }

    if ($("memberAccountStatus")) {
      $("memberAccountStatus").textContent =
        currentUserProfile.accountStatus || "active";
    }

    $("memberPanel")?.classList.remove("hidden");
    $("guestActions")?.classList.add("hidden");
    $("userActions")?.classList.remove("hidden");

    await loadMemberData();

  } catch (error) {
    console.error("Member loading error:", error);
    toast(getFirebaseError(error));
  }
}

function hideMember() {
  currentUser = null;
  currentUserProfile = null;

  $("memberPanel")?.classList.add("hidden");
  $("guestActions")?.classList.remove("hidden");
  $("userActions")?.classList.add("hidden");
}

$("closeMember")?.addEventListener("click", () => {
  $("memberPanel")?.classList.add("hidden");
});

$("logoutBtn")?.addEventListener("click", async () => {
  try {
    await signOut(auth);
    hideMember();
    toast("You have been logged out.");
  } catch (error) {
    console.error(error);
    toast("Logout failed. Please try again.");
  }
});

onAuthStateChanged(auth, async (user) => {
  if (user) {
    await loadMember(user);
  } else {
    hideMember();
  }
});

/* =========================================
   MEMBER NAVIGATION
========================================= */

function showMemberTab(tab) {
  currentMemberTab = tab;

  document.querySelectorAll("[data-member-tab]").forEach((button) => {
    button.classList.toggle(
      "active",
      button.dataset.memberTab === tab
    );
  });

  document.querySelectorAll("[data-member-panel]").forEach((panel) => {
    panel.classList.toggle(
      "active",
      panel.dataset.memberPanel === tab
    );

    panel.classList.toggle(
      "hidden",
      panel.dataset.memberPanel !== tab
    );
  });
}

document.querySelectorAll("[data-member-tab]").forEach((button) => {
  button.addEventListener("click", () => {
    showMemberTab(button.dataset.memberTab);
  });
});

/* =========================================
   MEMBER DATA
========================================= */

async function loadMemberData() {
  if (!currentUser || !currentUserProfile) return;

  await Promise.allSettled([
    loadMyGigs(),
    loadExpertProfile()
  ]);

  updateGigLimit();
  showMemberTab(currentMemberTab);
}

/* =========================================
   EXPERT PROFILE
========================================= */

async function loadExpertProfile() {
  if (!currentUser || currentUserProfile?.role !== "expert") return;

  try {
    const profileRef = doc(db, "publicProfiles", currentUser.uid);
    const snapshot = await getDoc(profileRef);

    if (!snapshot.exists()) return;

    const profile = snapshot.data();

    if ($("profileName")) {
      $("profileName").value = profile.displayName || "";
    }

    if ($("profileHeadline")) {
      $("profileHeadline").value = profile.headline || "";
    }

    if ($("profileBio")) {
      $("profileBio").value = profile.bio || "";
    }

    if ($("profileSkills")) {
      $("profileSkills").value = Array.isArray(profile.skills)
        ? profile.skills.join(", ")
        : "";
    }

    if ($("profileCountry")) {
      $("profileCountry").value = profile.country || "Pakistan";
    }

  } catch (error) {
    console.error("Profile fetch error:", error);
  }
}

$("profileForm")?.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!currentUser || currentUserProfile?.role !== "expert") {
    toast("Only expert accounts can edit public profiles.");
    return;
  }

  const name = $("profileName")?.value.trim() || "";
  const headline = $("profileHeadline")?.value.trim() || "";
  const bio = $("profileBio")?.value.trim() || "";
  const skills = ($("profileSkills")?.value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 20);

  const country = $("profileCountry")?.value.trim() || "Pakistan";

  if (name.length < 2) {
    setStatus($("profileMessage"), "Name must contain at least 2 characters.");
    return;
  }

  try {
    setButtonLoading($("saveProfileBtn"), true, "Saving...");

    await updateDoc(
      doc(db, "publicProfiles", currentUser.uid),
      {
        displayName: name,
        headline,
        bio,
        skills,
        country,
        updatedAt: serverTimestamp()
      }
    );

    await updateDoc(
      doc(db, "users", currentUser.uid),
      {
        displayName: name,
        updatedAt: serverTimestamp()
      }
    );

    currentUserProfile.displayName = name;

    if ($("memberName")) $("memberName").textContent = name;
    if ($("navUser")) $("navUser").textContent = name;

    setStatus($("profileMessage"), "Profile updated successfully.", true);
    toast("Profile saved.");

  } catch (error) {
    console.error(error);
    setStatus($("profileMessage"), getFirebaseError(error));
  } finally {
    setButtonLoading($("saveProfileBtn"), false);
  }
});

/* =========================================
   GIG PACKAGE HELPERS
========================================= */

function getFieldValue(ids, fallback = "") {
  for (const id of ids) {
    const element = $(id);
    if (element) return element.value;
  }

  return fallback;
}

function getPackageData(type) {
  const prefix = type.toLowerCase();

  const price = Number(getFieldValue([
    `${prefix}Price`,
    `${prefix}PackagePrice`,
    `${prefix}GigPrice`
  ], 0));

  const deliveryDays = Number(getFieldValue([
    `${prefix}Delivery`,
    `${prefix}DeliveryDays`,
    `${prefix}Days`
  ], 1));

  const revisions = Number(getFieldValue([
    `${prefix}Revisions`,
    `${prefix}Revision`
  ], 0));

  const scope = getFieldValue([
    `${prefix}Scope`,
    `${prefix}Description`,
    `${prefix}PackageDescription`
  ], "");

  return {
    price,
    deliveryDays,
    revisions,
    scope: String(scope).trim()
  };
}

function fillPackageData(type, data = {}) {
  const prefix = type.toLowerCase();

  const fields = {
    price: [`${prefix}Price`, `${prefix}PackagePrice`, `${prefix}GigPrice`],
    deliveryDays: [`${prefix}Delivery`, `${prefix}DeliveryDays`, `${prefix}Days`],
    revisions: [`${prefix}Revisions`, `${prefix}Revision`],
    scope: [`${prefix}Scope`, `${prefix}Description`, `${prefix}PackageDescription`]
  };

  Object.entries(fields).forEach(([key, ids]) => {
    for (const id of ids) {
      if ($(id)) {
        $(id).value = data[key] ?? "";
        break;
      }
    }
  });
}

function readGigForm() {
  const title = $("gigTitle")?.value.trim() || "";
  const category = $("gigCategoryInput")?.value.trim() || "";
  const description = $("gigDescription")?.value.trim() || "";
  const status = $("gigStatus")?.value || "draft";

  return {
    title,
    category,
    description,
    status,
    packages: {
      basic: getPackageData("Basic"),
      standard: getPackageData("Standard"),
      premium: getPackageData("Premium")
    }
  };
}

function validateGig(gig) {
  if (gig.title.length < 3 || gig.title.length > 120) {
    return "Gig title must be between 3 and 120 characters.";
  }

  if (!gig.category) {
    return "Please select or enter a gig category.";
  }

  if (gig.description.length < 20) {
    return "Gig description must contain at least 20 characters.";
  }

  for (const [name, pack] of Object.entries(gig.packages)) {
    if (
      !Number.isFinite(pack.price) ||
      pack.price <= 0 ||
      !Number.isFinite(pack.deliveryDays) ||
      pack.deliveryDays < 1 ||
      !Number.isFinite(pack.revisions) ||
      pack.revisions < 0
    ) {
      return `Please enter valid price, delivery days and revisions for ${name}.`;
    }
  }

  if (!["draft", "published"].includes(gig.status)) {
    return "Invalid gig status.";
  }

  return "";
}

/* =========================================
   LOAD EXPERT GIGS
========================================= */

async function loadMyGigs() {
  if (!currentUser || currentUserProfile?.role !== "expert") return;

  try {
    const gigsQuery = query(
      collection(db, "gigs"),
      where("ownerId", "==", currentUser.uid),
      limit(30)
    );

    const snapshot = await getDocs(gigsQuery);

    myGigs = snapshot.docs.map((item) => ({
      id: item.id,
      ...item.data()
    }));

    myGigs.sort((a, b) =>
      getDateValue(b.createdAt) - getDateValue(a.createdAt)
    );

    renderMyGigs();
    updateGigLimit();

  } catch (error) {
    console.error("My gigs error:", error);
    toast("Could not load your gigs.");
  }
}

function updateGigLimit() {
  const count = myGigs.length;

  if ($("gigLimitText")) {
    $("gigLimitText").textContent =
      `${count} / ${MAX_GIGS} gigs used`;
  }

  const createButton = $("saveGigBtn");

  if (createButton && !$("gigId")?.value) {
    createButton.disabled = count >= MAX_GIGS;
  }
}

/* =========================================
   SAVE / UPDATE GIG
========================================= */

$("gigForm")?.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!currentUser || currentUserProfile?.role !== "expert") {
    toast("Only expert accounts can publish gigs.");
    return;
  }

  const gigId = $("gigId")?.value.trim() || "";
  const gig = readGigForm();

  const validationError = validateGig(gig);

  if (validationError) {
    setStatus($("gigMessage"), validationError);
    return;
  }

  if (!gigId && myGigs.length >= MAX_GIGS) {
    setStatus($("gigMessage"), "You have reached the maximum of 5 gigs.");
    return;
  }

  try {
    setButtonLoading($("saveGigBtn"), true, "Saving gig...");

    const gigData = {
      ownerId: currentUser.uid,
      title: gig.title,
      category: gig.category,
      description: gig.description,
      packages: gig.packages,
      status: gig.status,
      updatedAt: serverTimestamp()
    };

    if (gigId) {
      const existingGig = myGigs.find((item) => item.id === gigId);

      if (!existingGig || existingGig.ownerId !== currentUser.uid) {
        throw new Error("You cannot edit this gig.");
      }

      await updateDoc(doc(db, "gigs", gigId), {
        title: gig.title,
        category: gig.category,
        description: gig.description,
        packages: gig.packages,
        status: gig.status,
        updatedAt: serverTimestamp()
      });

      toast("Gig updated successfully.");

    } else {
      await addDoc(collection(db, "gigs"), {
        ...gigData,
        createdAt: serverTimestamp()
      });

      toast("Your gig has been created.");
    }

    $("gigForm").reset();

    if ($("gigId")) $("gigId").value = "";

    setStatus($("gigMessage"), "Gig saved successfully.", true);

    await loadMyGigs();
    await loadMarketplace();

  } catch (error) {
    console.error("Gig save error:", error);
    setStatus($("gigMessage"), getFirebaseError(error));
  }   finally {
    setButtonLoading($("saveGigBtn"), false);
    updateGigLimit();
  }
});

/* =========================================
   EDIT GIG
========================================= */

function editGig(gigId) {
  const gig = myGigs.find((item) => item.id === gigId);

  if (!gig) {
    toast("Gig not found.");
    return;
  }

  if (gig.ownerId !== currentUser?.uid) {
    toast("You cannot edit this gig.");
    return;
  }

  if ($("gigId")) $("gigId").value = gig.id;
  if ($("gigTitle")) $("gigTitle").value = gig.title || "";
  if ($("gigCategoryInput")) $("gigCategoryInput").value = gig.category || "";
  if ($("gigDescription")) $("gigDescription").value = gig.description || "";
  if ($("gigStatus")) $("gigStatus").value = gig.status || "draft";

  fillPackageData("Basic", gig.packages?.basic || {});
  fillPackageData("Standard", gig.packages?.standard || {});
  fillPackageData("Premium", gig.packages?.premium || {});

  if ($("saveGigBtn")) {
    $("saveGigBtn").disabled = false;
    $("saveGigBtn").innerHTML = 'Update gig <span>↗</span>';
  }

  if ($("gigMessage")) {
    setStatus($("gigMessage"), "Editing selected gig.");
  }

  showMemberTab("gigs");
  $("gigForm")?.scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
}

/* =========================================
   CANCEL GIG EDIT
========================================= */

function cancelGigEdit() {
  $("gigForm")?.reset();

  if ($("gigId")) $("gigId").value = "";

  if ($("saveGigBtn")) {
    $("saveGigBtn").innerHTML = 'Save gig <span>↗</span>';
  }

  setStatus($("gigMessage"), "");
  updateGigLimit();
}

$("cancelGigEdit")?.addEventListener("click", cancelGigEdit);

/* =========================================
   DELETE GIG
========================================= */

async function removeGig(gigId) {
  const gig = myGigs.find((item) => item.id === gigId);

  if (!gig || gig.ownerId !== currentUser?.uid) {
    toast("You cannot delete this gig.");
    return;
  }

  const confirmed = window.confirm(
    `Delete "${gig.title}" permanently?`
  );

  if (!confirmed) return;

  try {
    await deleteDoc(doc(db, "gigs", gigId));

    myGigs = myGigs.filter((item) => item.id !== gigId);

    renderMyGigs();
    updateGigLimit();

    if ($("gigId")?.value === gigId) {
      cancelGigEdit();
    }

    await loadMarketplace();

    toast("Gig deleted successfully.");

  } catch (error) {
    console.error("Gig delete error:", error);
    toast(getFirebaseError(error));
  }
}

/* =========================================
   RENDER MY GIGS
========================================= */

function renderMyGigs() {
  const container = $("myGigsList");

  if (!container) return;

  if (currentUserProfile?.role !== "expert") {
    container.innerHTML = `
      <div class="empty-state">
        <h3>Expert workspace</h3>
        <p>Create an expert account to publish and manage gigs.</p>
      </div>
    `;
    return;
  }

  if (!myGigs.length) {
    container.innerHTML = `
      <div class="empty-state">
        <h3>No gigs yet.</h3>
        <p>Create your first service listing to start attracting clients.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = myGigs.map((gig) => `
    <article class="gig-management-card">
      <div class="gig-management-info">
        <span class="gig-status ${escapeHTML(gig.status)}">
          ${escapeHTML(gig.status)}
        </span>

        <h3>${escapeHTML(gig.title)}</h3>

        <p>${escapeHTML(gig.category)}</p>

        <div class="gig-management-meta">
          <span>Basic: ${formatPrice(gig.packages?.basic?.price)}</span>
          <span>Standard: ${formatPrice(gig.packages?.standard?.price)}</span>
          <span>Premium: ${formatPrice(gig.packages?.premium?.price)}</span>
        </div>
      </div>

      <div class="gig-management-actions">
        <button
          type="button"
          class="btn btn-secondary"
          data-edit-gig="${escapeHTML(gig.id)}"
        >
          Edit
        </button>

        <button
          type="button"
          class="btn btn-danger"
          data-delete-gig="${escapeHTML(gig.id)}"
        >
          Delete
        </button>
      </div>
    </article>
  `).join("");

  container.querySelectorAll("[data-edit-gig]").forEach((button) => {
    button.addEventListener("click", () => {
      editGig(button.dataset.editGig);
    });
  });

  container.querySelectorAll("[data-delete-gig]").forEach((button) => {
    button.addEventListener("click", () => {
      removeGig(button.dataset.deleteGig);
    });
  });
}

/* =========================================
   LOAD PUBLIC MARKETPLACE
========================================= */

async function loadMarketplace() {
  try {
    const gigsQuery = query(
      collection(db, "gigs"),
      where("status", "==", "published"),
      limit(60)
    );

    const snapshot = await getDocs(gigsQuery);

    publicGigs = snapshot.docs.map((item) => ({
      id: item.id,
      ...item.data()
    }));

    publicGigs.sort((a, b) =>
      getDateValue(b.createdAt) - getDateValue(a.createdAt)
    );

    renderMarketplace();

  } catch (error) {
    console.error("Marketplace loading error:", error);

    const container = $("marketplaceGrid");

    if (container) {
      container.innerHTML = `
        <div class="empty-state">
          <h3>Marketplace unavailable</h3>
          <p>We couldn't load services. Please refresh and try again.</p>
        </div>
      `;
    }
  }
}

/* =========================================
   GET EXPERT NAME
========================================= */

const expertNameCache = new Map();

async function getExpertName(uid) {
  if (!uid) return "Digital Expert";

  if (expertNameCache.has(uid)) {
    return expertNameCache.get(uid);
  }

  try {
    const profileSnapshot = await getDoc(
      doc(db, "publicProfiles", uid)
    );

    const name = profileSnapshot.exists()
      ? profileSnapshot.data().displayName || "Digital Expert"
      : "Digital Expert";

    expertNameCache.set(uid, name);

    return name;

  } catch (error) {
    console.error("Expert name error:", error);
    return "Digital Expert";
  }
}

/* =========================================
   RENDER MARKETPLACE
========================================= */

async function renderMarketplace() {
  const container = $("marketplaceGrid");

  if (!container) return;

  const searchTerm = (
    $("marketplaceSearch")?.value || ""
  ).trim().toLowerCase();

  const filtered = publicGigs.filter((gig) => {
    const matchesCategory =
      activeCategory === "all" ||
      gig.category?.toLowerCase() === activeCategory.toLowerCase();

    const matchesSearch =
      !searchTerm ||
      gig.title?.toLowerCase().includes(searchTerm) ||
      gig.category?.toLowerCase().includes(searchTerm) ||
      gig.description?.toLowerCase().includes(searchTerm);

    return matchesCategory && matchesSearch;
  });

  const visible = filtered.slice(0, visibleGigCount);

  if (!visible.length) {
    container.innerHTML = `
      <div class="empty-state">
        <h3>No services found.</h3>
        <p>Try another search or category.</p>
      </div>
    `;

    if ($("loadMoreGigs")) {
      $("loadMoreGigs").classList.add("hidden");
    }

    return;
  }

  container.innerHTML = `
    <div class="marketplace-loading">
      Loading services...
    </div>
  `;

  const cards = await Promise.all(
    visible.map(async (gig) => {
      const expertName = await getExpertName(gig.ownerId);
      const basicPrice = gig.packages?.basic?.price || 0;

      return `
        <article class="marketplace-card">

          <div class="marketplace-card-top">
            <span class="gig-category">
              ${escapeHTML(gig.category)}
            </span>

            <span class="gig-status published">
              Published
            </span>
          </div>

          <h3>${escapeHTML(gig.title)}</h3>

          <p class="gig-description">
            ${escapeHTML(gig.description)}
          </p>

          <div class="gig-expert">
            <span class="expert-avatar">
              ${escapeHTML(expertName.charAt(0).toUpperCase())}
            </span>

            <span>
              <small>Created by</small>
              <strong>${escapeHTML(expertName)}</strong>
            </span>
          </div>

          <div class="marketplace-card-bottom">
            <div class="gig-price">
              <small>Starting from</small>
              <strong>${formatPrice(basicPrice)}</strong>
            </div>

            <button
              type="button"
              class="btn btn-primary"
              data-interest-gig="${escapeHTML(gig.id)}"
            >
              View service <span>↗</span>
            </button>
          </div>

        </article>
      `;
    })
  );

  container.innerHTML = cards.join("");

  container.querySelectorAll("[data-interest-gig]").forEach((button) => {
    button.addEventListener("click", () => {
      handleGigInterest(button.dataset.interestGig);
    });
  });

  if ($("loadMoreGigs")) {
    $("loadMoreGigs").classList.toggle(
      "hidden",
      visibleGigCount >= filtered.length
    );
  }
}

/* =========================================
   GIG INTEREST
========================================= */

function handleGigInterest(gigId) {
  const gig = publicGigs.find((item) => item.id === gigId);

  if (!gig) {
    toast("This service is no longer available.");
    return;
  }

  if (!currentUser) {
    openAuth("login");
    showMessage("Please log in to continue.");
    return;
  }

  if (currentUserProfile?.role === "expert") {
    toast("Client accounts are required to contact experts.");
    return;
  }

  toast("Service interest received. Project booking will be enabled with the secure backend.");
}

/* =========================================
   MARKETPLACE SEARCH
========================================= */

$("marketplaceSearch")?.addEventListener("input", () => {
  visibleGigCount = 9;
  renderMarketplace();
});

/* =========================================
   MARKETPLACE CATEGORY FILTER
========================================= */

document.querySelectorAll("[data-category-filter]").forEach((button) => {
  button.addEventListener("click", () => {
    activeCategory = button.dataset.categoryFilter || "all";
    visibleGigCount = 9;

    document.querySelectorAll("[data-category-filter]").forEach((item) => {
      item.classList.toggle("active", item === button);
    });

    renderMarketplace();
  });
});

/* =========================================
   LOAD MORE GIGS
========================================= */

$("loadMoreGigs")?.addEventListener("click", () => {
  visibleGigCount += 9;
  renderMarketplace();
});

/* =========================================
   PROJECTS PLACEHOLDER
========================================= */

function renderProjectNotice() {
  const container = $("projectsList");

  if (!container) return;

  container.innerHTML = `
    <div class="empty-state">
      <h3>Project workspace</h3>
      <p>
        Secure project creation, milestones, chat, payment holding,
        delivery OTP and dispute management require the trusted backend.
      </p>
    </div>
  `;
}

/* =========================================
   REPUTATION PLACEHOLDER
========================================= */

function renderReputation() {
  const container = $("reputationPanel");

  if (!container) return;

  container.innerHTML = `
    <div class="empty-state">
      <h3>Expert reputation</h3>
      <p>
        Verified project XP, Style Points, expert ranks and cosmetic
        rewards will appear here after the secure reputation backend
        is implemented.
      </p>
    </div>
  `;
}

/* =========================================
   INITIALIZE APPLICATION
========================================= */

renderProjectNotice();
renderReputation();
loadMarketplace();
