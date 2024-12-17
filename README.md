# Pudgy Penguins Eligibility Checker

A script for checking Pudgy Penguins airdrop eligibility for both Solana and Ethereum wallets.

## Features

- Support for both Solana and Ethereum wallets
- Multiple private key formats supported:
  - Solana: Base58, array, and hex formats
  - Ethereum: Private key in hex format (with or without 0x prefix)
- Batch processing to avoid rate limiting
- Detailed eligibility results with token amounts and categories
- Results saved to JSON files

## Prerequisites

- Node.js installed on your system
- Git (for cloning the repository)

## Installation

1. Clone the repository:
```bash
git clone https://github.com/mbrx10/pengu.git
cd pengu
```

2. Install dependencies:
```bash
npm install
```

3. Set up your wallets:
Create a `privatekey.txt` file in the root directory and add your private keys (one per line).

Example formats supported:
```
// Solana private keys
Base58Format123456789...
[1,2,3,4...] // Array format
123456789ABCDEF... // Hex format

// Ethereum private key
123456789abcdef... // Private key (with or without 0x)
```

## Usage

Run the checker:
```bash
npm start
```

Results will be saved in the `results` directory.

## Dependencies

- @solana/web3.js - For Solana wallet operations
- ethers - For Ethereum wallet operations
- base-58 - For Base58 encoding/decoding
- tweetnacl - For cryptographic operations

## Security Note

- Keep your `privatekey.txt` secure and never share it
- The file is automatically ignored by git
- Results directory is also git-ignored for security
