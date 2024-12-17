const { Connection, Keypair, PublicKey } = require('@solana/web3.js');
const fs = require('fs');
const path = require('path');
const Base58 = require('base-58');
const nacl = require('tweetnacl');
const { TextEncoder } = require('util');
const { ENDPOINTS, commonHeaders } = require('./utils/config');
const banner = require('./utils/banner');

function getWalletData(privateKey) {
    let privateKeyBytes;
    
    // Check if privateKey is array format
    if (privateKey.startsWith('[') && privateKey.endsWith(']')) {
        try {
            privateKeyBytes = new Uint8Array(JSON.parse(privateKey));
        } catch (error) {
            throw new Error('Invalid array format private key');
        }
    } else {
        // Assume base58 format
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
            const errorText = await response.text();
            throw new Error(`HTTP error! status: ${response.status}\nResponse: ${errorText}`);
        }

        return await response.json();
    } catch (error) {
        console.error('Error getting auth message:', error);
        throw error;
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
            const errorText = await response.text();
            throw new Error(`HTTP error! status: ${response.status}\nResponse: ${errorText}`);
        }

        return await response.json();
    } catch (error) {
        console.error('Error getting auth token:', error);
        throw error;
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
            const errorText = await response.text();
            throw new Error(`HTTP error! status: ${response.status}\nResponse: ${errorText}`);
        }

        return await response.json();
    } catch (error) {
        console.error('Error checking eligibility:', error);
        throw error;
    }
}

async function checkWallet(privateKey) {
    try {
        // Get wallet data
        const { wallet, privateKeyBytes } = getWalletData(privateKey);
        
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
            wallet: wallet || 'Unknown',
            status: 'error',
            error: error.message
        };
    }
}

// Example usage
async function main() {
    try {
        console.log(banner);
        
        // Create results directory if it doesn't exist
        const resultsDir = path.join(__dirname, 'results');
        if (!fs.existsSync(resultsDir)) {
            fs.mkdirSync(resultsDir);
        }

        // Read private keys
        const privateKeysPath = path.join(__dirname, 'privatekey.txt');
        const privateKeys = fs.readFileSync(privateKeysPath, 'utf8')
            .split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0);

        console.log(`Found ${privateKeys.length} wallet(s) to check`);
        console.log('Checking wallets in parallel...\n');

        // Check all wallets in parallel
        const results = await Promise.all(
            privateKeys.map(async (privateKey, index) => {
                const result = await checkWallet(privateKey);
                
                // Log result
                if (result.status === 'error') {
                    console.log(`❌ Wallet ${index + 1}/${privateKeys.length}: ${result.wallet}`);
                    console.log(`   Error: ${result.error}`);
                } else {
                    const status = result.eligible ? '✅' : '❌';
                    console.log(`${status} Wallet ${index + 1}/${privateKeys.length}: ${result.wallet}`);
                    console.log(`   Tokens: ${result.tokens}`);
                    if (result.categories.length > 0) {
                        console.log(`   Categories: ${result.categories.join(', ')}`);
                    }
                }
                
                return result;
            })
        );

        // Group results by status
        const successResults = results.filter(r => r.status === 'success');
        const errorResults = results.filter(r => r.status === 'error');
        const eligibleResults = successResults.filter(r => r.eligible);

        // Format final results
        const finalResults = {
            timestamp: new Date().toISOString(),
            stats: {
                total: privateKeys.length,
                success: successResults.length,
                failed: errorResults.length,
                eligible: eligibleResults.length
            },
            eligible: eligibleResults.map(r => ({
                wallet: r.wallet,
                tokens: r.tokens,
                categories: r.categories
            })),
            not_eligible: successResults
                .filter(r => !r.eligible)
                .map(r => r.wallet),
            errors: errorResults.map(r => ({
                wallet: r.wallet,
                error: r.error
            }))
        };

        // Save results to file
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const resultsPath = path.join(resultsDir, `pengu-check-${timestamp}.json`);
        fs.writeFileSync(resultsPath, JSON.stringify(finalResults, null, 2));
        
        // Display summary
        console.log('\nSummary:');
        console.log(`Total Wallets: ${finalResults.stats.total}`);
        console.log(`Successful: ${finalResults.stats.success}`);
        console.log(`Failed: ${finalResults.stats.failed}`);
        console.log(`Eligible: ${finalResults.stats.eligible}`);
        console.log(`\nResults saved to: ${resultsPath}`);

    } catch (error) {
        console.error('Error:', error);
    }
}

// Run if called directly
if (require.main === module) {
    main();
}
