const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { Wallet } = require('ethers');
require('dotenv').config();

const baseUrl = process.env.TEST_API_URL || 'http://127.0.0.1:3000';
const adminEmail = process.env.TEST_ADMIN_EMAIL || process.env.ADMIN_EMAIL;
const adminPassword = process.env.TEST_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD;
const walletAddress = process.env.TEST_WALLET_ADDRESS || Wallet.createRandom().address;

async function request(path, { token, method = 'GET', body } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body && !(body instanceof FormData)) headers['Content-Type'] = 'application/json';
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined
  });
  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await response.json() : await response.arrayBuffer();
  return { status: response.status, data };
}

function staffPayload(email, role) {
  return {
    name: `${role} Test Account`,
    email,
    password: 'LocalTestPass2026!',
    role,
    ...(role === 'recycler'
      ? { organization: 'EcoCycle Test Facility', authorizationNumber: `AUTH-${randomUUID()}` }
      : { organization: '', authorizationNumber: '' })
  };
}

async function main() {
  assert.ok(adminEmail && adminPassword && walletAddress, 'Set TEST_ADMIN_EMAIL, TEST_ADMIN_PASSWORD, and TEST_WALLET_ADDRESS before running API integration tests.');
  assert.equal((await request('/api/health')).status, 200, 'API health endpoint should be available');

  const suffix = randomUUID();
  const userEmail = `resident-${suffix}@example.test`;
  const registered = await request('/api/auth/register', { method: 'POST', body: { name: 'Test Resident', email: userEmail, password: 'ResidentPass2026!' } });
  assert.equal(registered.status, 201, 'user registration should succeed');
  const userToken = registered.data.token;
  assert.equal((await request('/api/admin/dashboard', { token: userToken })).status, 403, 'users must not access the administrator dashboard');
  assert.deepEqual((await request('/api/blockchain/transactions', { token: userToken })).data.transactions, [], 'users without wallets must not receive other users\' transactions');

  const adminLogin = await request('/api/auth/login', { method: 'POST', body: { email: adminEmail, password: adminPassword } });
  assert.equal(adminLogin.status, 200, 'seeded administrator should be able to sign in');
  const adminToken = adminLogin.data.token;
  const dashboard = await request('/api/admin/dashboard', { token: adminToken });
  assert.equal(dashboard.status, 200, 'administrator overview should load');
  assert.equal(typeof dashboard.data.requestsByStatus, 'object');
  assert.equal(typeof dashboard.data.users, 'number');

  const staffResults = await Promise.all([
    request('/api/admin/staff', { token: adminToken, method: 'POST', body: staffPayload(`agent-${suffix}@example.test`, 'agent') }),
    request('/api/admin/staff', { token: adminToken, method: 'POST', body: staffPayload(`other-agent-${suffix}@example.test`, 'agent') }),
    request('/api/admin/staff', { token: adminToken, method: 'POST', body: staffPayload(`recycler-${suffix}@example.test`, 'recycler') })
  ]);
  for (const result of staffResults) assert.equal(result.status, 201, `staff setup should succeed: ${result.data.error || ''}`);
  const [agent, otherAgent, recycler] = staffResults.map(result => result.data.user);
  const updatedOtherAgent = await request(`/api/admin/staff/${otherAgent.id}`, {
    token: adminToken,
    method: 'PATCH',
    body: { name: 'Updated Test Agent', email: `updated-agent-${suffix}@example.test` }
  });
  assert.equal(updatedOtherAgent.status, 200, 'administrator should be able to edit staff details');
  assert.equal(updatedOtherAgent.data.user.name, 'Updated Test Agent');
  const updatedRecycler = await request(`/api/admin/staff/${recycler.id}`, {
    token: adminToken,
    method: 'PATCH',
    body: {
      name: recycler.name,
      email: recycler.email,
      organization: 'Updated EcoCycle Test Facility',
      authorizationNumber: `UPDATED-${suffix}`
    }
  });
  assert.equal(updatedRecycler.status, 200, 'administrator should be able to update recycler details');
  const staffList = await request('/api/admin/users?role=staff', { token: adminToken });
  const listedRecycler = staffList.data.users.find(user => user._id === recycler.id);
  assert.equal(listedRecycler.organization, 'Updated EcoCycle Test Facility', 'staff list should include recycler details for editing');
  const agentLogin = await request('/api/auth/login', { method: 'POST', body: { email: `agent-${suffix}@example.test`, password: 'LocalTestPass2026!' } });
  const otherAgentLogin = await request('/api/auth/login', { method: 'POST', body: { email: `updated-agent-${suffix}@example.test`, password: 'LocalTestPass2026!' } });
  const recyclerLogin = await request('/api/auth/login', { method: 'POST', body: { email: `recycler-${suffix}@example.test`, password: 'LocalTestPass2026!' } });
  assert.equal(agentLogin.status, 200);
  assert.equal(otherAgentLogin.status, 200);
  assert.equal(recyclerLogin.status, 200);
  const agentToken = agentLogin.data.token;
  const otherAgentToken = otherAgentLogin.data.token;
  const recyclerToken = recyclerLogin.data.token;
  assert.equal((await request('/api/collection/assign', { token: userToken, method: 'POST', body: {} })).status, 403, 'residents cannot assign agents');

  const wallet = await request('/api/auth/wallet', { token: userToken, method: 'PATCH', body: { walletAddress } });
  assert.equal(wallet.status, 200, 'resident wallet should be saved');
  const form = new FormData();
  form.append('deviceName', 'Test laptop');
  form.append('category', 'Laptops');
  form.append('quantity', '1');
  form.append('weightKg', '2.5');
  form.append('condition', 'Damaged');
  form.append('description', 'Automated end-to-end verification');
  form.append('pickupAddress', '12 Test Street, Test City');
  form.append('preferredDate', new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10));
  form.append('photo', new Blob([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/Jk0AAAAASUVORK5CYII=', 'base64')], { type: 'image/png' }), 'device.png');
  const created = await request('/api/waste', { token: userToken, method: 'POST', body: form });
  assert.equal(created.status, 201, `waste request should be registered: ${created.data.error || ''}`);
  const waste = created.data.request;
  assert.match(created.data.pickupOtp, /^\d{6}$/);
  assert.equal((await request(`/api/waste/${waste._id}/photo`, { token: userToken })).status, 200, 'owner can retrieve their private photo');
  assert.equal((await request(`/api/waste/${waste._id}/photo`)).status, 401, 'unauthenticated visitors cannot retrieve photos');

  const assignment = await request('/api/collection/assign', { token: adminToken, method: 'POST', body: { requestId: waste._id, agentId: agent.id } });
  assert.equal(assignment.status, 200, `administrator should assign a collection agent: ${assignment.data.error || ''}`);
  assert.equal(assignment.data.request.status, 'ASSIGNED', 'agent assignment should move the request to assigned');
  assert.equal(String(assignment.data.request.assignedAgent), agent.id);
  assert.equal((await request(`/api/waste/${waste._id}`, { token: recyclerToken })).status, 403, 'recyclers cannot read requests assigned to other facilities');
  const recyclerAssignment = await request(`/api/waste/${waste._id}`, {
    token: adminToken,
    method: 'PATCH',
    body: { assignedRecycler: recycler.id }
  });
  assert.equal(recyclerAssignment.status, 200, `administrator should preassign a recycler: ${recyclerAssignment.data.error || ''}`);
  assert.equal(recyclerAssignment.data.request.status, 'ASSIGNED', 'preassigning a recycler should preserve the collection status');
  assert.equal(String(recyclerAssignment.data.request.assignedRecycler), recycler.id);
  assert.equal((await request(`/api/waste/${waste._id}/photo`, { token: otherAgentToken })).status, 404, 'unassigned agents cannot retrieve private photos');
  assert.equal((await request(`/api/waste/${waste._id}/photo`, { token: agentToken })).status, 200, 'assigned agent can retrieve the collection photo');
  assert.equal((await request(`/api/collection/${waste._id}/verify`, { token: otherAgentToken, method: 'PATCH', body: { otp: created.data.pickupOtp } })).status, 403, 'an agent cannot verify another agent\'s assignment');
  assert.equal((await request(`/api/collection/${waste._id}/verify`, { token: agentToken, method: 'PATCH', body: { otp: '000000' } })).status, 400, 'invalid pickup code should be rejected');
  const collected = await request(`/api/collection/${waste._id}/verify`, { token: adminToken, method: 'PATCH', body: { otp: created.data.pickupOtp } });
  assert.equal(collected.status, 200, `administrator can verify the assigned agent's pickup code: ${collected.data.error || ''}`);
  assert.equal(collected.data.request.status, 'COLLECTED');
  const deactivated = await request(`/api/admin/staff/${otherAgent.id}`, { token: adminToken, method: 'DELETE' });
  assert.equal(deactivated.status, 200, 'administrator should be able to deactivate a staff account');
  assert.equal(deactivated.data.user.active, false);
  assert.equal((await request('/api/collection/history', { token: otherAgentToken })).status, 401, 'deactivated staff cannot continue using existing sessions');
  assert.equal((await request('/api/auth/login', { method: 'POST', body: { email: `updated-agent-${suffix}@example.test`, password: 'LocalTestPass2026!' } })).status, 401, 'deactivated staff cannot sign in');
  const reactivated = await request(`/api/admin/staff/${otherAgent.id}/activate`, { token: adminToken, method: 'PATCH' });
  assert.equal(reactivated.status, 200, 'administrator should be able to reactivate a staff account');
  assert.equal(reactivated.data.user.active, true);

  assert.equal((await request('/api/recycler/receive', { token: userToken, method: 'POST', body: { requestId: waste._id } })).status, 403, 'residents cannot confirm recycler receipt');
  const received = await request('/api/recycler/receive', { token: adminToken, method: 'POST', body: { requestId: waste._id } });
  assert.equal(received.status, 200, `administrator can confirm receipt for its assigned recycler: ${received.data.error || ''}`);
  assert.equal(received.data.request.status, 'RECEIVED');
  const completed = await request('/api/recycler/complete', { token: adminToken, method: 'POST', body: { requestId: waste._id, recyclerReference: `REC-${suffix}`, certificateNumber: `CERT-${suffix}` } });
  assert.equal(completed.status, 200, `recycling should be confirmed: ${completed.data.error || ''}`);
  assert.equal(completed.data.request.status, 'RECYCLED', 'administrator recycling verification should move the request to recycled');
  assert.equal(completed.data.transaction.rewardPoints, 25, '2.5 kg should credit 25 points');
  assert.equal(completed.data.reward.points, 25);

  const verified = await request(`/api/blockchain/verify/${encodeURIComponent(waste.requestId)}`, { token: userToken });
  assert.equal(verified.status, 200);
  assert.equal(verified.data.verified, true, 'record should be independently verifiable on-chain');
  const requesterRequests = await request('/api/waste/mine', { token: userToken });
  assert.equal(requesterRequests.data.requests.find(item => item._id === waste._id).status, 'RECYCLED', 'requester should see the completed status');
  const adminLedger = await request('/api/blockchain/transactions', { token: adminToken });
  assert.equal(adminLedger.status, 200, 'administrator blockchain ledger should load');
  assert.ok(adminLedger.data.transactions.some(item => item.requestId === waste.requestId), 'verified recycling should appear in the administrator blockchain ledger');
  const balance = await request('/api/rewards/balance', { token: userToken });
  assert.equal(balance.data.points, 25);
  const retry = await request('/api/recycler/complete', { token: recyclerToken, method: 'POST', body: { requestId: waste._id, recyclerReference: `REC-${suffix}`, certificateNumber: `CERT-${suffix}` } });
  assert.equal(retry.status, 200);
  assert.equal(retry.data.alreadyCompleted, true, 'retrying completion must be idempotent');
  assert.equal((await request('/api/rewards/balance', { token: userToken })).data.points, 25, 'retry must not create another reward');

  const redemptionKey = randomUUID();
  assert.equal((await request('/api/rewards/redeem', { token: userToken, method: 'POST', body: { points: 5, idempotencyKey: redemptionKey } })).status, 201);
  assert.equal((await request('/api/rewards/balance', { token: userToken })).data.points, 20, 'redemption should atomically reduce the balance');
  assert.equal((await request('/api/rewards/redeem', { token: userToken, method: 'POST', body: { points: 5, idempotencyKey: redemptionKey } })).status, 201, 'redemption retries should return the existing ledger event');
  assert.equal((await request('/api/rewards/balance', { token: userToken })).data.points, 20, 'redemption retry must not deduct points twice');

  console.log('API integration workflow passed: registration -> assignment -> OTP pickup -> recycler receipt -> on-chain recycling -> reward credit -> idempotent redemption.');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});