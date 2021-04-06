import { Config } from './Config';
import * as bitcore from 'bitcore-lib-cash';
import * as Bitcoin from './Bitcoin';

const fundingPrivateKey = bitcore.PrivateKey.fromString(Config.fundingWif);
const fundingAddress = fundingPrivateKey.toAddress();


async function main(): Promise<void> {
    const args = process.argv.slice(2);

    if (args.length < 1) {
        console.log('usage: yarn start [makegroup,mintgroup,burngroup,splitgroup,makenft,burnnft]');
        process.exit(0);
    }

    if (args[0] === 'makegroup') {
        if (args.length < 2) {
            console.log('usage: yarn start makegroup NAME [SYMBOL DOCUMENTURI DOCUMENTHASH]');
            process.exit(0);
        }

        const name         = args[1];
        const symbol       = args[2] ?? '';
        const documentUri  = args[3] ?? '';
        const documentHash = args[4] ?? '';

        const toAddress = fundingAddress;
        // To send to Juungle, change this to bitcore.Address instance of your deposit address
        // const toAddress = new bitcore.Address('bitcoincash:juungle_bch_address');

        const tx = await Bitcoin.createGroupGenesisTx(
            fundingAddress,
            fundingPrivateKey,
            true,
            toAddress,
            name,
            symbol,
            documentUri,
            documentHash
        );

        const txid = await Bitcoin.broadcastTx(tx);
        console.log(txid);
    }

    if (args[0] === 'mintgroup') {
        if (args.length !== 3) {
            console.log('usage: yarn start mintgroup GROUP_TOKENID AMOUNT');
            process.exit(0);
        }

        const groupTokenId = args[1];
        const amount       = parseInt(args[2], 10);

        const toAddress = fundingAddress;
        // To send to Juungle, change this to bitcore.Address instance of your deposit address
        // const toAddress = new bitcore.Address('bitcoincash:juungle_bch_address');
        const mintBatonReceiverAddress = fundingAddress;

        const tx = await Bitcoin.createGroupMintTx(
            fundingAddress,
            fundingPrivateKey,
            true,
            toAddress,
            mintBatonReceiverAddress,
            groupTokenId,
            amount,
        );

        const txid = await Bitcoin.broadcastTx(tx);
        console.log(txid);
    }

    if (args[0] === 'burngroup') {
        if (args.length !== 2) {
            console.log('usage: yarn start burngroup GROUP_TOKENID');
            process.exit(0);
        }

        const groupTokenId = args[1];

        const tx = await Bitcoin.createGroupBurnTx(
            fundingAddress,
            fundingPrivateKey,
            true,
            groupTokenId,
        );

        const txid = await Bitcoin.broadcastTx(tx, true);
        console.log(txid);
    }

    if (args[0] === 'splitgroup') {
        if (args.length !== 2) {
            console.log('usage: yarn start split GROUP_TOKENID');
            process.exit(0);
        }

        const groupTokenId = args[1];

        const tx = await Bitcoin.createGroupSplitTx(
            fundingAddress,
            fundingPrivateKey,
            true,
            fundingAddress,
            groupTokenId
        );

        const txid = await Bitcoin.broadcastTx(tx);
        console.log(txid);
    }

    if (args[0] === 'makenft') {
        if (args.length < 3) {
            console.log('usage: yarn start makenft GROUP_TOKENID NAME [SYMBOL DOCUMENTURI DOCUMENTHASH]');
            process.exit(0);
        }

        const groupTokenId = args[1];
        const name         = args[2];
        const symbol       = args[3] ?? '';
        const documentUri  = args[4] ?? '';
        const documentHash = args[5] ?? '';

        const toAddress = fundingAddress;
        // To send to Juungle, change this to bitcore.Address instance of your deposit address
        // const toAddress = new bitcore.Address('bitcoincash:juungle_bch_address');

        const tx = await Bitcoin.createChildGenesisTx(
            fundingAddress,
            fundingPrivateKey,
            true,
            toAddress,
            groupTokenId,
            name,
            symbol,
            documentUri,
            documentHash
        );

        const txid = await Bitcoin.broadcastTx(tx);
        console.log(txid);
    }

    if (args[0] === 'burnnft') {
        if (args.length < 2) {
            console.log('usage: yarn start burnnft TOKENID [TOKENID...]');
            process.exit(0);
        }

        const tokenIds = [ args[1] ];
        for (let i=2; i<args.length; ++i) {
            tokenIds.push(args[i]);
        }

        const tx = await Bitcoin.createChildBurnTx(
            fundingAddress,
            fundingPrivateKey,
            true,
            tokenIds,
        );

        const txid = await Bitcoin.broadcastTx(tx, true);
        console.log(txid);
    }
}

main();
