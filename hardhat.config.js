require('dotenv').config();
require('@nomicfoundation/hardhat-ethers');
require('@nomicfoundation/hardhat-chai-matchers');

module.exports = {
  solidity: {
    version: '0.8.28',
    settings: { optimizer: { enabled: true, runs: 200 } }
  },
  paths: {
    sources: './blockchain/contracts',
    tests: './tests',
    cache: './blockchain/cache',
    artifacts: './blockchain/artifacts'
  },
  networks: {
    localhost: { url: process.env.BLOCKCHAIN_RPC_URL || 'http://127.0.0.1:8545', chainId: 31337 }
  }
};