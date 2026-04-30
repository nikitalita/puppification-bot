import path, { dirname, resolve } from 'path';
import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { logger } from '../util/logger.js';
import 'dotenv/config';

export const STATE_FILE_PATH = getSaveLocation();

function getSaveLocation() {
    if (process.env?.SAVE_LOCATION) {
        return resolve(process.env?.SAVE_LOCATION, 'state.json');
    }
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);

    const location = resolve(__dirname, 'state.json');

    logger.warn("Environment variable SAVE_LOCATION is not set, defaulting to " + location);

    return location;
}


const stores: { [key: string]: any } = {};
await loadAllStores(); // Prepopulate stores

export async function saveStore(store: string, data: unknown) {
    stores[store] = data;
    saveState(stores);
    logger.debug("Saved: ", JSON.stringify(stores, null, 2));
}

export async function loadStore(store: string) {
    if (stores[store]) {
        logger.debug("Loaded store '", store, "' from cache.");
        return stores[store];
    }
    let loaded = await loadState();
    if (store in loaded) {
        logger.debug("Loaded: ", loaded[store]);
        stores[store] = loaded[store];
        return loaded[store];
    }
    return {};
}

async function saveState(data: unknown) {
    // ensure the directory exists
    const dir = path.dirname(STATE_FILE_PATH);
    if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
    }
    writeFileSync(STATE_FILE_PATH, JSON.stringify(data, null, 2));
}

async function loadState() {
    try {
        const data = await readFileSync(STATE_FILE_PATH, { "encoding": 'utf8', "flag": "r+" });
        if (!data) {
            logger.warn("Save state was unexpectedly null!");
            return {};
        }
        return JSON.parse(data);
    } catch (e: any) {
        if (e?.code === 'ENOENT') {
            // File not found, create
            writeFileSync(STATE_FILE_PATH, JSON.stringify({}, null, 2));
            return {};
        } else {
            logger.error(e);
        }
    }
}

async function loadAllStores() {
    let loaded = await loadState();
    logger.debug("Loaded: ", loaded);
    for (let [storeName, storeVal] of Object.entries(loaded)) {
        stores[storeName] = storeVal;
    }
}