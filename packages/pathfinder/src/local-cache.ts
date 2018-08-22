import { IStellarAssetMetadata, IPathInfo } from "./pathfinder";

export class KeyNotFoundError extends Error {}

// local cache class implementation
export class LocalCache {
    
    private static EVICTION_TIME: number = 300000;

    // in-memory data
    private cache: { [index: string]: IPathInfo | null };

    constructor(cache: any) {
        this.cache = cache;
    }

    /**
     * adds / updates cache with new best paths list going to the destination asset
     */
    public savePathsToCache(key: string, value: IPathInfo, bestPaths: IPathInfo[]): void {
        this.cache[key] = value;
        setTimeout(() => this.removeFromCache(key), LocalCache.EVICTION_TIME);
    }

    /**
     * returns if an item is in the cache
     */
    public lookupPathInCache(key: string): Promise < IPathInfo | null > {
        if (this.cache.hasOwnProperty(key))
            return Promise.resolve(this.cache[key])
        throw new KeyNotFoundError;

    }
    
    /**
     * removes an asset from the cache
     */
    private removeFromCache(key: string): void {
        if (this.cache.hasOwnProperty(key))
            this.cache[key] = null;
        throw new KeyNotFoundError;
    }

}
