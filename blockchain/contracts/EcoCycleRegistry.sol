// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

contract EcoCycleRegistry {
    struct RecyclingRecord {
        bool exists;
        address userWallet;
        uint256 weightGrams;
        uint256 rewardPoints;
        string recyclerReference;
        uint256 timestamp;
        bytes32 transactionId;
    }

    address public owner;
    mapping(address => bool) public verifiers;
    mapping(bytes32 => RecyclingRecord) private recyclingRecords;
    mapping(address => uint256) public totalRewardPoints;

    event VerifierUpdated(address indexed verifier, bool authorized);
    event RecyclingRecorded(
        bytes32 indexed requestId,
        bytes32 indexed transactionId,
        address indexed userWallet,
        uint256 weightGrams,
        uint256 rewardPoints,
        string recyclerReference,
        uint256 timestamp
    );

    error Unauthorized();
    error InvalidInput();
    error DuplicateRequest();

    constructor() {
        owner = msg.sender;
        verifiers[msg.sender] = true;
        emit VerifierUpdated(msg.sender, true);
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    modifier onlyVerifier() {
        if (!verifiers[msg.sender]) revert Unauthorized();
        _;
    }

    function setVerifier(address verifier, bool authorized) external onlyOwner {
        if (verifier == address(0)) revert InvalidInput();
        verifiers[verifier] = authorized;
        emit VerifierUpdated(verifier, authorized);
    }

    function recordRecycling(
        bytes32 requestId,
        address userWallet,
        uint256 weightGrams,
        string calldata recyclerReference
    ) external onlyVerifier returns (bytes32 transactionId) {
        if (requestId == bytes32(0) || userWallet == address(0) || weightGrams == 0 || bytes(recyclerReference).length == 0) {
            revert InvalidInput();
        }
        if (recyclingRecords[requestId].exists) revert DuplicateRequest();

        uint256 rewardPoints = (weightGrams * 10) / 1000;
        transactionId = keccak256(abi.encode(requestId, userWallet, weightGrams, block.timestamp, msg.sender));
        recyclingRecords[requestId] = RecyclingRecord({
            exists: true,
            userWallet: userWallet,
            weightGrams: weightGrams,
            rewardPoints: rewardPoints,
            recyclerReference: recyclerReference,
            timestamp: block.timestamp,
            transactionId: transactionId
        });
        totalRewardPoints[userWallet] += rewardPoints;
        emit RecyclingRecorded(requestId, transactionId, userWallet, weightGrams, rewardPoints, recyclerReference, block.timestamp);
    }

    function getRecyclingRecord(bytes32 requestId) external view returns (RecyclingRecord memory) {
        return recyclingRecords[requestId];
    }
}