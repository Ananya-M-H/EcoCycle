const fs = require('fs');
const path = require('path');
const { ethers, network } = require('hardhat');

async function main() {
  const [deployer] = await ethers.getSigners();
  const registry = await ethers.deployContract('EcoCycleRegistry');
  await registry.waitForDeployment();
  const address = await registry.getAddress();
  const verifier = process.env.BACKEND_VERIFIER_ADDRESS;
  if (verifier && verifier.toLowerCase() !== deployer.address.toLowerCase()) {
    const tx = await registry.setVerifier(verifier, true);
    await tx.wait();
  }

  const chainId = Number((await ethers.provider.getNetwork()).chainId);
  const outputPath = path.resolve(__dirname, `../deployments/${chainId}.json`);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify({ address, chainId, network: network.name, deployer: deployer.address, deployedAt: new Date().toISOString() }, null, 2));
  console.log(`EcoCycleRegistry deployed at ${address} on ${network.name} (chain ${chainId})`);
  console.log(`Deployment details saved to ${path.relative(process.cwd(), outputPath)}`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});