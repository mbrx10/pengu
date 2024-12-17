# Pudgy Penguins

A Solana-based script for checking and claiming.

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

3. Set up your private key:
Create a `privatekey.txt` file in the root directory and add your private key.

## Usage

### To run the checker:
```bash
npm start
```

## Dependencies

- @solana/wallet-adapter-base
- @solana/web3.js
- base-58
- bip39
- ed25519-hd-key
- tweetnacl

## Note
Make sure to keep your `privatekey.txt` secure and never share it with anyone.
