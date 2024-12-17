// Disable deprecation warnings
process.noDeprecation = true;

const { Connection, Keypair, PublicKey } = require('@solana/web3.js');
const { Wallet } = require('ethers');
const fs = require('fs');
const path = require('path');
const Base58 = require('base-58');
const nacl = require('tweetnacl');
const { TextEncoder } = require('util');
const { ENDPOINTS, commonHeaders } = require('./utils/config');
const banner = require('./utils/banner');

// Add delay utility function
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function getWalletData(privateKey) {
    // First try as Ethereum private key
    try {
        // Remove 0x if present
        const cleanKey = privateKey.trim().replace('0x', '');
        // Check if it's a valid hex string of correct length (32 bytes = 64 chars)
        if (/^[0-9a-fA-F]{64}$/.test(cleanKey)) {
            const wallet = new Wallet(cleanKey);
            return {
                type: 'ethereum',
                wallet: wallet.address,
                ethWallet: wallet
            };
        }
    } catch (error) {
        // Not a valid Ethereum key, continue to try Solana formats
    }

    let privateKeyBytes;
    
    // Remove any whitespace
    privateKey = privateKey.trim();
    
    // Check if privateKey is array format
    if (privateKey.startsWith('[') && privateKey.endsWith(']')) {
        try {
            privateKeyBytes = new Uint8Array(JSON.parse(privateKey));
        } catch (error) {
            throw new Error('Invalid array format private key');
        }
    } 
    // Check if privateKey is hex format for Solana (64 bytes = 128 chars)
    else if (/^[0-9a-fA-F]{128}$/.test(privateKey)) {
        try {
            privateKeyBytes = new Uint8Array(
                privateKey.match(/.{1,2}/g).map(byte => parseInt(byte, 16))
            );
        } catch (error) {
            throw new Error('Invalid hex format private key');
        }
    }
    // Assume base58 format
    else {
        try {
            privateKeyBytes = Base58.decode(privateKey);
        } catch (error) {
            throw new Error('Invalid base58 format private key');
        }
    }

    try {
        const keypair = Keypair.fromSecretKey(privateKeyBytes);
        return {
            type: 'solana',
            wallet: keypair.publicKey.toString(),
            privateKeyBytes
        };
    } catch (error) {
        throw new Error(`Invalid private key: ${error.message}`);
    }
}

function signMessage(message, privateKeyBytes) {
    try {
        const messageBytes = new TextEncoder().encode(message);
        const signature = nacl.sign.detached(messageBytes, privateKeyBytes);
        return '0x' + Buffer.from(signature).toString('hex');
    } catch (error) {
        console.error('Error signing message:', error);
        throw error;
    }
}

async function getAuthMessage() {
    try {
        const response = await fetch(ENDPOINTS.AUTH_MESSAGE, {
            method: 'GET',
            headers: commonHeaders
        });
        if (!response.ok) {
            if (response.status === 429) {
                // If rate limited, wait and try again
                await delay(2000); // Wait 2 seconds
                return getAuthMessage();
            }
            throw new Error(`HTTP error! status: ${response.status}\nResponse: ${await response.text()}`);
        }
        return await response.json();
    } catch (error) {
        throw new Error(`Error getting auth message: ${error.message}`);
    }
}

async function getAuthToken(signature, signingDate, wallet) {
    try {
        const body = {
            signature,
            signingDate,
            type: 'solana',
            wallet
        };

        const response = await fetch(ENDPOINTS.AUTH_TOKEN, {
            method: 'POST',
            headers: {
                ...commonHeaders,
                'content-type': 'application/json'
            },
            body: JSON.stringify(body)
        });
        if (!response.ok) {
            if (response.status === 429) {
                // If rate limited, wait and try again
                await delay(2000); // Wait 2 seconds
                return getAuthToken(signature, signingDate, wallet);
            }
            throw new Error(`HTTP error! status: ${response.status}\nResponse: ${await response.text()}`);
        }
        return await response.json();
    } catch (error) {
        throw new Error(`Error getting auth token: ${error.message}`);
    }
}

async function checkPenguEligibility(address) {
    try {
        const response = await fetch(ENDPOINTS.ELIGIBILITY, {
            method: 'POST',
            headers: {
                ...commonHeaders,
                'content-type': 'application/json'
            },
            body: JSON.stringify([address])
        });
        if (!response.ok) {
            if (response.status === 429) {
                // If rate limited, wait and try again
                await delay(2000); // Wait 2 seconds
                return checkPenguEligibility(address);
            }
            throw new Error(`HTTP error! status: ${response.status}\nResponse: ${await response.text()}`);
        }
        return await response.json();
    } catch (error) {
        throw new Error(`Error checking eligibility: ${error.message}`);
    }
}

// Add isValidEthereumAddress function
function isValidEthereumAddress(address) {
    return /^0x[a-fA-F0-9]{40}$/.test(address);
}

async function checkWallet(input) {
    let wallet = 'Unknown';
    try {
        // Check if input is an Ethereum address
        if (isValidEthereumAddress(input)) {
            wallet = input;
            console.log('\nChecking Ethereum address:', wallet);
            const eligibility = await checkPenguEligibility(wallet);
            return {
                wallet,
                status: 'success',
                eligible: eligibility.total > 0,
                tokens: eligibility.total,
                categories: eligibility.categories || []
            };
        }

        // Try to get wallet data (now supports both ETH and SOL private keys)
        const walletData = getWalletData(input);
        wallet = walletData.wallet;
        
        console.log(`\nChecking ${walletData.type === 'ethereum' ? 'Ethereum' : 'Solana'} wallet:`, wallet);
        
        if (walletData.type === 'solana') {
            // Get auth message
            const authMessage = await getAuthMessage();

            // Sign message
            const signature = signMessage(authMessage.message, walletData.privateKeyBytes);

            // Get auth token
            await getAuthToken(signature, authMessage.signingDate, wallet);
        }

        // Check eligibility
        const eligibility = await checkPenguEligibility(wallet);
        
        return {
            wallet,
            status: 'success',
            eligible: eligibility.total > 0,
            tokens: eligibility.total,
            categories: eligibility.categories || []
        };

    } catch (error) {
        console.error(`Error checking wallet ${wallet}:`, error.message);
        return {
            wallet,
            status: 'error',
            error: error.message
        };
    }
}

async function main() {
    try {
        // Read private keys from file
        const privateKeys = fs.readFileSync('privatekey.txt', 'utf8')
            .split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0);

        console.log(banner);
        console.log(`Found ${privateKeys.length} wallet(s) to check`);
        console.log('Checking wallets in batches...\n');
        
        let successful = 0;
        let failed = 0;
        let eligible = 0;
        const results = [];

        // Process wallets in smaller batches to avoid rate limiting
        const batchSize = 5;
        for (let i = 0; i < privateKeys.length; i += batchSize) {
            const batch = privateKeys.slice(i, i + batchSize);
            const batchResults = await Promise.all(
                batch.map(async (privateKey) => {
                    const result = await checkWallet(privateKey);
                    const walletNum = i + batch.indexOf(privateKey) + 1;
                    
                    if (result.status === 'success') {
                        successful++;
                        if (result.eligible) {
                            eligible++;
                            console.log(`✅ Wallet ${walletNum}/${privateKeys.length}: ${result.wallet}`);
                            console.log(`   Tokens: ${result.tokens}`);
                            if (result.categories && result.categories.length > 0) {
                                console.log(`   Categories: ${result.categories.map(c => c.category).join(', ')}`);
                            }
                        } else {
                            console.log(`❌ Wallet ${walletNum}/${privateKeys.length}: ${result.wallet}`);
                            console.log(`   Tokens: ${result.tokens}`);
                        }
                    } else {
                        failed++;
                        console.log(`❌ Wallet ${walletNum}/${privateKeys.length}: ${result.wallet}`);
                        console.log(`   Error: ${result.error}`);
                    }
                    return result;
                })
            );
            results.push(...batchResults);
            
            // Add delay between batches
            if (i + batchSize < privateKeys.length) {
                await delay(1000);
            }
        }

        // Save results to file
        const timestamp = new Date().toISOString().replace(/:/g, '-');
        const resultsDir = path.join(process.cwd(), 'results');
        if (!fs.existsSync(resultsDir)) {
            fs.mkdirSync(resultsDir);
        }
        const resultsFile = path.join(resultsDir, `pengu-check-${timestamp}.json`);
        fs.writeFileSync(resultsFile, JSON.stringify(results, null, 2));

        console.log('\nSummary:');
        console.log(`Total Wallets: ${privateKeys.length}`);
        console.log(`Successful: ${successful}`);
        console.log(`Failed: ${failed}`);
        console.log(`Eligible: ${eligible}`);
        console.log(`\nResults saved to: ${resultsFile}`);

    } catch (error) {
        console.error('Error in main:', error);
        process.exit(1);
    }
}

// Run if called directly
if (require.main === module) {
    main();
}
