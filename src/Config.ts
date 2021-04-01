require('dotenv').config();

export interface AppConfig {
    bchdUrl: string;
    fundingWif: string;
}

if (! process.env.FUNDING_WIF) {
    console.error('FUNDING_WIF not set in .env');
    process.exit(1);
}

const Config: AppConfig = {
    bchdUrl: process.env.BCHD_URL ?? 'bchd.fountainhead.cash:443',
    fundingWif: process.env.FUNDING_WIF,
};

export { Config };
