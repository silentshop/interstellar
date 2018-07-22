const StellarSdk = require('stellar-sdk');
StellarSdk.Network.usePublicNetwork();
const server = new StellarSdk.Server('https://horizon.stellar.org');

// ----- keys / pairs ----- //
const pubKey = 'GDUZVNG4E7AJTCHBNHOQRXUSED7RSVXBZ2NZRFZTZ5TKRGDG5GLV6MAF';
const privKey = 'SCMUH4YUWKAN3GV33T5BD32A2FULPGHC4BJ7KI625BLCJGCVKZV3BHRW';

const pubKey2 = 'GBPL65LCOZ35N26TJEL6SIELSWX4KXJGCRDYWB6CEDOILGR6KKTRHJG3';
const privKey2 = 'SCYY5YZ6FSYRPNF474W627BI6RCBNDBM6ODZ6MS53CC4UOBYUYZN4AGI';

const pubKey3 = 'GBG5JTXIOQEP2W3XJGQPYCJ7633KLFPA4SS5MB7FVOHIOWBXKEH2ZWBJ';
const privKey3 = 'SB2CRANE2SXYNSEW5UTTIGZLKICQKM65LLPLNAVKDVJYWBGTJLV33RU6';

// ----- Assets ----- //
const nativeAsset = new StellarSdk.Asset.native();
const mobiAsset = new StellarSdk.Asset( 'MOBI', 'GA6HCMBLTZS5VYYBCATRBRZ3BZJMAFUDKYYF6AH6MVCMGWMRDNSWJPIH');
const eurtAsset = new StellarSdk.Asset( 'EURT', 'GAP5LETOV6YIE62YAM56STDANPRDO7ZFDBGSNHJQIYGGKSMOZAHOOS2S');
const repoAsset = new StellarSdk.Asset( 'REPO', 'GCZNF24HPMYTV6NOEHI7Q5RJFFUI23JKUKY3H3XTQAFBQIBOHD5OXG3B');
const cnyAsset = new StellarSdk.Asset( 'CNY', 'GAREELUB43IRHWEASCFBLKHURCGMHE5IF6XSE7EXDLACYHGRHM43RFOX');
const futbolAsset = new StellarSdk.Asset( 'TFC', 'GDS3XDJAA4VY6MJYASIGSIMPHZ7AQNZ54RKLWT7MWCOU5YKYEVCNLVS3');
// if we want to make our asset lol
// const tycoin = new StellarSdk.Asset("Tycoin", "GDNZIMIWPMRQ3X3UNFF7A7XI26XILUP6QBFT6MX7B62GAKVO3ZWDWWUW");


// ----- functions ----- //

// -------------------------------------------------------------------- //
// desc: get balances for pub key
// inputs: publicKey: string
// returns: Array <Asset>
// -------------------------------------------------------------------- //
function getStellarBalances (publicKey) {
  return server.loadAccount(publicKey)
      .then(account => account)
      .then(account => account.balances)
      .catch(err => console.log(err) )
}

// -------------------------------------------------------------------- //
// desc: create transaction given arbirary amount of arbitrary types of operations
// inputs: senderPub: string, senderPriv: string, operations = operations: operation | Array<operation>
// returns: transactionResult
// -------------------------------------------------------------------- //
function createTransaction(senderPub, senderPriv, operations) {
    server.loadAccount(senderPub)
        .then(function(account){
            let builder; 
            if (!Array.isArray(operations))
                builder = new StellarSdk.TransactionBuilder(account)
                    .addOperation(operations);
            else  builder.operations = operations;
            const transaction = builder.build();
            transaction.sign(StellarSdk.Keypair.fromSecret(senderPriv));
            return server.submitTransaction(transaction);
        })
        .then(transactionResult => transactionResult)
        .catch(err => console.error(JSON.stringify(err.response.data.extras.result_codes)))
}

// todo: check for trust ...
// depends on UI when to use this but very simple look up
// -------------------------------------------------------------------- //
// desc: see if a seller accepts an asset
// inputs: receiverPub: string, asset: Asset
// returns: boolean
// -------------------------------------------------------------------- //
function checkForTrust(receiverPub, asset) {
    const asset_code = asset.getCode();
    const asset_issuer = asset.getIssuer();
    return getStellarBalances(receiverPub)
        .then(balances => balances.some(bal => (bal.asset_code === asset_code && 
                                                bal.asset_issuer === asset_issuer)))
}

// -------------------------------------------------------------------- //
// desc: creates, updates, or removes a trust line between a user and a specific asset-anchor
// inputs: pubkey: string, privkey: string, asset: Asset, trustOpType: enum, limit: num | string
// returns: transactionResult
// -------------------------------------------------------------------- //
const TrustOpType = {
    UpdateTrust: 'update',
    RemoveTrust: 'remove'
}

function changeTrust(pubkey, privkey, asset, trustOpType, limit = null) {
    return server.loadAccount(pubkey)
        .then(function(account) {
            const op = {
                asset: asset,
                source: pubkey,
            }
            if (limit) op.limit = new String(limit);
            else if (trustOpType == TrustOpType.RemoveTrust) op.limit = '0';
            // console.log(op.limit)
            const transaction = new StellarSdk.TransactionBuilder(account)
                .addOperation(StellarSdk.Operation.changeTrust(op))
                .build();
            transaction.sign(StellarSdk.Keypair.fromSecret(privkey));
            return server.submitTransaction(transaction);
        })
        .then(transactionResult => transactionResult)
        .catch(err => console.error(JSON.stringify(err.response.data.extras.result_codes)))
        // .catch(err => console.error(err))
}

// Cheapest = lowest source_amount
// -------------------------------------------------------------------- //
// desc: finds the first path given the necessary inputs
// inputs: sender: string, receiver: string, sendAsset: Asset, destAsset: Asset, destAmount: string | num, 
// returns: PathPaymentResult | transactionResult
// -------------------------------------------------------------------- //
function findCheapestPath(sender, receiver, sendAsset, destAsset, destAmount) {
    return server.paths(sender, receiver, destAsset, destAmount)
        .call()
        .then(paths => {
            const _paths = JSON.parse(JSON.stringify(paths)).records;
            const source_asset_code = sendAsset.getCode();
            const source_asset_issuer = sendAsset.getIssuer();
            const pathList = _paths.filter(path => (path.source_asset_code == source_asset_code && 
                                                    path.source_asset_issuer == source_asset_issuer))
            const cheapestPath = pathList.reduce((prev, curr) => (prev.source_amount < curr.source_amount ? prev : curr));
            if (cheapestPath) return cheapestPath;
            throw Error('err: No path exists between the corresponding assets')
        })
        .catch(err => console.error(JSON.stringify(err.response.data.extras.result_codes)))

}

// -------------------------------------------------------------------- //
// desc: creates a pathPaymentOperation given all the necessary inputs from the transaction and the results of the found path
// inputs: sender: string, receiver: string, sendAsset: Asset, destAsset: Asset, destAmount: string | num, 
//          pathPaymentResult: PathPaymentResult, buffer: float (percentage)
// returns: transactionResult
// -------------------------------------------------------------------- //
function createPath(sender, receiver, sendAsset, destAsset, destAmount, pathPaymentResult, buffer = 0.015) {
    const _path = pathPaymentResult.path.map(asset => {
        if (asset.asset_type === 'native') return nativeAsset;
        else return new Asset(asset.asset_code, asset.asset_issuer);
    });
    const paddedAmtWithBuffer = ((1 + buffer) * pathPaymentResult.source_amount).toFixed(7);
    const res = {
        source: sender,
        sendAsset: sendAsset,
        sendMax: new String(paddedAmtWithBuffer),
        destination: receiver,
        destAsset: destAsset,
        destAmount: '1',
        path: _path,
    };
    // console.log(res)
    return StellarSdk.Operation.pathPayment(res);
}


// ----- Test Data ----- //

// sample op-like data object
const ops = [
    {
        destination: pubKey2,
        asset: StellarSdk.Asset.native(),
        amount: "1"
    },
    {
        destination: pubKey3,
        asset: StellarSdk.Asset.native(),
        amount: "1"
    }
];

// sample operations after converting ops to proper StellarSdk operations
// can include type in object to resolve to specific operation 
const operations = ops.map(op => {
    return StellarSdk.Operation.payment({
        destination: op.destination,
        asset: op.asset,
        amount: op.amount
    });
});

// --- Sample ops ---- //
const mobiAssetOffer = StellarSdk.Operation.manageOffer({
    selling: nativeAsset,
    buying: mobiAsset,
    amount: '3',
    price: `${(3/5)}`,
    source: pubKey
});

const mobiAssetPmtOpt = StellarSdk.Operation.payment({
    destination: pubKey2,
    asset: mobiAsset,
    amount: "1",
    // source: pubKey
});

const mobiAssetPmtObj = {
    destination: pubKey2,
    asset: mobiAsset,
    amount: "1",
    source: pubKey
};

const eurtAssetOffer = StellarSdk.Operation.manageOffer({
    selling: nativeAsset,
    buying: eurtAsset,
    amount: '2',
    price: `${(2/3)}`, // need to understand this better
    // source: pubKey3
});


// ----- Sample Paths ----- //
// Path: Array <Asset>
const nativePath = [
    nativeAsset
];
const nonNativePath = [
    cnyAsset,
    nativeAsset
];

const mobiAssetPath = StellarSdk.Operation.pathPayment({    
    sendAsset: mobiAsset,
    sendMax: '5', // same as source_amount that you are willing to send -> you should send the max expected to equalize current market value
    destination: pubKey3,
    destAsset: repoAsset,
    destAmount: '1',
    path: nonNativePath,
    source: pubKey,
});

//  ---- ---------------- //
//  ---- sample runs ---- //
//  ---- ---------------- //

// getStellarBalances(pubKey).then(res => console.log(res))
// getStellarBalances(pubKey2).then(res => console.log(res))
// getStellarBalances(pubKey3).then(res => console.log(res))

// createTransaction(pubKey, privKey, operations);
// createTransaction(pubKey, privKey, mobiAssetPmtOpt);
// createTransaction(pubKey3, privKey3, eurtAssetOffer);

// checkForTrust(pubKey, mobiAsset).then(res => console.log(res)) // true
// checkForTrust(pubKey2, mobiAsset).then(res => console.log(res)) // true
// checkForTrust(pubKey2, repoAsset).then(res => console.log(res)) // true
// checkForTrust(pubKey2, futbolAsset).then(res => console.log(res)) // false
// checkForTrust(pubKey2, repoAsset).then(res => console.log(res)) // false
// checkForTrust(pubKey3, eurtAsset).then(res => console.log(res)) // true

// getStellarBalances(pubKey3).then(res => console.log(res))
// changeTrust(pubKey3, privKey3, cnyAsset, TrustOpType.changeTrust, 5000).then(res => console.log(res)) // true

// ------ TEST THAT WONT WORK INTENTIONALLY ------ ///
// this will not work because no paths exists for: futbolAsset 
// findFirstPath(pubKey, pubKey3, mobiAsset, futbolAsset, 1)

// ------ TEST THAT WORKS INTENTIONALLY ------ ///
findCheapestPath(pubKey, pubKey3, mobiAsset, repoAsset, 1)
    .then(res => console.log(res))
//     .catch(err => console.log(err))
//     .then(foundPath => createPath(pubKey, pubKey3, mobiAsset, repoAsset, 1, foundPath))
//     .then(pathPayment => createTransaction(pubKey, privKey, pathPayment))
//     .catch(err => console.log(err))
        