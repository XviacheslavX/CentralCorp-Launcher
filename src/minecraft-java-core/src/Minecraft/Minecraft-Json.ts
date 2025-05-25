/**
 * This code is distributed under the CC-BY-NC 4.0 license:
 * https://creativecommons.org/licenses/by-nc/4.0/
 *
 * Original author: Luuxis
 */

import os from 'os';
import MinecraftNativeLinuxARM from './Minecraft-Lwjgl-Native.js';

/**
 * Basic structure for options passed to the Json class.
 * Modify or expand based on your actual usage.
 */
export interface JsonOptions {
	version: string;     // The targeted Minecraft version (e.g. "1.19", "latest_release", etc.)
	[key: string]: any;  // Include any additional fields needed by your code
}

/**
 * Represents a single version entry from Mojang's version manifest.
 */
export interface VersionEntry {
	id: string;
	type: string;
	url: string;
	time: string;
	releaseTime: string;
}

/**
 * Structure of the Mojang version manifest (simplified).
 */
export interface MojangVersionManifest {
	latest: {
		release: string;
		snapshot: string;
	};
	versions: VersionEntry[];
}

/**
 * Structure returned by the getInfoVersion method on success.
 */
export interface GetInfoVersionResult {
	InfoVersion: VersionEntry;
	json: any;       // The specific version JSON fetched from Mojang
	version: string; // The final resolved version (e.g., "1.19" if "latest_release" was given)
}

/**
 * Structure returned by getInfoVersion if an error occurs (version not found).
 */
export interface GetInfoVersionError {
	error: true;
	message: string;
}

/**
 * This class retrieves Minecraft version information from Mojang's
 * version manifest, and optionally processes the JSON for ARM-based Linux.
 */
export default class Json {
	private readonly options: JsonOptions;

	constructor(options: JsonOptions) {
		this.options = options;
	}

	/**
	 * Fetches the Mojang version manifest, resolves the intended version (release, snapshot, etc.),
	 * and returns the associated JSON object for that version.
	 * If the system is Linux ARM, it will run additional processing on the JSON.
	 *
	 * @returns An object containing { InfoVersion, json, version }, or an error object.
	 */
	public async GetInfoVersion(): Promise<GetInfoVersionResult | GetInfoVersionError> {
		let { version } = this.options;

		// Fetch the version manifest
		const response = await fetch(
			`https://launchermeta.mojang.com/mc/game/version_manifest_v2.json?_t=${new Date().toISOString()}`
		);
		const manifest: MojangVersionManifest = await response.json();

		// Resolve "latest_release"/"latest_snapshot" shorthands
		if (version === 'latest_release' || version === 'r' || version === 'lr') {
			version = manifest.latest.release;
		} else if (version === 'latest_snapshot' || version === 's' || version === 'ls') {
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
		if (os.platform() === 'linux' && os.arch().startsWith('arm')) {
			versionJson = await new MinecraftNativeLinuxARM(this.options).ProcessJson(versionJson);
		}

		return {
			InfoVersion: matchedVersion,
			json: versionJson,
			version
		};
	}
}
