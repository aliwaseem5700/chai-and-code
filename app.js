/**
 * Chai & Code — Client Application Logic
 * Integrates with Python/SQLite backend for authentication, skill filtering, live swap ticker, and swap proposals.
 */

// State Management
const state = {
  currentUser: null,
  authToken: localStorage.getItem('chai_auth_token') || null,
  activeCategory: 'all',
  activeNeighborhood: 'all',
  searchQuery: '',
  allSkills: [],
  selectedTargetUser: null
};

// DOM References
const DOM = {
  navbar: document.getElementById('navbar'),
  navLinks: document.getElementById('navLinks'),
  mobileMenuBtn: document.getElementById('mobileMenuBtn'),
  authGuest: document.getElementById('authGuest'),
  authUser: document.getElementById('authUser'),
  navUserName: document.getElementById('navUserName'),
  navUserAvatar: document.getElementById('navUserAvatar'),
  mySwapsCount: document.getElementById('mySwapsCount'),
  btnOpenLogin: document.getElementById('btnOpenLogin'),
  btnLogout: document.getElementById('btnLogout'),
  btnMySwaps: document.getElementById('btnMySwaps'),

  // Live Ticker
  liveTickerTrack: document.getElementById('liveTickerTrack'),

  // Matchmaker Simulator
  simTeachSelect: document.getElementById('simTeachSelect'),
  simLearnSelect: document.getElementById('simLearnSelect'),
  btnRunSimulator: document.getElementById('btnRunSimulator'),
  simResultBox: document.getElementById('simResultBox'),

  // Browse Skills
  skillsGrid: document.getElementById('skillsGrid'),
  countDisplay: document.getElementById('countDisplay'),
  skillSearchInput: document.getElementById('skillSearchInput'),
  clearSearchBtn: document.getElementById('clearSearchBtn'),
  areaFilter: document.getElementById('areaFilter'),
  categoryPills: document.getElementById('categoryPills'),
  emptySkillsState: document.getElementById('emptySkillsState'),

  // Stories
  storiesGrid: document.getElementById('storiesGrid'),

  // Join & Auth Form
  tabRegister: document.getElementById('tabRegister'),
  tabLogin: document.getElementById('tabLogin'),
  registerForm: document.getElementById('registerForm'),
  loginForm: document.getElementById('loginForm'),

  // Form Inputs for Live Preview
  regFullName: document.getElementById('regFullName'),
  regUsername: document.getElementById('regUsername'),
  regPassword: document.getElementById('regPassword'),
  regNeighborhood: document.getElementById('regNeighborhood'),
  regTeachSkill: document.getElementById('regTeachSkill'),
  regTeachCategory: document.getElementById('regTeachCategory'),
  regLearnSkill: document.getElementById('regLearnSkill'),
  regPreferredSpot: document.getElementById('regPreferredSpot'),
  regBio: document.getElementById('regBio'),

  // Live Card Preview DOM
  prevAvatar: document.getElementById('prevAvatar'),
  prevFullName: document.getElementById('prevFullName'),
  prevNeighborhood: document.getElementById('prevNeighborhood'),
  prevCategory: document.getElementById('prevCategory'),
  prevTeachSkill: document.getElementById('prevTeachSkill'),
  prevLearnSkill: document.getElementById('prevLearnSkill'),
  prevBio: document.getElementById('prevBio'),
  prevSpot: document.getElementById('prevSpot'),

  // Modals
  swapModal: document.getElementById('swapModal'),
  closeSwapModal: document.getElementById('closeSwapModal'),
  cancelSwapModal: document.getElementById('cancelSwapModal'),
  swapProposalForm: document.getElementById('swapProposalForm'),
  swapPartnerSummary: document.getElementById('swapPartnerSummary'),
  swapOfferedSkill: document.getElementById('swapOfferedSkill'),
  swapMeetupSpot: document.getElementById('swapMeetupSpot'),
  swapScheduledTime: document.getElementById('swapScheduledTime'),
  swapNote: document.getElementById('swapNote'),

  mySwapsModal: document.getElementById('mySwapsModal'),
  closeMySwapsModal: document.getElementById('closeMySwapsModal'),
  closeMySwapsModalBtn: document.getElementById('closeMySwapsModalBtn'),
  mySwapsList: document.getElementById('mySwapsList'),

  toastContainer: document.getElementById('toastContainer')
};

// ==========================================================================
// Toast Notification System
// ==========================================================================
function showToast(message, type = 'success') {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <span>${type === 'success' ? '☕' : '⚠️'}</span>
    <span>${message}</span>
  `;
  DOM.toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    setTimeout(() => toast.remove(), 300);
  }, 4500);
}

// ==========================================================================
// API Helpers
// ==========================================================================
async function apiRequest(endpoint, method = 'GET', data = null) {
  const headers = { 'Content-Type': 'application/json' };
  if (state.authToken) {
    headers['Authorization'] = `Bearer ${state.authToken}`;
  }

  const options = { method, headers };
  if (data && (method === 'POST' || method === 'PUT')) {
    options.body = JSON.stringify(data);
  }

  try {
    const res = await fetch(endpoint, options);
    const result = await res.json();
    return { ok: res.ok, status: res.status, data: result };
  } catch (err) {
    console.warn(`API call failed to ${endpoint}:`, err);
    return { ok: false, error: err.message };
  }
}

// ==========================================================================
// Authentication State Management
// ==========================================================================
async function checkAuthStatus() {
  if (!state.authToken) {
    updateAuthUI(null);
    return;
  }

  const res = await apiRequest('/api/me');
  if (res.ok && res.data && res.data.user) {
    state.currentUser = res.data.user;
    updateAuthUI(state.currentUser);
    if (state.currentUser.swaps) {
      DOM.mySwapsCount.textContent = state.currentUser.swaps.length;
    }
  } else {
    // Token invalid or expired
    state.authToken = null;
    localStorage.removeItem('chai_auth_token');
    updateAuthUI(null);
  }
}

function updateAuthUI(user) {
  if (user) {
    DOM.authGuest.classList.add('hidden');
    DOM.authUser.classList.remove('hidden');
    DOM.navUserName.textContent = user.full_name || user.fullName || user.username;
    DOM.navUserAvatar.textContent = user.avatar || '☕';
    if (DOM.regFullName && !DOM.regFullName.value) {
      DOM.regFullName.value = user.full_name || '';
      DOM.regNeighborhood.value = user.neighborhood || 'Indiranagar';
    }
  } else {
    DOM.authGuest.classList.remove('hidden');
    DOM.authUser.classList.add('hidden');
  }
}

// ==========================================================================
// Live Swaps Ticker
// ==========================================================================
async function loadRecentSwapsTicker() {
  const res = await apiRequest('/api/swaps/recent');
  if (res.ok && res.data && res.data.swaps && res.data.swaps.length > 0) {
    swaps = res.data.swaps;
  }

  if (swaps.length === 0) {
    DOM.liveTickerTrack.innerHTML = `
      <span class="ticker-item">
        <span>🌱 <strong>Welcome to Chai &amp; Code!</strong> Be the first neighbor to list a skill and propose a swap over tea.</span>
      </span>
    `;
    return;
  }

  // Render ticker track (double track for infinite marquee loop)
  const itemsHtml = swaps.map(s => `
    <span class="ticker-item">
      <span>☕ <strong>${s.requester_name}</strong> traded <em>"${s.skill_offered}"</em> for <strong>${s.receiver_name}'s</strong> <em>"${s.skill_requested}"</em> @ ${s.meetup_spot}</span>
      <span class="ticker-time">${s.created_at || 'Just now'}</span>
    </span>
  `).join('');

  DOM.liveTickerTrack.innerHTML = itemsHtml + itemsHtml;
}

// ==========================================================================
// Browse Skills & Filter Engine
// ==========================================================================
async function loadSkills() {
  DOM.skillsGrid.innerHTML = `
    <div class="loading-state">
      <div class="spinner"></div>
      <p>Brewing fresh skills from our neighborhood database...</p>
    </div>
  `;
  DOM.emptySkillsState.classList.add('hidden');

  const params = new URLSearchParams();
  if (state.activeCategory && state.activeCategory !== 'all') {
    params.set('category', state.activeCategory);
  }
  if (state.activeNeighborhood && state.activeNeighborhood !== 'all') {
    params.set('neighborhood', state.activeNeighborhood);
  }
  if (state.searchQuery) {
    params.set('search', state.searchQuery);
  }

  const endpoint = `/api/skills?${params.toString()}`;
  const res = await apiRequest(endpoint);

  if (res.ok && res.data && res.data.skills) {
    state.allSkills = res.data.skills;
    renderSkills(state.allSkills);
  } else {
    // If backend isn't ready or offline, render local mock
    renderSkills([]);
  }
}

function renderSkills(skills) {
  DOM.countDisplay.textContent = skills.length;

  if (skills.length === 0) {
    DOM.skillsGrid.innerHTML = '';
    DOM.emptySkillsState.classList.remove('hidden');
    return;
  }

  DOM.emptySkillsState.classList.add('hidden');
  DOM.skillsGrid.innerHTML = skills.map(skill => `
    <article class="skill-card" data-id="${skill.id}">
      <div class="card-header">
        <div class="author-info">
          <div class="avatar">${skill.avatar || '☕'}</div>
          <div>
            <h4 class="author-name">${skill.full_name || 'Neighbor'}</h4>
            <div class="author-location">
              <span class="location-pin">📍</span>
              <span>${skill.neighborhood || 'Local Area'}</span>
              <span class="verified-tag" title="Verified Community Member">✓ Verified</span>
            </div>
          </div>
        </div>
        <span class="category-chip">${formatCategory(skill.teach_category)}</span>
      </div>

      <div class="card-body">
        <div class="skill-row teach-row">
          <span class="skill-badge-label teach-label">Can Teach (${skill.teach_level || 'All Levels'})</span>
          <strong class="skill-name">${escapeHtml(skill.teach_skill)}</strong>
        </div>

        <div class="skill-row learn-row">
          <span class="skill-badge-label learn-label">Wants to Learn</span>
          <strong class="skill-name">${escapeHtml(skill.learn_skill)}</strong>
        </div>

        ${skill.description ? `<p class="skill-desc">"${escapeHtml(skill.description)}"</p>` : ''}
      </div>

      <div class="card-footer">
        <div class="cafe-spot" title="${escapeHtml(skill.preferred_spot)}">
          <span class="cafe-icon">☕</span>
          <span>${escapeHtml(skill.preferred_spot || 'Nearby Cafe')}</span>
        </div>
        <button class="btn btn-sm btn-primary btn-propose" 
          data-user-id="${skill.user_id}" 
          data-user-name="${escapeHtml(skill.full_name)}"
          data-teach-skill="${escapeHtml(skill.teach_skill)}"
          data-learn-skill="${escapeHtml(skill.learn_skill)}"
          data-spot="${escapeHtml(skill.preferred_spot)}">
          Propose a Swap
        </button>
      </div>
    </article>
  `).join('');

  // Attach click listeners to "Propose a Swap" buttons
  DOM.skillsGrid.querySelectorAll('.btn-propose').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = {
        userId: btn.dataset.userId,
        userName: btn.dataset.userName,
        teachSkill: btn.dataset.teachSkill,
        learnSkill: btn.dataset.learnSkill,
        spot: btn.dataset.spot
      };
      openSwapModal(target);
    });
  });
}

function formatCategory(cat) {
  const map = {
    tech: 'Tech & Code',
    language: 'Language',
    music: 'Music',
    cooking: 'Cooking',
    crafts: 'Crafts & DIY',
    business: 'Business'
  };
  return map[cat] || cat || 'Skill';
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>'"]/g, tag => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  }[tag] || tag));
}

// ==========================================================================
// Community Stories
// ==========================================================================
async function loadCommunityStories() {
  const res = await apiRequest('/api/stories');
  let stories = [];
  if (res.ok && res.data && res.data.stories) {
    stories = res.data.stories;
  } else {
    stories = [
      {
        user1_name: 'Priya S.', user2_name: 'Rohan V.', user1_avatar: '👩🏽‍💻', user2_avatar: '👨🏽‍🍳',
        skill1: 'Advanced Excel', skill2: 'Sourdough Baking',
        quote: 'I went from messy spreadsheets to clean automated finance sheets in two meetings, and taught Rohan how to bake crisp sourdough over masala chai!',
        cafe_spot: 'Third Wave Coffee', neighborhood: 'Indiranagar'
      },
      {
        user1_name: 'David C.', user2_name: 'Sneha P.', user1_avatar: '💻', user2_avatar: '🇫🇷',
        skill1: 'React Web Dev', skill2: 'French Basics',
        quote: 'Sneha coached me on everyday French conversations before my trip to Lyon. In return, I built her a personal portfolio site with animations!',
        cafe_spot: 'Central Public Library', neighborhood: 'Koramangala'
      },
      {
        user1_name: 'Grandma Usha', user2_name: 'Arjun K.', user1_avatar: '👵🏽', user2_avatar: '📱',
        skill1: 'Crochet & Kaapi', skill2: 'Smartphone Photography',
        quote: 'Arjun patiently taught me how to shoot sharp portrait photos of my garden flowers on my phone. In exchange, I knit him a cozy winter muffler over filter coffee.',
        cafe_spot: 'CTR Heritage Cafe', neighborhood: 'Malleshwaram'
      }
    ];
  }

  DOM.storiesGrid.innerHTML = stories.map(st => `
    <article class="story-card">
      <div class="story-quote-icon">“</div>
      <p class="story-quote">${st.quote}</p>
      <div class="story-meta">
        <div class="story-avatars">
          <div class="story-avatar-bubble">${st.user1_avatar || '☕'}</div>
          <div class="story-avatar-bubble">${st.user2_avatar || '🍵'}</div>
        </div>
        <div class="story-names">
          <span class="story-pair-names">${st.user1_name} &amp; ${st.user2_name}</span>
          <span class="story-tags">${st.skill1} ⇄ ${st.skill2}</span>
          <span class="story-cafe">📍 ${st.cafe_spot} (${st.neighborhood})</span>
        </div>
      </div>
    </article>
  `).join('');
}

// ==========================================================================
// Interactive Matchmaker Simulator
// ==========================================================================
function setupSimulator() {
  DOM.btnRunSimulator.addEventListener('click', () => {
    const teach = DOM.simTeachSelect.value;
    const learn = DOM.simLearnSelect.value;

    DOM.simResultBox.innerHTML = `
      <div class="sim-match-content">
        <span>🎉 <strong>Match Found!</strong> We found <strong>3 neighbors</strong> in your area who can teach you <em>${formatCategory(learn)}</em> and are looking for <em>${formatCategory(teach)}</em> skills!</span>
        <a href="#browse-skills" class="btn btn-sm btn-primary" style="margin-left: 14px;" onclick="setCategoryFilter('${learn}')">
          View Matches
        </a>
      </div>
    `;
  });

  // Run once initially
  DOM.btnRunSimulator.click();
}

window.setCategoryFilter = function(category) {
  state.activeCategory = category;
  DOM.categoryPills.querySelectorAll('.pill-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.category === category);
  });
  loadSkills();
};

// ==========================================================================
// Live Card Preview in Sign-Up Form
// ==========================================================================
function updateLiveCardPreview() {
  const fullName = DOM.regFullName.value.trim() || 'Your Name';
  const neighborhood = DOM.regNeighborhood.value || 'Indiranagar';
  const teachSkill = DOM.regTeachSkill.value.trim() || 'What you can teach...';
  const learnSkill = DOM.regLearnSkill.value.trim() || 'What you want to learn...';
  const category = DOM.regTeachCategory.value || 'tech';
  const spot = DOM.regPreferredSpot.value.trim() || 'Preferred Local Cafe / Library';
  const bio = DOM.regBio.value.trim() || 'I can teach you my skills over 2 cups of chai at our local café!';

  DOM.prevFullName.textContent = fullName;
  DOM.prevNeighborhood.textContent = neighborhood;
  DOM.prevTeachSkill.textContent = teachSkill;
  DOM.prevLearnSkill.textContent = learnSkill;
  DOM.prevCategory.textContent = formatCategory(category);
  DOM.prevSpot.textContent = spot;
  DOM.prevBio.textContent = `"${bio}"`;
}

// ==========================================================================
// Swap Proposal Modal
// ==========================================================================
function openSwapModal(targetUser) {
  state.selectedTargetUser = targetUser;

  DOM.swapPartnerSummary.innerHTML = `
    <div><strong>Neighbor:</strong> ${targetUser.userName}</div>
    <div><strong>They can teach you:</strong> <span style="color: var(--primary); font-weight: 700;">${targetUser.teachSkill}</span></div>
    <div><strong>They are looking to learn:</strong> ${targetUser.learnSkill}</div>
  `;

  // Pre-fill suggested fields
  DOM.swapOfferedSkill.value = targetUser.learnSkill || (state.currentUser ? state.currentUser.teachSkill || '' : '');
  DOM.swapMeetupSpot.value = targetUser.spot || 'Third Wave Coffee or Central Library';
  DOM.swapScheduledTime.value = 'This Saturday, 4:00 PM';
  DOM.swapNote.value = `Hi ${targetUser.userName}! I saw your listing for ${targetUser.teachSkill}. I would love to trade skills over hot chai!`;

  if (typeof DOM.swapModal.showModal === 'function') {
    DOM.swapModal.showModal();
  } else {
    DOM.swapModal.setAttribute('open', '');
  }
}

function closeSwapDialog() {
  if (typeof DOM.swapModal.close === 'function') {
    DOM.swapModal.close();
  } else {
    DOM.swapModal.removeAttribute('open');
  }
}

async function handleSwapProposalSubmit(e) {
  e.preventDefault();

  if (!state.currentUser) {
    showToast('Please log in or sign up first to propose a swap over chai!', 'error');
    closeSwapDialog();
    // Switch to register tab and scroll
    DOM.tabRegister.click();
    window.location.hash = '#join';
    return;
  }

  const payload = {
    receiverId: state.selectedTargetUser.userId,
    skillOffered: DOM.swapOfferedSkill.value.trim(),
    skillRequested: state.selectedTargetUser.teachSkill,
    meetupSpot: DOM.swapMeetupSpot.value.trim(),
    scheduledTime: DOM.swapScheduledTime.value.trim(),
    note: DOM.swapNote.value.trim()
  };

  const res = await apiRequest('/api/swaps', 'POST', payload);
  if (res.ok) {
    showToast(`Swap proposed to ${state.selectedTargetUser.userName}! Meet over chai arranged.`, 'success');
    closeSwapDialog();
    checkAuthStatus(); // Refresh swaps count
  } else {
    showToast(res.data?.error || 'Could not send proposal. Check your connection.', 'error');
  }
}

// ==========================================================================
// My Swaps Modal Dashboard
// ==========================================================================
async function openMySwapsModal() {
  if (!state.currentUser) {
    showToast('Please log in to view your swaps.', 'error');
    return;
  }

  DOM.mySwapsList.innerHTML = '<div class="spinner"></div>';
  if (typeof DOM.mySwapsModal.showModal === 'function') {
    DOM.mySwapsModal.showModal();
  } else {
    DOM.mySwapsModal.setAttribute('open', '');
  }

  const res = await apiRequest('/api/me');
  if (res.ok && res.data && res.data.user && res.data.user.swaps) {
    const swaps = res.data.user.swaps;
    if (swaps.length === 0) {
      DOM.mySwapsList.innerHTML = `
        <div class="empty-state" style="padding: 20px;">
          <p>You have no active swaps yet! Browse neighbor skills and propose your first swap over chai.</p>
        </div>
      `;
      return;
    }

    DOM.mySwapsList.innerHTML = swaps.map(sw => `
      <div class="my-swap-item">
        <div class="my-swap-details">
          <strong>${sw.requester_name} ⇄ ${sw.receiver_name}</strong>
          <span>Trading: <em>${sw.skill_offered}</em> for <em>${sw.skill_requested}</em></span>
          <span style="color: var(--primary);">📍 Meetup: ${sw.meetup_spot} (${sw.scheduled_time || 'Time TBD'})</span>
        </div>
        <span class="swap-status-badge status-${(sw.status || 'pending').toLowerCase()}">
          ${sw.status || 'Pending'}
        </span>
      </div>
    `).join('');
  }
}

function closeMySwapsDialog() {
  if (typeof DOM.mySwapsModal.close === 'function') {
    DOM.mySwapsModal.close();
  } else {
    DOM.mySwapsModal.removeAttribute('open');
  }
}

// ==========================================================================
// Event Listeners & Initialization
// ==========================================================================
function initEventListeners() {
  // Mobile Hamburger Menu
  DOM.mobileMenuBtn.addEventListener('click', () => {
    DOM.navLinks.classList.toggle('open');
  });

  // Close mobile nav when clicking a link
  DOM.navLinks.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
      DOM.navLinks.classList.remove('open');
    });
  });

  // Auth Tabs (Join vs Login)
  DOM.tabRegister.addEventListener('click', () => {
    DOM.tabRegister.classList.add('active');
    DOM.tabLogin.classList.remove('active');
    DOM.registerForm.classList.remove('hidden');
    DOM.loginForm.classList.add('hidden');
  });

  DOM.tabLogin.addEventListener('click', () => {
    DOM.tabLogin.classList.add('active');
    DOM.tabRegister.classList.remove('active');
    DOM.loginForm.classList.remove('hidden');
    DOM.registerForm.classList.add('hidden');
  });

  DOM.btnOpenLogin.addEventListener('click', () => {
    DOM.tabLogin.click();
    window.location.hash = '#join';
  });

  // Live Card Preview Input Listeners
  [
    DOM.regFullName, DOM.regNeighborhood, DOM.regTeachSkill,
    DOM.regTeachCategory, DOM.regLearnSkill, DOM.regPreferredSpot, DOM.regBio
  ].forEach(input => {
    if (input) {
      input.addEventListener('input', updateLiveCardPreview);
      input.addEventListener('change', updateLiveCardPreview);
    }
  });

  // Registration Form Submission (SQLite Backend)
  DOM.registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      fullName: DOM.regFullName.value.trim(),
      username: DOM.regUsername.value.trim(),
      password: DOM.regPassword.value.trim(),
      neighborhood: DOM.regNeighborhood.value,
      teachSkill: DOM.regTeachSkill.value.trim(),
      teachCategory: DOM.regTeachCategory.value,
      learnSkill: DOM.regLearnSkill.value.trim(),
      preferredSpot: DOM.regPreferredSpot.value.trim(),
      bio: DOM.regBio.value.trim()
    };

    DOM.registerForm.querySelector('button[type="submit"]').disabled = true;
    const res = await apiRequest('/api/register', 'POST', payload);
    DOM.registerForm.querySelector('button[type="submit"]').disabled = false;

    if (res.ok && res.data) {
      state.authToken = res.data.token;
      localStorage.setItem('chai_auth_token', state.authToken);
      state.currentUser = res.data.user;
      updateAuthUI(state.currentUser);

      showToast(`Welcome, ${state.currentUser.fullName}! Your skill card is now live.`, 'success');
      loadSkills(); // Refresh directory with new skill card!
      loadRecentSwapsTicker();

      // Smooth scroll to Browse section to see their new card
      setTimeout(() => {
        window.location.hash = '#browse-skills';
      }, 800);
    } else {
      showToast(res.data?.error || 'Registration failed. Please check inputs.', 'error');
    }
  });

  // Login Form Submission (SQLite Backend with PBKDF2 Password Check)
  DOM.loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('loginUsername').value.trim();
    const password = document.getElementById('loginPassword').value.trim();

    DOM.loginForm.querySelector('button[type="submit"]').disabled = true;
    const res = await apiRequest('/api/login', 'POST', { username, password });
    DOM.loginForm.querySelector('button[type="submit"]').disabled = false;

    if (res.ok && res.data) {
      state.authToken = res.data.token;
      localStorage.setItem('chai_auth_token', state.authToken);
      state.currentUser = res.data.user;
      updateAuthUI(state.currentUser);
      showToast(res.data.message || `Logged in as ${state.currentUser.fullName}!`, 'success');
      loadSkills();
    } else {
      showToast(res.data?.error || 'Invalid credentials.', 'error');
    }
  });

  // Logout
  DOM.btnLogout.addEventListener('click', async () => {
    await apiRequest('/api/logout', 'POST');
    state.authToken = null;
    state.currentUser = null;
    localStorage.removeItem('chai_auth_token');
    updateAuthUI(null);
    showToast('Logged out successfully. See you at the next chai meetup!');
  });

  // Category Filter Pills
  DOM.categoryPills.addEventListener('click', (e) => {
    const pill = e.target.closest('.pill-btn');
    if (!pill) return;
    DOM.categoryPills.querySelectorAll('.pill-btn').forEach(btn => btn.classList.remove('active'));
    pill.classList.add('active');
    state.activeCategory = pill.dataset.category;
    loadSkills();
  });

  // Neighborhood Area Filter
  DOM.areaFilter.addEventListener('change', () => {
    state.activeNeighborhood = DOM.areaFilter.value;
    loadSkills();
  });

  // Search Input with Debounce
  let searchTimeout = null;
  DOM.skillSearchInput.addEventListener('input', () => {
    const query = DOM.skillSearchInput.value.trim();
    DOM.clearSearchBtn.classList.toggle('hidden', !query);
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      state.searchQuery = query;
      loadSkills();
    }, 250);
  });

  DOM.clearSearchBtn.addEventListener('click', () => {
    DOM.skillSearchInput.value = '';
    DOM.clearSearchBtn.classList.add('hidden');
    state.searchQuery = '';
    loadSkills();
  });

  // Swap Modal Handlers
  DOM.closeSwapModal.addEventListener('click', closeSwapDialog);
  DOM.cancelSwapModal.addEventListener('click', closeSwapDialog);
  DOM.swapProposalForm.addEventListener('submit', handleSwapProposalSubmit);

  // My Swaps Modal Handlers
  DOM.btnMySwaps.addEventListener('click', openMySwapsModal);
  DOM.closeMySwapsModal.addEventListener('click', closeMySwapsDialog);
  DOM.closeMySwapsModalBtn.addEventListener('click', closeMySwapsDialog);

  // Close modals on clicking backdrop
  [DOM.swapModal, DOM.mySwapsModal].forEach(modal => {
    modal.addEventListener('click', (e) => {
      const rect = modal.getBoundingClientRect();
      const isInDialog = (
        rect.top <= e.clientY && e.clientY <= rect.top + rect.height &&
        rect.left <= e.clientX && e.clientX <= rect.left + rect.width
      );
      if (!isInDialog) {
        modal.close();
      }
    });
  });

  // Active Nav Scroll Spy
  window.addEventListener('scroll', () => {
    const sections = document.querySelectorAll('section[id]');
    const scrollY = window.pageYOffset + 120;

    sections.forEach(current => {
      const sectionHeight = current.offsetHeight;
      const sectionTop = current.offsetTop;
      const sectionId = current.getAttribute('id');
      const navItem = document.querySelector(`.nav-links a[href*="${sectionId}"]`);

      if (navItem) {
        if (scrollY > sectionTop && scrollY <= sectionTop + sectionHeight) {
          navItem.classList.add('active');
        } else {
          navItem.classList.remove('active');
        }
      }
    });
  });
}

// Initial bootstrap
document.addEventListener('DOMContentLoaded', () => {
  checkAuthStatus();
  loadRecentSwapsTicker();
  loadSkills();
  loadCommunityStories();
  setupSimulator();
  updateLiveCardPreview();
  initEventListeners();
});
