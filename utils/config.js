const BASE_URL = 'https://api.clusters.xyz/v0.1/airdrops/pengu';

const ENDPOINTS = {
    AUTH_MESSAGE: `${BASE_URL}/auth/message`,
    AUTH_TOKEN: `${BASE_URL}/auth/token`,
    ELIGIBILITY: `${BASE_URL}/eligibility`
};

const commonHeaders = {
    'accept': '*/*',
    'accept-language': 'en-US,en;q=0.9,id;q=0.8',
    'priority': 'u=1, i',
    'sec-ch-ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'cross-site',
    'sec-gpc': '1',
    'Referer': 'https://claim.pudgypenguins.com/',
    'Referrer-Policy': 'strict-origin-when-cross-origin'
};

module.exports = {
    BASE_URL,
    ENDPOINTS,
    commonHeaders
};