const root = document.querySelector('#root');
const toastElement = document.querySelector('#toast');
const categories = ['Mobile phones', 'Laptops', 'Desktop computers', 'Batteries', 'Televisions', 'Monitors', 'Printers', 'Other electronic devices'];
const states = ['REQUESTED', 'ASSIGNED', 'COLLECTED', 'RECEIVED', 'RECYCLED'];
let token = sessionStorage.getItem('ecocycleToken');
let currentUser = null;
let currentView = 'overview';
let authMode = 'login';
let pickupNotice = null;
let managedStaff = [];
let toastTimer;
let walletListenerProvider = null;

const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const formatDate = value => value ? new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : 'Not scheduled';
const formatTime = value => value ? new Date(value).toLocaleString() : 'Not recorded';
const compactAddress = value => value ? `${value.slice(0, 6)}...${value.slice(-4)}` : 'Wallet not connected';
const statusClass = status => `status status-${String(status || '').toLowerCase()}`;

function showToast(message, isError = false) {
  clearTimeout(toastTimer);
  toastElement.textContent = message;
  toastElement.className = isError ? 'show error' : 'show';
  toastTimer = setTimeout(() => { toastElement.className = ''; }, 3400);
}

async function api(url, options = {}) {
  const headers = { Accept: 'application/json', ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const bodyIsForm = options.body instanceof FormData;
  if (options.body && !bodyIsForm) headers['Content-Type'] = 'application/json';
  let response;
  try { response = await fetch(url, { ...options, headers }); }
  catch { throw new Error('EcoCycle could not reach the server. Check that the backend is running.'); }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && token) logout(false);
    throw new Error(payload.error || `Request failed (${response.status}).`);
  }
  return payload;
}

function heading(title, description, action = '') {
  return `<div class="page-heading"><div><h1>${esc(title)}</h1><p>${esc(description)}</p></div>${action}</div>`;
}

function emptyState(title, message, action = '') {
  return `<div class="empty"><div class="empty-mark">+</div><h3>${esc(title)}</h3><p>${esc(message)}</p>${action}</div>`;
}

function stat(label, value, note, icon) {
  return `<div class="stat"><div class="stat-head"><span>${esc(label)}</span><span class="stat-icon">${icon}</span></div><strong class="stat-value">${esc(value)}</strong><small class="stat-note">${esc(note)}</small></div>`;
}

function renderAuth() {
  root.innerHTML = `
    <main class="auth-layout">
      <section class="auth-visual" aria-label="Electronic components ready for responsible reuse">
        <a class="brand brand-light" href="/"><span class="brand-mark"></span>EcoCycle</a>
        <div class="visual-copy"><span class="eyebrow">A better end for old electronics</span><h1>Waste, reimagined.</h1><p>Give electronics a responsible next step. Track every collection, see verified recycling, and earn points for doing the right thing.</p></div>
        <div class="visual-foot">Collection with care. Recycling with proof.</div>
      </section>
      <section class="auth-main"><div class="auth-card">
        <h2>${authMode === 'login' ? 'Welcome back' : 'Create your account'}</h2>
        <p>${authMode === 'login' ? 'Sign in to manage your collection and rewards.' : 'Join the circular cycle for your electronics.'}</p>
        <div class="auth-tabs" role="tablist"><button type="button" data-action="auth-mode" data-mode="login" class="${authMode === 'login' ? 'active' : ''}">Sign in</button><button type="button" data-action="auth-mode" data-mode="register" class="${authMode === 'register' ? 'active' : ''}">Create account</button></div>
        <form id="auth-form">
          ${authMode === 'register' ? '<div class="field"><label for="auth-name">Full name</label><input id="auth-name" name="name" autocomplete="name" required minlength="2" maxlength="100" placeholder="Your name"></div>' : ''}
          <div class="field"><label for="auth-email">Email address</label><input id="auth-email" name="email" type="email" autocomplete="email" required maxlength="254" placeholder="you@example.com"></div>
          <div class="field"><label for="auth-password">Password</label><div class="password-control"><input id="auth-password" name="password" type="password" autocomplete="${authMode === 'login' ? 'current-password' : 'new-password'}" required minlength="1" maxlength="72" placeholder="${authMode === 'register' ? 'Enter a password' : 'Your password'}"><button class="password-toggle" type="button" data-action="toggle-password" data-target="auth-password" aria-label="Show password" aria-pressed="false">${passwordIcon(false)}</button></div></div>
          <button class="button button-block" type="submit">${authMode === 'login' ? 'Sign in' : 'Create account'} <span aria-hidden="true">&#8594;</span></button>
        </form>
        <p class="fine-print">By continuing, you agree to responsible collection and recycling practices.</p>
      </div></section>
    </main>`;
}

const navByRole = {
  user: [
    ['overview', 'Overview', '◫'], ['register', 'Register e-waste', '+'], ['requests', 'My collections', '↗'], ['rewards', 'My rewards', '✳'], ['transactions', 'Blockchain records', '⌘'], ['profile', 'My profile', '♙']
  ],
  agent: [['overview', 'Assigned collections', '◫'], ['collection-history', 'Collection history', '↗']],
  recycler: [['overview', 'Recycling queue', '◫'], ['recycler-history', 'Recycling history', '↻']],
  admin: [['overview', 'Overview', '◫'], ['admin-requests', 'Manage requests', '↗'], ['people', 'People & staff', '♙'], ['transactions', 'Blockchain records', '⌘']]
};

const viewTitles = {
  overview: 'Overview', register: 'Register e-waste', requests: 'My collections', rewards: 'My rewards', transactions: 'Blockchain records',
  'collection-history': 'Collection history', 'recycler-history': 'Recycling history', 'admin-requests': 'Manage requests', people: 'People & staff', profile: 'My profile'
};

function renderShell() {
  const nav = navByRole[currentUser.role] || navByRole.user;
  root.innerHTML = `
    <div class="app-shell">
      <aside class="sidebar" id="sidebar">
        <a class="brand" href="#overview"><span class="brand-mark"></span>EcoCycle</a>
        <div class="nav-label">Workspace</div>
        <nav class="nav-list" aria-label="Main navigation">${nav.map(([view, label, icon]) => `<button class="nav-item ${currentView === view ? 'active' : ''}" data-view="${view}" type="button"><span class="nav-symbol" aria-hidden="true">${icon}</span>${label}</button>`).join('')}</nav>
        <div class="sidebar-bottom"><div class="user-chip"><span class="avatar">${esc(currentUser.name.slice(0, 1).toUpperCase())}</span><div><strong>${esc(currentUser.name)}</strong><small>${esc(currentUser.role)}</small></div></div><button class="logout-button" type="button" data-action="logout">Sign out</button></div>
      </aside>
      <section class="workspace">
        <header class="topbar"><div style="display:flex;align-items:center;gap:12px"><button type="button" class="menu-button" data-action="menu" aria-label="Open navigation">&#9776;</button><span class="crumb">EcoCycle / ${esc(viewTitles[currentView] || 'Overview')}</span></div><div class="top-actions">${currentUser.role === 'user' ? `<span class="wallet-label">${esc(compactAddress(currentUser.walletAddress))}</span><button type="button" class="button button-outline button-small" data-action="wallet">${currentUser.walletAddress ? 'Wallet connected' : 'Connect wallet'}</button>` : ''}</div></header>
        <main class="content" id="content"><div class="loading">Loading your workspace...</div></main>
      </section>
    </div>`;
}

async function openView(view) {
  currentView = view;
  const valid = (navByRole[currentUser.role] || []).some(item => item[0] === view);
  if (!valid) currentView = (navByRole[currentUser.role] || navByRole.user)[0][0];
  renderShell();
  const content = document.querySelector('#content');
  try { content.innerHTML = await viewContent(currentView); }
  catch (error) { content.innerHTML = `${heading('Unable to load this view', 'The request could not be completed.')}<div class="panel panel-pad"><p>${esc(error.message)}</p><button class="button button-outline" data-action="refresh" type="button">Try again</button></div>`; }
}

async function viewContent(view) {
  if (currentUser.role === 'user') {
    if (view === 'overview') return userOverview();
    if (view === 'register') return registrationView();
    if (view === 'requests') return requestList();
    if (view === 'rewards') return rewardsView();
    if (view === 'transactions') return transactionView();
    if (view === 'profile') return profileView();
  }
  if (currentUser.role === 'agent') return agentView(view === 'collection-history');
  if (currentUser.role === 'recycler') return recyclerView(view === 'recycler-history');
  if (currentUser.role === 'admin') {
    if (view === 'overview') return adminOverview();
    if (view === 'admin-requests') return adminRequests();
    if (view === 'people') return peopleView();
    if (view === 'transactions') return transactionView();
  }
  return emptyState('No view available', 'Your account does not have access to this section.');
}

async function userOverview() {
  const [{ requests = [] }, { points = 0 }] = await Promise.all([api('/api/waste/mine'), api('/api/rewards/balance')]);
  const active = requests.filter(request => request.status !== 'RECYCLED').length;
  const recycledKg = requests.filter(request => request.status === 'RECYCLED').reduce((sum, item) => sum + item.weightKg, 0);
  const action = '<button class="button button-small" type="button" data-view="register">+ Register devices</button>';
  const recent = requests.slice(0, 5);
  return `${heading(`Hello, ${currentUser.name.split(' ')[0]}`, 'Here is the latest on your electronics cycle.', action)}
    ${!currentUser.walletAddress ? '<div class="wallet-banner"><div><h3>Connect your wallet</h3><p>Verified recycling rewards are linked to your Ethereum address.</p></div><button type="button" class="button" data-action="wallet">Connect MetaMask</button></div>' : ''}
    <div class="stats-grid">${stat('Active requests', active, `${requests.length} total registrations`, '↗')}${stat('Recycled weight', `${recycledKg.toFixed(1)} kg`, 'Verified recycling only', '↻')}${stat('Available points', points, 'Points from confirmed recycling', '✳')}${stat('Registered devices', requests.reduce((sum, item) => sum + item.quantity, 0), 'Across your requests', '▤')}</div>
    <section class="section"><div class="section-head"><h2>Recent requests</h2><button class="text-link" type="button" data-view="requests">View all</button></div>${recent.length ? requestTable(recent, false) : `<div class="panel">${emptyState('Nothing registered yet', 'Add an old device to start a tracked collection.', '<button class="button button-small" type="button" data-view="register">Register e-waste</button>')}</div>`}</section>`;
}

function requestTable(requests, showOwner) {
  return `<div class="panel table-wrap"><table><thead><tr><th>Request</th>${showOwner ? '<th>Resident</th>' : ''}<th>Device</th><th>Collection date</th><th>Status</th></tr></thead><tbody>${requests.map(item => `<tr><td><strong>${esc(item.requestId)}</strong></td>${showOwner ? `<td>${esc(item.user?.name || 'Resident')}</td>` : ''}<td>${esc(item.deviceName)}<div class="muted">${esc(item.weightKg)} kg</div></td><td>${formatDate(item.preferredDate)}</td><td><span class="${statusClass(item.status)}">${esc(item.status)}</span></td></tr>`).join('')}</tbody></table></div>`;
}

function registrationView() {
  const minimum = new Date().toISOString().slice(0, 10);
  return `${heading('Register e-waste', 'Tell us what you are ready to recycle and where to collect it.')}
    ${pickupNotice ? `<div class="notice"><strong>Pickup code for ${esc(pickupNotice.requestId)}: ${esc(pickupNotice.otp)}</strong><br>Share this one-time code with your assigned collection agent when they arrive.</div>` : ''}
    <form class="panel panel-pad" id="waste-form" enctype="multipart/form-data">
      <div class="form-grid">
        <div class="field"><label for="device-name">Device name</label><input id="device-name" name="deviceName" required minlength="2" maxlength="120" placeholder="e.g. 2019 laptop"></div>
        <div class="field"><label for="category">Category</label><select id="category" name="category" required>${categories.map(item => `<option>${esc(item)}</option>`).join('')}</select></div>
        <div class="field"><label for="quantity">Quantity</label><input id="quantity" name="quantity" type="number" min="1" max="1000" step="1" required value="1"></div>
        <div class="field"><label for="weight">Approximate total weight (kg)</label><input id="weight" name="weightKg" type="number" min="0.1" max="10000" step="0.1" required placeholder="e.g. 2.5"></div>
        <div class="field"><label for="condition">Condition</label><select id="condition" name="condition" required><option>Working</option><option>Damaged</option><option>Non-functional</option><option>Mixed</option></select></div>
        <div class="field"><label for="pickup-date">Preferred collection date</label><input id="pickup-date" name="preferredDate" type="date" min="${minimum}" required></div>
        <div class="field span-2"><label for="address">Pickup address</label><textarea id="address" name="pickupAddress" required minlength="8" maxlength="500" placeholder="Street, city, postal code"></textarea></div>
        <div class="field span-2"><label for="description">Additional details</label><textarea id="description" name="description" maxlength="2000" placeholder="Brand, accessories, or collection notes (optional)"></textarea></div>
        <div class="field span-2"><label for="photo">Device photograph (JPEG, PNG, WebP; up to 5 MB)</label><input id="photo" name="photo" type="file" accept="image/jpeg,image/png,image/webp" required></div>
      </div>
      <button class="button" type="submit">Submit collection request <span aria-hidden="true">&#8594;</span></button>
    </form>`;
}

async function requestList() {
  const { requests = [] } = await api('/api/waste/mine');
  return `${heading('My collections', 'Track each device from request to verified recycling.')}${requests.length ? `<div class="request-list">${requests.map(item => `<article class="request-card"><div class="request-top"><div><h3>${esc(item.deviceName)} <span class="muted">· ${esc(item.requestId)}</span></h3><div class="muted" style="font-size:11px">${esc(item.category)} · ${esc(item.quantity)} item(s)</div></div><span class="${statusClass(item.status)}">${esc(item.status)}</span></div><div class="request-meta"><span>${esc(item.weightKg)} kg</span><span>Collection: ${formatDate(item.preferredDate)}</span><span>Agent: ${esc(item.assignedAgent?.name || 'Not assigned')}</span><span>Recycler: ${esc(item.assignedRecycler?.name || 'Not assigned')}</span></div>${item.status === 'RECYCLED' ? `<div class="request-meta"><span>Recycled: ${formatDate(item.recycledAt)}</span><span>Recycler reference: ${esc(item.recyclerReference)}</span></div>` : ''}</article>`).join('')}</div>` : `<div class="panel">${emptyState('No collection requests', 'Your registered devices will appear here with live status updates.', '<button class="button button-small" data-view="register" type="button">Register e-waste</button>')}</div>`}`;
}

async function rewardsView() {
  const [{ points = 0 }, { rewards = [] }] = await Promise.all([api('/api/rewards/balance'), api('/api/rewards/history')]);
  return `${heading('My rewards', 'Points are credited only after blockchain-confirmed recycling.')}
    <div class="stats-grid" style="grid-template-columns:repeat(2,minmax(0,1fr));max-width:620px">${stat('Available points', points, '10 points per verified kg', '✳')}${stat('Reward events', rewards.length, 'Credits and redemptions', '↻')}</div>
    <div class="panel panel-pad"><div class="section-head"><h2>Redeem points</h2></div><form id="redeem-form" class="inline-form"><div class="field"><label for="redeem-points">Points to redeem</label><input id="redeem-points" name="points" type="number" min="1" max="${Math.max(1, points)}" step="1" required ${points < 1 ? 'disabled' : ''} placeholder="Available: ${points}"></div><button class="button button-small" type="submit" ${points < 1 ? 'disabled' : ''}>Redeem</button></form></div>
    <section class="section"><div class="section-head"><h2>Reward history</h2></div>${rewards.length ? `<div class="panel table-wrap"><table><thead><tr><th>Activity</th><th>Request</th><th>Points</th><th>Blockchain transaction</th><th>Date</th></tr></thead><tbody>${rewards.map(item => `<tr><td><strong>${esc(item.type)}</strong><div class="muted">${esc(item.description)}</div></td><td>${esc(item.requestId || '—')}</td><td>${item.type === 'REDEMPTION' ? '−' : '+'}${esc(item.points)}</td><td>${item.blockchainTransaction ? `<a class="chain-hash" href="#transactions">${esc(item.blockchainTransaction.transactionHash)}</a>` : '—'}</td><td>${formatDate(item.createdAt)}</td></tr>`).join('')}</tbody></table></div>` : `<div class="panel">${emptyState('Your reward history is empty', 'Complete verified recycling to receive points.')}</div>`}</section>`;
}

async function transactionView() {
  const { transactions = [] } = await api('/api/blockchain/transactions');
  let contractInfo = null;
  if (currentUser.role === 'admin') contractInfo = await api('/api/blockchain/contract-info').catch(() => null);
  return `${heading('Blockchain records', 'Immutable recycling confirmations recorded on the local Ethereum network.')}
    ${contractInfo ? `<div class="notice"><strong>Registry:</strong> ${esc(contractInfo.address)} · ${esc(contractInfo.network)} · chain ${esc(contractInfo.chainId)}</div>` : ''}
    ${transactions.length ? `<div class="panel table-wrap"><table><thead><tr><th>Request</th><th>Wallet</th><th>Weight</th><th>Points</th><th>Transaction hash</th><th>Confirmed</th></tr></thead><tbody>${transactions.map(item => `<tr><td><strong>${esc(item.requestId)}</strong><div class="muted">${esc(item.request?.deviceName || '')}</div></td><td>${esc(compactAddress(item.walletAddress))}</td><td>${(item.weightGrams / 1000).toFixed(2)} kg</td><td>${esc(item.rewardPoints)}</td><td><span class="chain-hash" title="${esc(item.transactionHash)}">${esc(item.transactionHash)}</span></td><td>${formatTime(item.confirmedAt)}</td></tr>`).join('')}</tbody></table></div>` : `<div class="panel">${emptyState('No confirmed recycling yet', 'Blockchain records appear here after recycler verification and transaction confirmation.')}</div>`}`;
}

async function agentView(historyOnly) {
  const { collections = [] } = await api('/api/collection/history');
  const filtered = historyOnly ? collections : collections.filter(entry => entry.status === 'ASSIGNED');
  const title = historyOnly ? 'Collection history' : 'Assigned collections';
  const description = historyOnly ? 'Pickups you have verified and requests assigned to you.' : 'Verify a pickup with the one-time code provided by the resident.';
  return `${heading(title, description)}${filtered.length ? `<div class="request-list">${filtered.map(entry => {
    const item = entry.request || {};
    return `<article class="request-card"><div class="request-top"><div><h3>${esc(item.deviceName || 'Waste request')} <span class="muted">· ${esc(item.requestId)}</span></h3><div class="muted" style="font-size:11px">Resident: ${esc(item.user?.name || 'Resident')}</div></div><span class="${statusClass(entry.status)}">${esc(entry.status)}</span></div><div class="request-meta"><span>${esc(item.category)}</span><span>${esc(item.weightKg)} kg</span><span>${formatDate(item.preferredDate)}</span><span>${esc(item.pickupAddress)}</span></div>${entry.status === 'ASSIGNED' ? `<form class="inline-form" data-verify-form="${esc(item._id)}"><div class="field"><label for="otp-${esc(item._id)}">Resident pickup code</label><input id="otp-${esc(item._id)}" name="otp" inputmode="numeric" pattern="[0-9]{6}" minlength="6" maxlength="6" required placeholder="6-digit code"></div><button class="button button-small" type="submit">Verify collection</button></form>` : `<div class="request-meta"><span>Verified: ${formatTime(entry.verifiedAt)}</span></div>`}</article>`;
  }).join('')}</div>` : `<div class="panel">${emptyState('No collections to show', historyOnly ? 'Verified pickups will appear in your history.' : 'Newly assigned pickups will appear here.')}</div>`}`;
}

async function recyclerView(historyOnly) {
  const { requests = [] } = await api(historyOnly ? '/api/recycler/history' : '/api/recycler/available');
  const list = historyOnly ? requests.filter(item => item.status === 'RECYCLED') : requests.filter(item => item.status !== 'RECYCLED');
  return `${heading(historyOnly ? 'Recycling history' : 'Recycling queue', historyOnly ? 'Completed recycling events assigned to your organization.' : 'Receive collected e-waste and verify its recycling when complete.')}${list.length ? `<div class="request-list">${list.map(item => `<article class="request-card"><div class="request-top"><div><h3>${esc(item.deviceName)} <span class="muted">· ${esc(item.requestId)}</span></h3><div class="muted" style="font-size:11px">Submitted by ${esc(item.user?.name || 'Resident')}</div></div><span class="${statusClass(item.status)}">${esc(item.status)}</span></div><div class="request-meta"><span>${esc(item.category)}</span><span>${esc(item.weightKg)} kg</span><span>Wallet: ${esc(compactAddress(item.user?.walletAddress))}</span><span>Collection verified: ${formatDate(item.collectedAt)}</span></div>${item.status === 'COLLECTED' ? `<button type="button" class="button button-small" data-action="receive" data-request-id="${esc(item._id)}" style="margin-top:14px">Confirm receipt</button>` : `<form class="inline-form" data-complete-form="${esc(item._id)}"><div class="field"><label>Recycler reference</label><input name="recyclerReference" required minlength="3" maxlength="120" placeholder="Facility record reference"></div><div class="field"><label>Certificate number</label><input name="certificateNumber" required minlength="2" maxlength="120" placeholder="Recycling certificate"></div><button class="button button-small" type="submit">Verify recycling</button></form>`}</article>`).join('')}</div>` : `<div class="panel">${emptyState('No requests in this view', historyOnly ? 'Verified recycling will appear here.' : 'Collected e-waste assigned or available to your facility will appear here.')}</div>`}`;
}

async function adminOverview() {
  const data = await api('/api/admin/dashboard');
  const statuses = states.map(status => [status, data.requestsByStatus?.[status] || 0]);
  return `${heading('Administrator overview', 'Monitor collection operations, recycling, rewards, and ledger activity.', '<button class="button button-outline button-small" type="button" data-action="refresh">Refresh</button>')}
    <div class="stats-grid">${stat('Registered residents', data.users || 0, 'Active user accounts', '♙')}${stat('Waste collected', `${Number(data.collectedKg || 0).toFixed(1)} kg`, 'Collected or further along', '↗')}${stat('Waste recycled', `${Number(data.recycledKg || 0).toFixed(1)} kg`, 'Recycler verified', '↻')}${stat('Points distributed', data.rewardsDistributed || 0, `${data.blockchainTransactions || 0} blockchain transactions`, '✳')}</div>
    <section class="section"><div class="section-head"><h2>Requests by status</h2><button class="text-link" type="button" data-view="admin-requests">Manage requests</button></div>${statuses.length ? `<div class="stats-grid" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr))">${statuses.map(([status, count]) => stat(status, count, 'Collection requests', '•')).join('')}</div>` : `<div class="panel">${emptyState('No requests yet', 'Collection requests will be summarized here.')}</div>`}</section>`;
}

function adminStatusControl(item) {
  const transitions = item.status === 'ASSIGNED'
    ? [['COLLECTED', 'Mark collected (verify pickup code)']]
    : item.status === 'COLLECTED' && item.assignedRecycler
      ? [['RECEIVED', 'Mark received by assigned recycler']]
      : item.status === 'RECEIVED' && item.assignedRecycler
        ? [['RECYCLED', 'Verify recycling on blockchain']]
        : [];
  if (!transitions.length) return '';
  const requestId = esc(item._id);
  return `<div class="field status-change"><label for="admin-status-${requestId}">Change status</label><select id="admin-status-${requestId}" data-admin-status-for="${requestId}"><option value="">Choose next status</option>${transitions.map(([status, label]) => `<option value="${status}">${label}</option>`).join('')}</select></div>`;
}

function adminRequestCard(item, agents, recyclers) {
  const requestId = esc(item._id);
  const canAssignAgent = ['REQUESTED', 'ASSIGNED'].includes(item.status);
  const canAssignRecycler = ['REQUESTED', 'ASSIGNED', 'COLLECTED', 'RECEIVED'].includes(item.status);
  const agentControl = canAssignAgent && agents.length
    ? `<div class="inline-form"><div class="field"><label>Assign collection agent</label><select data-agent-for="${requestId}">${agents.map(agent => `<option value="${esc(agent._id)}" ${item.assignedAgent?._id === agent._id ? 'selected' : ''}>${esc(agent.name)} · ${esc(agent.email)}</option>`).join('')}</select></div><button type="button" class="button button-small" data-action="assign-agent" data-request-id="${requestId}">Save assignment</button></div>`
    : canAssignAgent ? '<p class="muted">Create an active collection agent account before assigning this request.</p>' : '';
  const recyclerControl = canAssignRecycler && recyclers.length
    ? `<div class="inline-form"><div class="field"><label>Assign authorized recycler</label><select data-recycler-for="${requestId}">${recyclers.map(recycler => `<option value="${esc(recycler._id)}" ${item.assignedRecycler?._id === recycler._id ? 'selected' : ''}>${esc(recycler.name)} · ${esc(recycler.email)}</option>`).join('')}</select></div><button type="button" class="button button-small" data-action="assign-recycler" data-request-id="${requestId}">Save recycler</button></div>`
    : canAssignRecycler ? '<p class="muted">Create an active authorized recycler account before assigning this request.</p>' : '';
  const collectionForm = item.status === 'ASSIGNED'
    ? `<form class="inline-form hidden" data-admin-collection-form="${requestId}"><div class="field"><label for="admin-otp-${requestId}">Pickup code from the resident</label><input id="admin-otp-${requestId}" name="otp" inputmode="numeric" pattern="[0-9]{6}" minlength="6" maxlength="6" required placeholder="6-digit code"></div><button class="button button-small" type="submit">Verify and mark collected</button><button class="button button-outline button-small" type="button" data-action="cancel-admin-status">Cancel</button></form>`
    : '';
  const recyclingForm = item.status === 'RECEIVED' && item.assignedRecycler
    ? `<form class="inline-form hidden" data-admin-complete-form="${requestId}"><div class="field"><label>Recycler reference</label><input name="recyclerReference" required minlength="3" maxlength="120" placeholder="Facility record reference"></div><div class="field"><label>Certificate number</label><input name="certificateNumber" required minlength="2" maxlength="120" placeholder="Recycling certificate"></div><button class="button button-small" type="submit">Verify recycling &amp; credit rewards</button><button class="button button-outline button-small" type="button" data-action="cancel-admin-status">Cancel</button></form><p class="muted">This records recycling on the blockchain and credits the resident’s rewards. Resident wallet: ${item.user?.walletAddress ? 'connected' : 'not connected'}.</p>`
    : '';

  return `<article class="request-card" data-search="${esc(`${item.requestId} ${item.deviceName}`.toLowerCase())}" data-status="${esc(item.status)}">
    <div class="request-top"><div><h3>${esc(item.deviceName)} <span class="muted">· ${esc(item.requestId)}</span></h3><div class="muted" style="font-size:11px">${esc(item.user?.name || '')} · ${esc(item.category)}</div></div><span class="${statusClass(item.status)}">${esc(item.status)}</span></div>
    <div class="request-meta"><span>${esc(item.weightKg)} kg</span><span>Preferred: ${formatDate(item.preferredDate)}</span><span>Agent: ${esc(item.assignedAgent?.name || 'Unassigned')}</span><span>Recycler: ${esc(item.assignedRecycler?.name || 'Unassigned')}</span></div>
    ${adminStatusControl(item)}${agentControl}${recyclerControl}${collectionForm}${recyclingForm}
  </article>`;
}

async function adminRequests() {
  const [data, staff] = await Promise.all([api('/api/waste/all?limit=100'), api('/api/admin/users?role=agent')]);
  const { requests = [] } = data;
  const agents = staff.users || [];
  const recyclersData = await api('/api/admin/users?role=recycler');
  const recyclers = recyclersData.users || [];
  return `${heading('Manage requests', 'Assign staff and advance each request through verified collection and recycling.')}
    <div class="filter-row"><input id="request-search" type="search" placeholder="Search by request or device"><select id="status-filter"><option value="">All statuses</option>${states.map(status => `<option>${status}</option>`).join('')}</select></div>
    ${requests.length ? `<div class="request-list" id="admin-request-list">${requests.map(item => adminRequestCard(item, agents, recyclers)).join('')}</div>` : `<div class="panel">${emptyState('No collection requests', 'New resident requests will appear here.')}</div>`}`;
}

async function peopleView() {
  const { users = [] } = await api('/api/admin/users?role=staff');
  managedStaff = users;
  return `${heading('People & staff', 'Create and manage collection agent and recycler accounts.')}
    <div class="panel panel-pad"><div class="section-head"><h2>Create a staff account</h2></div><form id="staff-form"><div class="form-grid"><div class="field"><label>Name</label><input name="name" required minlength="2" maxlength="100"></div><div class="field"><label>Email</label><input name="email" type="email" required maxlength="254"></div><div class="field"><label for="staff-password">Temporary password</label><div class="password-control"><input id="staff-password" name="password" type="password" required minlength="1" maxlength="72" placeholder="Enter a password"><button class="password-toggle" type="button" data-action="toggle-password" data-target="staff-password" aria-label="Show password" aria-pressed="false">${passwordIcon(false)}</button></div></div><div class="field"><label>Role</label><select name="role"><option value="agent">Collection agent</option><option value="recycler">Authorized recycler</option></select></div><div class="field recycler-only hidden"><label>Organization</label><input name="organization" maxlength="150" disabled></div><div class="field recycler-only hidden"><label>Authorization number</label><input name="authorizationNumber" maxlength="120" disabled></div></div><button class="button" type="submit">Create staff account</button></form></div>
    <section class="section"><div class="section-head"><h2>Staff accounts</h2><p class="muted">Deactivated accounts cannot sign in or receive new assignments; history is retained.</p></div>${users.length ? `<div class="panel table-wrap"><table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Created</th><th>Actions</th></tr></thead><tbody>${users.map(item => `<tr><td><strong>${esc(item.name)}</strong></td><td>${esc(item.email)}</td><td><span class="status">${esc(item.role)}</span></td><td><span class="status ${item.active ? 'status-active' : 'status-inactive'}">${item.active ? 'Active' : 'Inactive'}</span></td><td>${formatDate(item.createdAt)}</td><td><div class="staff-actions"><button class="button button-outline button-small" type="button" data-action="edit-staff" data-user-id="${esc(item._id)}">Edit</button>${item.active ? `<button class="button button-danger button-small" type="button" data-action="deactivate-staff" data-user-id="${esc(item._id)}">Deactivate</button>` : `<button class="button button-small" type="button" data-action="activate-staff" data-user-id="${esc(item._id)}">Reactivate</button>`}</div></td></tr>`).join('')}</tbody></table></div>` : `<div class="panel">${emptyState('No staff accounts yet', 'Create an agent or recycler account above.')}</div>`}</section>
    <dialog class="staff-dialog" id="staff-dialog"><form id="staff-edit-form" data-staff-edit-form=""><h2>Edit staff account</h2><div class="form-grid"><div class="field"><label for="edit-staff-name">Name</label><input id="edit-staff-name" name="name" required minlength="2" maxlength="100"></div><div class="field"><label for="edit-staff-email">Email</label><input id="edit-staff-email" name="email" type="email" required maxlength="254"></div><div class="field"><label for="edit-staff-password">New password (optional)</label><div class="password-control"><input id="edit-staff-password" name="password" type="password" autocomplete="new-password" maxlength="72" placeholder="Leave blank to keep current password"><button class="password-toggle" type="button" data-action="toggle-password" data-target="edit-staff-password" aria-label="Show password" aria-pressed="false">${passwordIcon(false)}</button></div></div><div class="field"><label for="edit-staff-role">Role</label><input id="edit-staff-role" name="role" readonly></div><div class="field edit-recycler-only hidden"><label for="edit-staff-organization">Organization</label><input id="edit-staff-organization" name="organization" maxlength="150"></div><div class="field edit-recycler-only hidden"><label for="edit-staff-authorization">Authorization number</label><input id="edit-staff-authorization" name="authorizationNumber" maxlength="120"></div></div><div class="staff-dialog-actions"><button class="button button-outline" type="button" data-action="close-staff-dialog">Cancel</button><button class="button" type="submit">Save changes</button></div></form></dialog>`;
}

function profileView() {
  return `${heading('My profile', 'Manage the account details attached to your EcoCycle activity.')}
    <div class="panel panel-pad"><form id="profile-form"><div class="form-grid"><div class="field"><label for="profile-name">Full name</label><input id="profile-name" name="name" value="${esc(currentUser.name)}" required minlength="2" maxlength="100"></div><div class="field"><label for="profile-email">Email address</label><input id="profile-email" value="${esc(currentUser.email)}" disabled></div><div class="field"><label for="profile-phone">Phone number</label><input id="profile-phone" name="phone" value="${esc(currentUser.phone || '')}" maxlength="30" autocomplete="tel"></div></div><button class="button" type="submit">Save profile</button></form></div>
    <section class="section"><div class="section-head"><h2>Wallet</h2></div><div class="panel panel-pad"><p class="muted" style="font-size:12px">${esc(currentUser.walletAddress || 'No wallet connected. Connect MetaMask to receive recycling rewards.')}</p><button class="button button-outline button-small" type="button" data-action="wallet">${currentUser.walletAddress ? 'Refresh wallet connection' : 'Connect MetaMask'}</button></div></section>`;
}

function logout(showMessage = true) {
  sessionStorage.removeItem('ecocycleToken');
  token = null;
  currentUser = null;
  pickupNotice = null;
  if (showMessage) showToast('You have signed out.');
  renderAuth();
}

function passwordIcon(isVisible) {
  const icon = isVisible
    ? '<path d="m3 3 18 18"></path><path d="M10.6 10.6a2 2 0 0 0 2.8 2.8"></path><path d="M9.9 5.2A10.8 10.8 0 0 1 12 5c6.4 0 10 7 10 7a15.7 15.7 0 0 1-3.1 3.8"></path><path d="M6.6 6.6C3.6 8.5 2 12 2 12s3.6 7 10 7a10.7 10.7 0 0 0 4-.8"></path>'
    : '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z"></path><circle cx="12" cy="12" r="3"></circle>';
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${icon}</svg>`;
}

function getWalletProvider() {
  const injected = window.ethereum;
  if (!injected) return null;
  const providers = Array.isArray(injected.providers) ? injected.providers : [injected];
  return providers.find(provider => provider.isMetaMask) || injected;
}

async function ensureLocalWalletNetwork(provider) {
  const localChainId = '0x7a69';
  const chainId = await provider.request({ method: 'eth_chainId' });
  if (Number.parseInt(chainId, 16) === 31337) return;
  try {
    await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: localChainId }] });
  } catch (error) {
    if (error.code !== 4902) throw error;
    await provider.request({
      method: 'wallet_addEthereumChain',
      params: [{
        chainId: localChainId,
        chainName: 'Hardhat Local',
        nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
        rpcUrls: ['http://127.0.0.1:8545']
      }]
    });
  }
  const switchedChainId = await provider.request({ method: 'eth_chainId' });
  if (Number.parseInt(switchedChainId, 16) !== 31337) {
    throw new Error('Switch MetaMask to the Hardhat Local network (chain ID 31337) and try again.');
  }
}

function watchWalletAccounts(provider) {
  if (walletListenerProvider === provider || typeof provider.on !== 'function') return;
  walletListenerProvider = provider;
  provider.on('accountsChanged', async accounts => {
    if (!token || currentUser?.role !== 'user') return;
    try {
      const walletAddress = accounts[0] || null;
      const result = await api('/api/auth/wallet', { method: 'PATCH', body: JSON.stringify({ walletAddress }) });
      currentUser = result.user;
      showToast(walletAddress ? 'Wallet account updated.' : 'Wallet disconnected from your EcoCycle account.');
      if (currentView === 'overview' || currentView === 'profile') await openView(currentView);
    } catch (error) { showToast(error.message, true); }
  });
}

async function connectWallet(button) {
  const provider = getWalletProvider();
  if (!provider) return showToast('MetaMask was not detected. Open EcoCycle in a browser with the MetaMask extension.', true);
  if (button) button.disabled = true;
  try {
    const [address] = await provider.request({ method: 'eth_requestAccounts' });
    if (!address) throw new Error('MetaMask did not return an account. Unlock MetaMask and try again.');
    await ensureLocalWalletNetwork(provider);
    const result = await api('/api/auth/wallet', { method: 'PATCH', body: JSON.stringify({ walletAddress: address }) });
    currentUser = result.user;
    watchWalletAccounts(provider);
    showToast('Wallet connected to your EcoCycle account.');
    await openView(currentView);
  } catch (error) { showToast(error.message || 'MetaMask wallet connection failed.', true); }
  finally { if (button?.isConnected) button.disabled = false; }
}

root.addEventListener('click', async event => {
  const viewButton = event.target.closest('[data-view]');
  if (viewButton && currentUser) { await openView(viewButton.dataset.view); return; }
  const button = event.target.closest('[data-action]');
  if (!button) return;
  try {
    if (button.dataset.action === 'auth-mode') { authMode = button.dataset.mode; renderAuth(); }
    if (button.dataset.action === 'toggle-password') {
      const input = document.getElementById(button.dataset.target);
      if (!input) return;
      const isVisible = input.type === 'password';
      input.type = isVisible ? 'text' : 'password';
      button.setAttribute('aria-label', isVisible ? 'Hide password' : 'Show password');
      button.setAttribute('aria-pressed', String(isVisible));
      button.innerHTML = passwordIcon(isVisible);
      input.focus();
    }
    if (button.dataset.action === 'edit-staff') {
      const staff = managedStaff.find(item => item._id === button.dataset.userId);
      if (!staff) throw new Error('Staff account details are no longer available. Refresh the list and try again.');
      const form = document.querySelector('#staff-edit-form');
      form.reset();
      form.dataset.staffEditForm = staff._id;
      form.elements.name.value = staff.name;
      form.elements.email.value = staff.email;
      form.elements.role.value = staff.role;
      form.elements.password.type = 'password';
      const passwordToggle = form.querySelector('[data-target="edit-staff-password"]');
      passwordToggle.setAttribute('aria-label', 'Show password');
      passwordToggle.setAttribute('aria-pressed', 'false');
      passwordToggle.innerHTML = passwordIcon(false);
      form.querySelectorAll('.edit-recycler-only').forEach(field => {
        const input = field.querySelector('input');
        const isRecycler = staff.role === 'recycler';
        field.classList.toggle('hidden', !isRecycler);
        input.disabled = !isRecycler;
        input.required = isRecycler;
        if (input.name === 'organization') input.value = staff.organization || '';
        if (input.name === 'authorizationNumber') input.value = staff.authorizationNumber || '';
      });
      document.querySelector('#staff-dialog').showModal();
    }
    if (button.dataset.action === 'close-staff-dialog') document.querySelector('#staff-dialog').close();
    if (button.dataset.action === 'cancel-admin-status') {
      const card = button.closest('.request-card');
      const form = button.closest('form');
      form.reset();
      form.classList.add('hidden');
      const statusSelect = card.querySelector('[data-admin-status-for]');
      if (statusSelect) statusSelect.value = '';
    }
    if (button.dataset.action === 'deactivate-staff') {
      const staff = managedStaff.find(item => item._id === button.dataset.userId);
      if (!staff) throw new Error('Staff account details are no longer available. Refresh the list and try again.');
      if (!window.confirm(`Deactivate ${staff.name}? They will no longer be able to sign in or receive new assignments. Existing history will be preserved.`)) return;
      await api(`/api/admin/staff/${encodeURIComponent(staff._id)}`, { method: 'DELETE' });
      showToast('Staff account deactivated. Existing history was preserved.');
      await openView('people');
    }
    if (button.dataset.action === 'activate-staff') {
      const staff = managedStaff.find(item => item._id === button.dataset.userId);
      if (!staff) throw new Error('Staff account details are no longer available. Refresh the list and try again.');
      await api(`/api/admin/staff/${encodeURIComponent(staff._id)}/activate`, { method: 'PATCH' });
      showToast('Staff account reactivated.');
      await openView('people');
    }
    if (button.dataset.action === 'logout') logout();
    if (button.dataset.action === 'menu') document.querySelector('#sidebar').classList.toggle('open');
    if (button.dataset.action === 'wallet') await connectWallet(button);
    if (button.dataset.action === 'refresh') await openView(currentView);
    if (button.dataset.action === 'receive') {
      await api('/api/recycler/receive', { method: 'POST', body: JSON.stringify({ requestId: button.dataset.requestId }) });
      showToast('Receipt confirmed. Complete recycling verification when processing is finished.');
      await openView(currentView);
    }
    if (button.dataset.action === 'assign-agent') {
      const requestId = button.dataset.requestId;
      const agentId = document.querySelector(`[data-agent-for="${CSS.escape(requestId)}"]`).value;
      await api('/api/collection/assign', { method: 'POST', body: JSON.stringify({ requestId, agentId }) });
      showToast('Collection agent assigned.');
      await openView(currentView);
    }
    if (button.dataset.action === 'assign-recycler') {
      const requestId = button.dataset.requestId;
      const assignedRecycler = document.querySelector(`[data-recycler-for="${CSS.escape(requestId)}"]`).value;
      await api(`/api/waste/${encodeURIComponent(requestId)}`, { method: 'PATCH', body: JSON.stringify({ assignedRecycler }) });
      showToast('Authorized recycler assigned.');
      await openView(currentView);
    }
    if (button.dataset.action === 'admin-receive') {
      await api('/api/recycler/receive', { method: 'POST', body: JSON.stringify({ requestId: button.dataset.requestId }) });
      showToast('Recycler receipt confirmed.');
      await openView(currentView);
    }
    if (button.dataset.action === 'redeem') {
      const pointsText = window.prompt('How many points would you like to redeem?');
      if (pointsText === null) return;
      const points = Number(pointsText);
      if (!Number.isSafeInteger(points) || points < 1) return showToast('Enter a positive whole number of points.', true);
      await api('/api/rewards/redeem', { method: 'POST', body: JSON.stringify({ points, idempotencyKey: crypto.randomUUID() }) });
      showToast('Points redeemed.');
      await openView(currentView);
    }
  } catch (error) { showToast(error.message, true); }
});

root.addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.target;
  const submitButton = form.querySelector('[type="submit"]');
  if (submitButton) submitButton.disabled = true;
  try {
    if (form.id === 'auth-form') {
      const payload = Object.fromEntries(new FormData(form));
      const endpoint = authMode === 'login' ? '/api/auth/login' : '/api/auth/register';
      const result = await api(endpoint, { method: 'POST', body: JSON.stringify(payload) });
      token = result.token;
      currentUser = result.user;
      sessionStorage.setItem('ecocycleToken', token);
      currentView = 'overview';
      await openView('overview');
      showToast(authMode === 'login' ? `Welcome back, ${currentUser.name.split(' ')[0]}.` : 'Your account is ready.');
    } else if (form.id === 'waste-form') {
      const result = await api('/api/waste', { method: 'POST', body: new FormData(form) });
      pickupNotice = { requestId: result.request.requestId, otp: result.pickupOtp };
      showToast('Your collection request has been submitted.');
      await openView('register');
    } else if (form.matches('[data-verify-form]')) {
      const payload = Object.fromEntries(new FormData(form));
      await api(`/api/collection/${encodeURIComponent(form.dataset.verifyForm)}/verify`, { method: 'PATCH', body: JSON.stringify(payload) });
      showToast('Collection verified.');
      await openView(currentView);
    } else if (form.matches('[data-admin-collection-form]')) {
      const payload = Object.fromEntries(new FormData(form));
      await api(`/api/collection/${encodeURIComponent(form.dataset.adminCollectionForm)}/verify`, { method: 'PATCH', body: JSON.stringify(payload) });
      showToast('Pickup code verified; request marked collected.');
      await openView(currentView);
    } else if (form.matches('[data-complete-form]')) {
      const payload = { ...Object.fromEntries(new FormData(form)), requestId: form.dataset.completeForm };
      const result = await api('/api/recycler/complete', { method: 'POST', body: JSON.stringify(payload) });
      showToast(`Recycling confirmed on-chain. ${result.reward?.points ?? 0} points credited.`);
      await openView(currentView);
    } else if (form.matches('[data-admin-complete-form]')) {
      const payload = { ...Object.fromEntries(new FormData(form)), requestId: form.dataset.adminCompleteForm };
      const result = await api('/api/recycler/complete', { method: 'POST', body: JSON.stringify(payload) });
      showToast(`Recycling confirmed on-chain. ${result.reward?.points ?? 0} points credited.`);
      await openView(currentView);
    } else if (form.id === 'staff-form') {
      const payload = Object.fromEntries(new FormData(form));
      if (payload.role !== 'recycler') {
        delete payload.organization;
        delete payload.authorizationNumber;
      }
      await api('/api/admin/staff', { method: 'POST', body: JSON.stringify(payload) });
      showToast('Staff account created.');
      await openView('people');
    } else if (form.matches('[data-staff-edit-form]')) {
      const payload = Object.fromEntries(new FormData(form));
      delete payload.role;
      if (!payload.password) delete payload.password;
      await api(`/api/admin/staff/${encodeURIComponent(form.dataset.staffEditForm)}`, { method: 'PATCH', body: JSON.stringify(payload) });
      document.querySelector('#staff-dialog').close();
      showToast('Staff account updated.');
      await openView('people');
    } else if (form.id === 'profile-form') {
      const result = await api('/api/auth/profile', { method: 'PATCH', body: JSON.stringify(Object.fromEntries(new FormData(form))) });
      currentUser = result.user;
      showToast('Profile updated.');
      await openView('profile');
    } else if (form.id === 'redeem-form') {
      const points = Number(new FormData(form).get('points'));
      await api('/api/rewards/redeem', { method: 'POST', body: JSON.stringify({ points, idempotencyKey: crypto.randomUUID() }) });
      showToast('Points redeemed.');
      await openView('rewards');
    }
  } catch (error) { showToast(error.message, true); }
  finally { if (submitButton?.isConnected) submitButton.disabled = false; }
});

root.addEventListener('input', event => {
  if (event.target.id === 'request-search' || event.target.id === 'status-filter') applyAdminFilters();
});

function applyAdminFilters() {
  const query = document.querySelector('#request-search')?.value.trim().toLowerCase() || '';
  const status = document.querySelector('#status-filter')?.value || '';
  document.querySelectorAll('#admin-request-list .request-card').forEach(card => {
    card.classList.toggle('hidden', !(card.dataset.search.includes(query) && (!status || card.dataset.status === status)));
  });
}

root.addEventListener('change', async event => {
  if (event.target.matches('[data-admin-status-for]')) {
    const status = event.target.value;
    const card = event.target.closest('.request-card');
    event.target.value = '';
    if (status === 'COLLECTED' || status === 'RECYCLED') {
      const form = card.querySelector(status === 'COLLECTED' ? '[data-admin-collection-form]' : '[data-admin-complete-form]');
      if (form) {
        form.classList.remove('hidden');
        form.querySelector('input').focus();
      }
      return;
    }
    if (status === 'RECEIVED') {
      if (!window.confirm('Confirm that the assigned recycler has received this collected request?')) return;
      try {
        await api('/api/recycler/receive', { method: 'POST', body: JSON.stringify({ requestId: event.target.dataset.adminStatusFor }) });
        showToast('Request marked received by the assigned recycler.');
        await openView(currentView);
      } catch (error) { showToast(error.message, true); }
    }
  }
  if (event.target.name === 'role' && event.target.closest('#staff-form')) {
    document.querySelectorAll('.recycler-only').forEach(field => {
      field.classList.toggle('hidden', event.target.value !== 'recycler');
      field.querySelector('input').required = event.target.value === 'recycler';
      field.querySelector('input').disabled = event.target.value !== 'recycler';
    });
  }
});

async function start() {
  if (!token) return renderAuth();
  try {
    const result = await api('/api/auth/me');
    currentUser = result.user;
    await openView('overview');
  } catch { logout(false); }
}

start();