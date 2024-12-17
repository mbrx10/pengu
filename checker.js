const { Connection, Keypair, PublicKey } = require('@solana/web3.js');
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
    // Check if privateKey is hex format
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

async function checkWallet(privateKey) {
    let wallet = 'Unknown';
    try {
        // Get wallet data
        const walletData = getWalletData(privateKey);
        wallet = walletData.wallet;
        const privateKeyBytes = walletData.privateKeyBytes;
        
        // Get auth message
        const messageData = await getAuthMessage();
        
        // Sign the message
        const signature = signMessage(messageData.message, privateKeyBytes);

        // Get auth token
        const tokenData = await getAuthToken(signature, messageData.signingDate, wallet);
        if (!tokenData.isValid) {
            throw new Error('Invalid token');
        }
        
        // Check eligibility
        const result = await checkPenguEligibility(wallet);
        
        return {
            wallet,
            status: 'success',
            eligible: result.total > 0,
            tokens: result.total,
            categories: result.categories.length > 0 ? result.categories : []
        };
    } catch (error) {
        return {
            wallet,
            status: 'error',
            error: error.message
        };
    }
}

async function main() {
    try {
        console.log(banner);
        
        // Read private keys from file
        const privateKeysPath = path.join(__dirname, 'privatekey.txt');
        const privateKeys = fs.readFileSync(privateKeysPath, 'utf8')
            .split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0);

        console.log(`Found ${privateKeys.length} wallet(s) to check`);
        console.log('Checking wallets in parallel...\n');

        // Process wallets in smaller batches to avoid rate limiting
        const batchSize = 5;
        const results = [];
        let successful = 0;
        let failed = 0;
        let eligible = 0;

        for (let i = 0; i < privateKeys.length; i += batchSize) {
            const batch = privateKeys.slice(i, i + batchSize);
            const batchResults = await Promise.all(
                batch.map(async (privateKey, index) => {
                    try {
                        const result = await checkWallet(privateKey);
                        const walletNum = i + index + 1;
                        
                        if (result.status === 'success') {
                            successful++;
                            if (result.eligible) {
                                eligible++;
                                console.log(`✅ Wallet ${walletNum}/${privateKeys.length}: ${result.wallet}`);
                                console.log(`   Tokens: ${result.tokens}`);
                                console.log(`   Categories: ${result.categories}`);
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
                    } catch (error) {
                        failed++;
                        console.error(`Error processing wallet: ${error.message}`);
                        return {
                            status: 'error',
                            error: error.message
                        };
                    }
                })
            );
            results.push(...batchResults);
            
            // Add delay between batches
            if (i + batchSize < privateKeys.length) {
                await delay(1000);
            }
        }

        console.log('\nSummary:');
        console.log(`Total Wallets: ${privateKeys.length}`);
        console.log(`Successful: ${successful}`);
        console.log(`Failed: ${failed}`);
        console.log(`Eligible: ${eligible}\n`);

        // Save results to file
        const timestamp = new Date().toISOString().replace(/:/g, '-');
        const resultsDir = path.join(__dirname, 'results');
        if (!fs.existsSync(resultsDir)) {
            fs.mkdirSync(resultsDir);
        }
        const resultsFile = path.join(resultsDir, `pengu-check-${timestamp}.json`);
        fs.writeFileSync(resultsFile, JSON.stringify(results, null, 2));
        console.log(`Results saved to: ${resultsFile}`);

    } catch (error) {
        console.error('Error:', error.message);
    }
}

// Run if called directly
if (require.main === module) {
    main();
}
