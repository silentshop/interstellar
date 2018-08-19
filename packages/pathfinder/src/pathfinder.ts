const config =  require('../../../config.json');
const { Pool } =  require('pg');
const pool = new Pool({
    user: 'postgres',
    host: 'interstellar.market',
    database: 'silent_shop',
    password: config.pg.password,
    port: 5432,
});


export interface stellarAsset {
    code: string;
    issuerPublicKey: string;
}

export interface IPathInfo {
    to: stellarAsset;
    from: stellarAsset;
    path: stellarAsset[] | null;
    bucket: number;
    exchangeRate: number | null; // to / from
}

interface stellarBalance { 
    balances: Array<
    {
        balance: string
        asset_type: 'native'
    } |
    {
        balance: string
        limit: string
        asset_type: 'credit_alphanum4' | 'credit_alphanum12'
        asset_code: string
        asset_issuer: string
    }
    >;
}

interface Cache {
    cache: any;
    savePathsToCache(key: string, bucket: number, bestPaths: IPathInfo[]): any;
    removeFromCache(key: string): any;
    lookupInCache(key: string): any;
}

export class PathfinderInitializationError extends Error {}

import * as StellarSdk from 'stellar-sdk'; 

export class Pathfinder {

    /**
     * This public key should correspond to an account that holds balances of each of
     * the assets that we support. It will be used as both the destination and source
     * account for all of the pathfinding algorithms. TODO fill it in
     */
    public static REFERENCE_ACCOUNT_PUBLIC_KEY = "GBG47DCYZCY4UU4UN7XSECYT45IRTCUGZN73SVZE5TSCIB3DQDREYUTS";
    public supportedAssets: stellarAsset[];
    private server: StellarSdk.Server;

    constructor() {
        this.server = new StellarSdk.Server('https://horizon.stellar.org');
    }

    /****************************************
     * Initialization methods
     ****************************************/

    /**
     * Should perform the following actions:
     *
     * - loads the list of supported assets
     */
    public async init() {

        return Promise.all([
            this.getSupportedAssets().then(() => this.validateSupportedAssets(this.supportedAssets))
        ]);

    }

    /**
     * Loads the list of supported assets from the postgres database
     */
    private async getSupportedAssets() {

        let assets = [] as stellarAsset[];
        const query = {
            text: 'SELECT id, asset_code, asset_issuer, asset_type from ASSETS'
        };
        return pool.query(query)
            .then((queryResult: any) => queryResult.rows)
            .then((dbAssets: any) => {
                assets = dbAssets;
                this.supportedAssets = dbAssets;
                return dbAssets;
            });
            
    }

    /**
     * helper for below
     * returns a key to be used for lookup in the form of `code-issuer`
     */
    private makeKeyPairHelper = (asset_code: string, asset_issuer: string, asset_type: string): string => {
        const key = (asset_type !== 'native')
            ? `${asset_code}-${asset_issuer}`
            : 'XLM';
        return key;
    }


    /**
     * Takes in stellarAsset | StellarSdk.Asset 
     * returns a key to be used for lookup in the form of `code-issuer`
     */
    private makeKeyPair = (asset: any): string => {
        const { asset_code, asset_issuer, asset_type } = asset;
        return this.makeKeyPairHelper(asset_code, asset_issuer, asset_type);
    }

    /**
    * Takes in a StellarSdk.PaymentPathRecord and 
    * returns a key to be used for lookup in the form of `code-issuer`
    */
    private makeKeyPairFromPath = (pathResult: StellarSdk.PaymentPathRecord ): string => {
        const { source_asset_code, source_asset_issuer, source_asset_type } = pathResult;
        return this.makeKeyPairHelper(source_asset_code, source_asset_issuer, source_asset_type);
    }


    /**
     * Ensures that the account belonging to REFERENCE_ACCOUNT_PUBLIC_KEY contains balances
     * of all of (but also ONLY) the indicated assets
     *
     * throws PathfinderInitializationError if incorrectly formatted
     */
    private async validateSupportedAssets(assets: [stellarAsset]) {
        return this.server.loadAccount(Pathfinder.REFERENCE_ACCOUNT_PUBLIC_KEY)
            .then((account: StellarSdk.AccountRecord) => account.balances)
            // todo Resolve this type to stellarBalance
            .then((balances: any) => {
                if (assets.length !== balances.length) throw PathfinderInitializationError;
                else {
                    const asset_dict: { [index: string]: boolean } = {};
                    assets.map((asset: stellarAsset) => {
                        const key = this.makeKeyPair(asset);
                        asset_dict[key] = true;
                    });
                    balances.map((asset: StellarSdk.Asset) => {
                        const key = this.makeKeyPair(asset);
                        if (!asset_dict[key] && !asset.isNative()) throw PathfinderInitializationError
                    });
                }
                return true;
            });
    }

    /****************************************
     * Pathfinding Utilities
     ****************************************/
    public async getPath(params: {
        sourceAsset: stellarAsset,
        destinationAsset: stellarAsset,
        destinationAmount: number,
    }): Promise<IPathInfo> {
        const { sourceAsset, destinationAsset, destinationAmount } = params;

        // checks to make sure that both of the assets are supported in the database
        if (!this.supportsAsset(sourceAsset)) {
            throw new Error(`[getPath] Given an unsupported sourceAsset: ${sourceAsset}`);
        } else if (!this.supportsAsset(destinationAsset)) {
            throw new Error(`[getPath] Given an unsupported destinationAsset: ${destinationAsset}`);
        }

        // calculate the quanitized threshold amount
        const bucket = await this.getBucket(destinationAsset, destinationAmount);

        // check to see if the path info was cached
        const cachedInfo = await this.loadPathFromCache(sourceAsset, destinationAsset, bucket);
        if (cachedInfo) { return cachedInfo; }

        // get the best paths for the destination asset and amount
        const bestPaths = await this.getBestPaths(destinationAsset, destinationAmount);

        // cache the results - no need to await this
        this.savePathsToCache(destinationAsset, bucket, bestPaths);

        // get the best path corresponding to the sourceAsset and return
        const bestPath = bestPaths.find((pathInfo) => {
            return pathInfo.from.issuerPublicKey === sourceAsset.issuerPublicKey &&
                pathInfo.from.code == sourceAsset.code;
        });

        if (!bestPath) {
            throw new Error("[getPath]: stellar account not configured correctly");
        }

        return bestPath;
    }

    /***************************************************************************
     * Cache Logic
     ***************************************************************************/

    /**
     * Queries the cache and returns a promise for the path information; if no path information
     * exists, the promise resolves to null.
     */
    private async loadPathFromCache(
        sourceAsset: stellarAsset,
        destinationAsset: stellarAsset,
        threshold: number,
    ): Promise<IPathInfo | null> {
        // todo provide the retrieval logic
        const key = `${destinationAsset.code}_${destinationAsset.issuerPublicKey}`;
        const TEMP_DICT = {};
        // return new Promise((res: any, rej: any ) => {
        //      return this.cache.lookup(key)
        //     Promise.resolve(null);
        // });
        return Promise.resolve(null);
    }

    /**
     * Saves the path info to the cache for each path in bestPaths
     *
     * Note: no need to make this a promise because we will never check up on it
     */
    private savePathsToCache(
        destinationAsset: stellarAsset,
        bucket: number,
        bestPaths: IPathInfo[],
    ) {
        const keyPrefix = `${destinationAsset.code}_${destinationAsset.issuerPublicKey}-${bucket}-`;

        bestPaths.forEach((pathInfo) => {
            // todo: need to be able to XLM which doesnt have all asset props
            const key = `${keyPrefix}${pathInfo.from.code}-${pathInfo.from.issuerPublicKey}`;
            const value = {
                exchangeRate: pathInfo.exchangeRate,
                path: pathInfo.path,
            };
            // todo provide the saving mechanism
            // this.cache.savePaths(key, value)
        });
    }

    /**
     * Computes the relevant bucket for the given destination asset and amount. This is
     * required because the paths between assets might be different at different amounts; however,
     * to enable caching we must quantize the destination amounts to constrain the maximum cache size
     * (e.g., caching every real numbered destination amount that we receive would result in way too
     * many cache entries and cache misses)
     *
     * For example, consider needing to convert eth to btc. The path for 1 btc might be
     *
     * eth - btc
     *
     * but for larger amounts like 100 btc it might be more complicated
     *
     * eth - intermediate 1 - intermediate 2 - intermediate 3 - btc
     *
     * //Todo need to decide and implement the quantization method
     */

    private getBucket(
        destinationAsset: stellarAsset,
        destinationAmount: number,
    ): number {
        return 10000;
    }

    /***************************************************************************
     * Stellar Interface
     ***************************************************************************/

    /**
     * returns the exchange rate of 2 assets
     */
    private calculateExchangeRate = (destination_amount: number, source_amount: number): number => {
        return (source_amount / destination_amount);
    }

    /**
     * Properly constructs IPathInfo from StellarSdk.PaymentPathRecord
     */
    private constructPathInfo = (pathFoundResult: StellarSdk.PaymentPathRecord): IPathInfo => {
        const { 
            source_amount,
            source_asset_code, 
            source_asset_issuer, 
            source_asset_type,
            destination_amount,
            destination_asset_type,
            destination_asset_issuer,
            destination_asset_code,
            path,
        } = pathFoundResult;
        const source_asset = (source_asset_type !== 'native') 
            ? {
                code: source_asset_code,
                issuerPublicKey: source_asset_issuer
            } as stellarAsset
            : {
                code: 'XLM',
                issuerPublicKey: ''
            } as stellarAsset;
        const destination_asset = (destination_asset_type !== 'native') 
            ? {
                code: destination_asset_code,
                issuerPublicKey: destination_asset_issuer
            } as stellarAsset
            : {
                code: 'XLM',
                issuerPublicKey: ''
            } as stellarAsset;
        const dest_amount_str = parseFloat(destination_amount);
        const bucket = this.getBucket(destination_asset, dest_amount_str);
        const exchangeRate = this.calculateExchangeRate(dest_amount_str, parseFloat(source_amount));
        const _path = path.map((asset: { asset_code: string, asset_issuer: string, asset_type: string}) => {
            return { code: asset.asset_code, issuerPublicKey: asset.asset_issuer } as stellarAsset;
        });
        return {
            to: destination_asset,
            from: source_asset,
            path: _path,
            bucket: bucket,
            exchangeRate: exchangeRate
        } as IPathInfo;
    }    
     
    /**
     * Helper For below
     * Creates a StellarSdk.Asset to be used in server calls
     */
    private constructStellarAsset = (asset: stellarAsset): StellarSdk.Asset => {
        const { code, issuerPublicKey } = asset;
        const returnAsset = (code !== 'X:M') 
            ? new StellarSdk.Asset(code, issuerPublicKey)
            : StellarSdk.Asset.native();
        return returnAsset;
    }
    
    /**
     * Returns a list of the best paths from each of the supported assets to the given
     * destination asset and amount 
     * 
     * Note: uses REFERENCE_ACCOUNT_PUBLIC_KEY as the destination and source accounts
     */
    private async getBestPaths(
        destinationAsset: stellarAsset,
        destinationAmount: number,
    ): Promise<IPathInfo[]> {

        const _destinationAsset = this.constructStellarAsset(destinationAsset);
        return this.server.paths(Pathfinder.REFERENCE_ACCOUNT_PUBLIC_KEY, 
                            Pathfinder.REFERENCE_ACCOUNT_PUBLIC_KEY, 
                            _destinationAsset, String(destinationAmount))
                    .call()
                    .then((paths: any) => JSON.parse(JSON.stringify(paths)).records)
                    .then((paths: StellarSdk.PaymentPathRecord[]) => {
                        const pathRecordDict: { [index: string]: StellarSdk.PaymentPathRecord } = {};
                        paths.map((pathResult: StellarSdk.PaymentPathRecord) => {
                            const key = this.makeKeyPairFromPath(pathResult);
                            if (!pathRecordDict[key]) {
                                pathRecordDict[key] = pathResult;
                            } else {
                                const { source_amount } = pathResult;
                                const saved_source_amount = this.calculateExchangeRate(destinationAmount, 
                                    parseInt(pathRecordDict[key].source_amount)) || null;
                                if (saved_source_amount !== null &&
                                    saved_source_amount > this.calculateExchangeRate(destinationAmount, parseInt(source_amount))) {
                                    pathRecordDict[key] = pathResult;
                                }
                            }
                        });
                        const pathArray = Object.keys(pathRecordDict).map(key => this.constructPathInfo(pathRecordDict[key]));
                        if (pathArray !== null && pathArray.length > 0) return Promise.resolve(pathArray);
                        else throw new Error(`[getBestPaths]: No path found to ${_destinationAsset.code} \
                            in the amount of ${destinationAmount}`);
                    })
    }

    /***************************************************************************
     * Utilities
     ***************************************************************************/

    /**
     * Checks that we support the indicated asset
     */
    private supportsAsset(asset: stellarAsset) {
        return this.supportedAssets!.findIndex((supportedAsset) => {
            return asset.code === supportedAsset.code && asset.issuerPublicKey === supportedAsset.issuerPublicKey;
        }) !== -1;
    }

}
