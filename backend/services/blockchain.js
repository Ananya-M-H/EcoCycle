const fs = require('fs');
const path = require('path');
const { Contract, JsonRpcProvider, Wallet, keccak256, toUtf8Bytes } = require('ethers');

const artifactPath = path.resolve(__dirname, '../../blockchain/artifacts/blockchain/contracts/EcoCycleRegistry.sol/EcoCycleRegistry.json');
const deploymentPath = path.resolve(__dirname, '../../blockchain/deployments/31337.json');

function contractAddress() {
  if (process.env.CONTRACT_ADDRESS) return process.env.CONTRACT_ADDRESS;
  if (fs.existsSync(deploymentPath)) return JSON.parse(fs.readFileSync(deploymentPath, 'utf8')).address;
  throw new Error('EcoCycleRegistry is not deployed. Start the local chain and run npm run deploy:local.');
}

function getProvider() {
  return new JsonRpcProvider(process.env.BLOCKCHAIN_RPC_URL || 'http://127.0.0.1:8545');
}

function getReadContract() {
  if (!fs.existsSync(artifactPath)) throw new Error('Contract artifact is missing. Run npm run compile.');
  const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
  return new Contract(contractAddress(), artifact.abi, getProvider());
}

function getWriteContract() {
  if (!process.env.BLOCKCHAIN_PRIVATE_KEY) throw new Error('BLOCKCHAIN_PRIVATE_KEY is required for local contract writes.');
  const provider = getProvider();
  const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
  return new Contract(contractAddress(), artifact.abi, new Wallet(process.env.BLOCKCHAIN_PRIVATE_KEY, provider));
}

async function recordOrFind({ requestId, walletAddress, weightKg, recyclerReference }) {
  const contract = getWriteContract();
  const requestHash = keccak256(toUtf8Bytes(requestId));
  const record = await contract.getRecyclingRecord(requestHash);
  let event;

  if (record.exists) {
    const events = await contract.queryFilter(contract.filters.RecyclingRecorded(requestHash));
    event = events[events.length - 1];
    if (!event) throw new Error('The recycling record exists on-chain but its confirmation event could not be located.');
  } else {
    const weightGrams = BigInt(Math.round(weightKg * 1000));
    const transaction = await contract.recordRecycling(requestHash, walletAddress, weightGrams, recyclerReference);
    const receipt = await transaction.wait(1);
    if (!receipt || receipt.status !== 1) throw new Error('Blockchain transaction was not confirmed.');
    event = (await contract.queryFilter(contract.filters.RecyclingRecorded(requestHash), receipt.blockNumber, receipt.blockNumber))[0];
    if (!event) throw new Error('The confirmed recycling event could not be read from the blockchain.');
  }

  const latest = await contract.getRecyclingRecord(requestHash);
  return {
    transactionHash: event.transactionHash,
    blockNumber: event.blockNumber,
    transactionId: latest.transactionId,
    weightGrams: Number(latest.weightGrams),
    rewardPoints: Number(latest.rewardPoints),
    recyclerReference: latest.recyclerReference,
    timestamp: new Date(Number(latest.timestamp) * 1000),
    walletAddress: latest.userWallet
  };
}

async function verify(requestId) {
  const contract = getReadContract();
  const requestHash = keccak256(toUtf8Bytes(requestId));
  const record = await contract.getRecyclingRecord(requestHash);
  if (!record.exists) return { verified: false, requestId };
  const events = await contract.queryFilter(contract.filters.RecyclingRecorded(requestHash));
  return {
    verified: true,
    requestId,
    transactionId: record.transactionId,
    transactionHash: events.at(-1)?.transactionHash || null,
    walletAddress: record.userWallet,
    weightGrams: Number(record.weightGrams),
    rewardPoints: Number(record.rewardPoints),
    recyclerReference: record.recyclerReference,
    timestamp: new Date(Number(record.timestamp) * 1000)
  };
}

function info() {
  return { address: contractAddress(), chainId: 31337, network: 'Hardhat local', explorer: null };
}

module.exports = { recordOrFind, verify, info, getReadContract };