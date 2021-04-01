import { Config } from './Config';
import { GrpcClient } from 'grpc-bchrpc-node';
import * as bitcore from 'bitcore-lib-cash';
import * as bchaddr from 'bchaddrjs-slp';
import * as slpMdm from 'slp-mdm';

const client = new GrpcClient({ url: Config.bchdUrl });

interface Utxo {
    txid: string;
    vout: number;
    value: number;
    pubkey_script: string;
    block_height: number;
    coinbase: boolean;
    slp: any;
}


export function utxoToBitcoreUnspentOutput(utxo: Utxo): bitcore.Transaction.UnspentOutput {
    return new bitcore.Transaction.UnspentOutput({
        txId: utxo.txid,
        outputIndex: utxo.vout,
        script: new bitcore.Script(utxo.pubkey_script),
        satoshis: utxo.value,
    });
}

const gslpAddressCacheMap = new Map();
export async function getAddressUtxos(address: bitcore.Address, includeMempool: boolean = true): Promise<Utxo[]> {
    const gutxos = await client.getAddressUtxos({
        address: address.toString(),
        includeMempool,
    });

    const utxos: any[] = [];
    for (const output of gutxos.getOutputsList()) {
        const outpoint = output.getOutpoint();

        let slp: any = null;
        if (output.hasSlpToken()) {
            const gslp = output.getSlpToken()
            slp = {};
            slp.tokenId = Buffer.from(gslp.getTokenId()).toString('hex');
            slp.amount = gslp.getAmount();
            slp.isMintBaton = gslp.getIsMintBaton();

            const gslpAddressStr = gslp.getAddress();
            if (! gslpAddressCacheMap.has(gslpAddressStr)) {
                gslpAddressCacheMap.set(gslpAddressStr, bitcore.Address.fromString(bchaddr.toCashAddress(gslpAddressStr)));
            }
            slp.address = gslpAddressCacheMap.get(gslpAddressStr);
            slp.decimals = gslp.getDecimals();
            slp.slpAction = gslp.getSlpAction();
            slp.tokenType = gslp.getTokenType();
        }

        utxos.push({
            txid:          Buffer.from(outpoint.getHash_asU8().reverse()).toString('hex'),
            vout:          outpoint.getIndex(),
            value:         output.getValue(),
            pubkey_script: Buffer.from(output.getPubkeyScript_asU8()).toString('hex'),
            block_height:  output.getBlockHeight(),
            coinbase:      output.getIsCoinbase(),
            slp,
        });
    }

    return utxos;
}

export async function getAddressNftChildUtxos(address: bitcore.Address, includeMempool: boolean = true): Promise<Utxo[]> {
    const addressStr = address.toString();

    const utxos = (await getAddressUtxos(address, includeMempool))
        .filter((v) =>
                               v.slp
         &&          v.slp.tokenType === 65
         && v.slp.address.toString() === addressStr
        );

    return utxos;
}

export async function getAddressNftGroupUtxos(address: bitcore.Address, includeMempool: boolean = true): Promise<Utxo[]> {
    const addressStr = address.toString();

    const utxos = (await getAddressUtxos(address, includeMempool))
        .filter((v) =>
                               v.slp
         &&          v.slp.tokenType === 129
         &&        v.slp.isMintBaton === false
         && v.slp.address.toString() === addressStr
        );

    return utxos;
}

export async function getAddressNftMintBatonUtxos(address: bitcore.Address, includeMempool: boolean = true): Promise<Utxo[]|null> {
    const addressStr = address.toString();

    const utxos = (await getAddressUtxos(address, includeMempool))
        .filter((v) =>
                               v.slp
         &&          v.slp.tokenType === 129
         &&        v.slp.isMintBaton === true
         && v.slp.address.toString() === addressStr
        );

    return utxos;
}

export async function getAddressBchUtxos(address: bitcore.Address, includeMempool: boolean = true): Promise<Utxo[]> {
    const utxos = (await getAddressUtxos(address, includeMempool))
        .filter((v) => ! v.slp);

    return utxos;
}

export async function getAddressBchBalance(address: bitcore.Address, includeMempool: boolean = true): Promise<number> {
    const utxos = await getAddressBchUtxos(address, includeMempool);
    return utxos.reduce((a: number, v: Utxo) => a+v.value, 0);
}

export async function createGroupGenesisTx(
    address: bitcore.Address,
    privateKey: bitcore.PrivateKey,
    includeMempool: boolean,
    toAddress: bitcore.Address,
    name: string,
    symbol: string,
    documentUri: string,
    documentHash: string,
): Promise<bitcore.Transaction> {
    const bchUtxos = await getAddressBchUtxos(address, includeMempool);
    const balance = bchUtxos.reduce((a: number, v: Utxo) => a+v.value, 0);

    if (balance < 5000) {
        throw new Error('balance too low');
    }

    const inputUtxos = [];
    // lets only use some utxos so we dont hit size limit
    for (const utxo of bchUtxos) {
        inputUtxos.push(utxoToBitcoreUnspentOutput(utxo));

        if (inputUtxos.reduce((a, v) => a+v.satoshis, 0) > 5000) {
            break;
        }
    }

    const tx = new bitcore.Transaction()
        .from(inputUtxos)
        .addOutput(new bitcore.Transaction.Output({
            script: bitcore.Script.fromBuffer(slpMdm.NFT1.Group.genesis(symbol, name, documentUri, documentHash, 0, 2, new slpMdm.BN(1))),
            satoshis: 0
        }))
        .to(toAddress, 546) // 0 group output
        .to(toAddress, 546) // mint baton
        .change(address) // we send remaining bch back to users address
        .feePerByte(1.2)
        .sign(privateKey);

    return tx;
}

export async function createGroupMintTx(
    address: bitcore.Address,
    privateKey: bitcore.PrivateKey,
    includeMempool: boolean,
    toAddress: bitcore.Address,
    mintBatonReceiverAddress: bitcore.Address,
    tokenId: string,
    amount: number
): Promise<bitcore.Transaction> {
    const bchUtxos = await getAddressBchUtxos(address, includeMempool);
    const balance = bchUtxos.reduce((a: number, v: Utxo) => a+v.value, 0);

    if (balance < 5000) {
        throw new Error('balance too low');
    }

    const batonUtxos = (await getAddressNftMintBatonUtxos(address, includeMempool))
        .filter((v) => v.slp.tokenId === tokenId);
    if (batonUtxos.length === 0) {
        throw new Error(`${tokenId} mint baton not found`);
    }
    const batonUtxo = batonUtxos[0];

    const inputUtxos = [utxoToBitcoreUnspentOutput(batonUtxo)];
    // lets only use some utxos so we dont hit size limit
    for (const utxo of bchUtxos) {
        inputUtxos.push(utxoToBitcoreUnspentOutput(utxo));

        if (inputUtxos.reduce((a, v) => a+v.satoshis, 0) > 5000) {
            break;
        }
    }

    const tx = new bitcore.Transaction()
        .from(inputUtxos)
        .addOutput(new bitcore.Transaction.Output({
            script: bitcore.Script.fromBuffer(slpMdm.NFT1.Group.mint(tokenId, 2, new slpMdm.BN(amount))),
            satoshis: 0
        }))
        .to(toAddress, 546) // "amount" group output
        .to(mintBatonReceiverAddress, 546) // mint baton
        .change(address) // we send remaining bch back to users address
        .feePerByte(1.2)
        .sign(privateKey);

    return tx;
}

export async function createGroupSplitTx(
    address: bitcore.Address,
    privateKey: bitcore.PrivateKey,
    includeMempool: boolean,
    toAddress: bitcore.Address,
    tokenId: string,
): Promise<bitcore.Transaction> {
    const bchUtxos = await getAddressBchUtxos(address, includeMempool);
    const balance = bchUtxos.reduce((a: number, v: Utxo) => a+v.value, 0);

    if (balance < 20000) {
        throw new Error('balance too low');
    }

    const groupUtxos = (await getAddressNftGroupUtxos(address, includeMempool))
        .filter((v) => v.slp.tokenId === tokenId)
        .filter((v) => new slpMdm.BN(v.slp.amount).gt(1));
    if (groupUtxos.length === 0) {
        throw new Error(`no splittable ${tokenId} utxos found`);
    }

    const groupUtxo = groupUtxos[0];
    const groupUtxoAmount = groupUtxo.slp.amount;

    const inputUtxos = [utxoToBitcoreUnspentOutput(groupUtxo)];
    // lets only use some utxos so we dont hit size limit
    for (const utxo of bchUtxos) {
        inputUtxos.push(utxoToBitcoreUnspentOutput(utxo));

        if (inputUtxos.reduce((a, v) => a+v.satoshis, 0) > 20000) {
            break;
        }
    }

    const slpOutputAmounts = [];
    for (let i=0; i<groupUtxoAmount && i<18; ++i) {
        slpOutputAmounts.push(new slpMdm.BN(1));
    }
    if (groupUtxoAmount > 18) {
        slpOutputAmounts.push(new slpMdm.BN(groupUtxoAmount - 18));
    }

    let tx = new bitcore.Transaction()
        .from(inputUtxos)
        .addOutput(new bitcore.Transaction.Output({
            script: bitcore.Script.fromBuffer(slpMdm.NFT1.Group.send(tokenId, slpOutputAmounts)),
            satoshis: 0
        }));
    for (let i=0; i<slpOutputAmounts.length; ++i) {
        tx = tx.to(toAddress, 546);
    }
    tx = tx
        .change(address) // we send remaining bch back to users address
        .feePerByte(1.2)
        .sign(privateKey);

    return tx;
}

export async function createGroupBurnTx(
    address: bitcore.Address,
    privateKey: bitcore.PrivateKey,
    includeMempool: boolean,
    tokenId: string,
): Promise<bitcore.Transaction> {
    const groupUtxos = (await getAddressNftGroupUtxos(address, includeMempool))
        .filter((v) => v.slp.tokenId === tokenId);
    const batonUtxos = (await getAddressNftMintBatonUtxos(address, includeMempool))
        .filter((v) => v.slp.tokenId === tokenId);

    const inputUtxos = groupUtxos.map((v) => utxoToBitcoreUnspentOutput(v))
        .concat(batonUtxos.map((v) => utxoToBitcoreUnspentOutput(v)));

    if (inputUtxos.length === 0) {
        throw new Error(`no burnable ${tokenId} utxos found`);
    }

    if (inputUtxos.length < 2) {
        const bchUtxos = await getAddressBchUtxos(address, includeMempool);

        if (bchUtxos.length === 0) {
            throw new Error(`need at least 2 utxos for input (one may be bch)`);
        }

        inputUtxos.push(utxoToBitcoreUnspentOutput(bchUtxos[0]));
    }

    const tx = new bitcore.Transaction()
        .from(inputUtxos)
        .change(address) // we send remaining bch back to users address
        .feePerByte(1.2)
        .sign(privateKey);

    return tx;
}

export async function createChildBurnTx(
    address: bitcore.Address,
    privateKey: bitcore.PrivateKey,
    includeMempool: boolean,
    tokenIds: string[],
): Promise<bitcore.Transaction> {
    const tokenIdsSet = new Set(tokenIds);

    const childUtxos = (await getAddressNftChildUtxos(address, includeMempool))
        .filter((v) => tokenIdsSet.has(v.slp.tokenId));
    if (childUtxos.length === 0) {
        throw new Error(`no burnable utxos found for ${tokenIdsSet}`);
    }

    const inputUtxos = childUtxos.map((v) => utxoToBitcoreUnspentOutput(v));

    if (inputUtxos.length < 2) {
        const bchUtxos = await getAddressBchUtxos(address, includeMempool);

        if (bchUtxos.length === 0) {
            throw new Error(`need at least 2 utxos for input (one may be bch)`);
        }

        inputUtxos.push(utxoToBitcoreUnspentOutput(bchUtxos[0]));
    }

    const tx = new bitcore.Transaction()
        .from(inputUtxos)
        .change(address) // we send remaining bch back to users address
        .feePerByte(1.2)
        .sign(privateKey);

    return tx;
}

export async function createChildGenesisTx(
    address: bitcore.Address,
    privateKey: bitcore.PrivateKey,
    includeMempool: boolean,
    toAddress: bitcore.Address,
    groupTokenId: string,
    name: string,
    symbol: string,
    documentUri: string,
    documentHash: string,
): Promise<bitcore.Transaction> {
    const bchUtxos = await getAddressBchUtxos(address, includeMempool);
    const balance = bchUtxos.reduce((a: number, v: Utxo) => a+v.value, 0);

    if (balance < 5000) {
        throw new Error('balance too low');
    }

    const groupUtxos = (await getAddressNftGroupUtxos(address, includeMempool))
        .filter((v) => v.slp.tokenId === groupTokenId)
        .filter((v) => new slpMdm.BN(v.slp.amount).eq(1));
    if (groupUtxos.length === 0) {
        throw new Error(`no usable amount 1 ${groupTokenId} utxos found`);
    }

    const groupUtxo = groupUtxos[0];

    const inputUtxos = [utxoToBitcoreUnspentOutput(groupUtxo)];
    // lets only use some utxos so we dont hit size limit
    for (const utxo of bchUtxos) {
        inputUtxos.push(utxoToBitcoreUnspentOutput(utxo));

        if (inputUtxos.reduce((a, v) => a+v.satoshis, 0) > 5000) {
            break;
        }
    }

    const tx = new bitcore.Transaction()
        .from(inputUtxos)
        .addOutput(new bitcore.Transaction.Output({
            script: bitcore.Script.fromBuffer(slpMdm.NFT1.Child.genesis(symbol, name, documentUri, documentHash)),
            satoshis: 0
        }))
        .to(toAddress, 546)
        .change(address) // we send remaining bch back to users address
        .feePerByte(1.2)
        .sign(privateKey);

    return tx;
}


export async function broadcastTx(tx: bitcore.Transaction, allowBurn: boolean = false): Promise<string|null> {
    try {
        const res = await client.submitTransaction({
            txnHex:                tx.serialize(),
            skipSlpValidityChecks: allowBurn,
        });

        return Buffer.from(res.getHash_asU8()).reverse().toString('hex');
    } catch (e) {
        console.error(e);
        return null;
    }
}
