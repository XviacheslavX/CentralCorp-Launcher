"use strict";
/**
 * This code is distributed under the CC-BY-NC 4.0 license:
 * https://creativecommons.org/licenses/by-nc/4.0/
 *
 * Original author: Luuxis
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const os_1 = __importDefault(require("os"));
const Minecraft_Lwjgl_Native_js_1 = __importDefault(require("./Minecraft-Lwjgl-Native.js"));
/**
 * This class retrieves Minecraft version information from Mojang's
 * version manifest, and optionally processes the JSON for ARM-based Linux.
 */
class Json {
    constructor(options) {
        this.options = options;
    }
    /**
     * Fetches the Mojang version manifest, resolves the intended version (release, snapshot, etc.),
     * and returns the associated JSON object for that version.
     * If the system is Linux ARM, it will run additional processing on the JSON.
     *
     * @returns An object containing { InfoVersion, json, version }, or an error object.
     */
    async GetInfoVersion() {
        let { version } = this.options;
        // Fetch the version manifest
        const response = await fetch(`https://launchermeta.mojang.com/mc/game/version_manifest_v2.json?_t=${new Date().toISOString()}`);
        const manifest = await response.json();
        // Resolve "latest_release"/"latest_snapshot" shorthands
        if (version === 'latest_release' || version === 'r' || version === 'lr') {
            version = manifest.latest.release;
        }
        else if (version === 'latest_snapshot' || version === 's' || version === 'ls') {
            version = manifest.latest.snapshot;
        }
        // Find the matching version info from the manifest
        const matchedVersion = manifest.versions.find((v) => v.id === version);
        if (!matchedVersion) {
            return {
                error: true,
                message: `Minecraft ${version} is not found.`
            };
        }
        // Fetch the detailed version JSON from Mojang
        const jsonResponse = await fetch(matchedVersion.url);
        let versionJson = await jsonResponse.json();
        // If on Linux ARM, run additional processing
        if (os_1.default.platform() === 'linux' && os_1.default.arch().startsWith('arm')) {
            versionJson = await new Minecraft_Lwjgl_Native_js_1.default(this.options).ProcessJson(versionJson);
        }
        return {
            InfoVersion: matchedVersion,
            json: versionJson,
            version
        };
    }
}
exports.default = Json;
//# sourceMappingURL=Minecraft-Json.js.map