const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('EcoCycleRegistry', function () {
  async function deploy() {
    const [owner, verifier, user, outsider] = await ethers.getSigners();
    const registry = await ethers.deployContract('EcoCycleRegistry');
    await registry.waitForDeployment();
    return { registry, owner, verifier, user, outsider };
  }

  it('records verified recycling and credits the corresponding points once', async function () {
    const { registry, owner, user } = await deploy();
    const requestId = ethers.keccak256(ethers.toUtf8Bytes('ECO-test-1'));
    await expect(registry.recordRecycling(requestId, user.address, 2500, 'CERT-1'))
      .to.emit(registry, 'RecyclingRecorded');
    const record = await registry.getRecyclingRecord(requestId);
    expect(record.exists).to.equal(true);
    expect(record.rewardPoints).to.equal(25);
    expect(await registry.totalRewardPoints(user.address)).to.equal(25);
    expect(record.transactionId).to.not.equal(ethers.ZeroHash);
    expect(await registry.verifiers(owner.address)).to.equal(true);
  });

  it('rejects unauthorized records and duplicate request identifiers', async function () {
    const { registry, user, outsider } = await deploy();
    const requestId = ethers.keccak256(ethers.toUtf8Bytes('ECO-test-2'));
    await expect(registry.connect(outsider).recordRecycling(requestId, user.address, 1000, 'CERT-2'))
      .to.be.revertedWithCustomError(registry, 'Unauthorized');
    await registry.recordRecycling(requestId, user.address, 1000, 'CERT-2');
    await expect(registry.recordRecycling(requestId, user.address, 1000, 'CERT-2'))
      .to.be.revertedWithCustomError(registry, 'DuplicateRequest');
  });

  it('allows the owner to authorize and revoke verifiers', async function () {
    const { registry, verifier, user } = await deploy();
    const requestId = ethers.keccak256(ethers.toUtf8Bytes('ECO-test-3'));
    await registry.setVerifier(verifier.address, true);
    await expect(registry.connect(verifier).recordRecycling(requestId, user.address, 1000, 'CERT-3'))
      .to.emit(registry, 'RecyclingRecorded');
    await registry.setVerifier(verifier.address, false);
    await expect(registry.connect(verifier).recordRecycling(ethers.id('another'), user.address, 1000, 'CERT-4'))
      .to.be.revertedWithCustomError(registry, 'Unauthorized');
  });

  it('rejects invalid wallet, weight, and recycler reference values', async function () {
    const { registry, user } = await deploy();
    const requestId = ethers.keccak256(ethers.toUtf8Bytes('ECO-test-4'));
    await expect(registry.recordRecycling(requestId, ethers.ZeroAddress, 1000, 'CERT-4'))
      .to.be.revertedWithCustomError(registry, 'InvalidInput');
    await expect(registry.recordRecycling(requestId, user.address, 0, 'CERT-4'))
      .to.be.revertedWithCustomError(registry, 'InvalidInput');
    await expect(registry.recordRecycling(requestId, user.address, 1000, ''))
      .to.be.revertedWithCustomError(registry, 'InvalidInput');
  });
});