/**
 * This code is distributed under the CC-BY-NC 4.0 license:
 * https://creativecommons.org/licenses/by-nc/4.0/
 *
 * Original author: Luuxis
 */

import fs from 'fs';
import path from 'path';
import { getFileHash } from '../utils/Index.js';

/**
 * Represents a single file or object that may need to be downloaded or checked.
 */
export interface BundleItem {
	type?: 'CFILE' | 'Assets' | string; // e.g., "CFILE" for direct content files
	path: string;                       // Local path where file is or should be stored
	folder?: string;                    // Directory path (derived from 'path')
	content?: string;                   // File content if type === "CFILE"
	sha1?: string;                      // Expected SHA-1 hash for the file
	size?: number;                      // Size in bytes if relevant
	url?: string;                       // Download URL if relevant
}

/**
 * Options for the MinecraftBundle class, indicating paths and ignored files.
 */
export interface MinecraftBundleOptions {
	path: string;             // The main Minecraft directory or root path
	instance?: string;        // Instance name, if working with multiple instances
	ignored: string[];        // Files or directories to ignore when cleaning
}

/**
 * This class manages checking, downloading, and cleaning up Minecraft files.
 * It compares local files with a provided bundle, identifies missing or
 * outdated files, and can remove extraneous files.
 */
export default class MinecraftBundle {
	private options: MinecraftBundleOptions;

	constructor(options: MinecraftBundleOptions) {
		this.options = options;
	}

	/**
	 * Checks each item in the provided bundle to see if it needs to be
	 * downloaded or updated (e.g., if hashes don't match).
	 *
	 * @param bundle Array of file items describing what needs to be on disk.
	 * @returns Array of BundleItem objects that require downloading.
	 */
	public async checkBundle(bundle: BundleItem[]): Promise<BundleItem[]> {
		const toDownload: BundleItem[] = [];

		for (const file of bundle) {
			if (!file.path) continue;

			// Convert path to absolute, consistent format
			file.path = path.resolve(this.options.path, file.path).replace(/\\/g, '/');
			file.folder = file.path.split('/').slice(0, -1).join('/');

			// If it's a direct content file (CFILE), we create/write the content immediately
			if (file.type === 'CFILE') {
				if (!fs.existsSync(file.folder)) {
					fs.mkdirSync(file.folder, { recursive: true, mode: 0o777 });
				}
				fs.writeFileSync(file.path, file.content ?? '', { encoding: 'utf8', mode: 0o755 });
				continue;
			}

			// If the file is supposed to have a certain hash, check it.
			if (fs.existsSync(file.path)) {
				// Build the instance path prefix for ignoring checks
				let replaceName = `${this.options.path}/`;
				if (this.options.instance) {
					replaceName = `${this.options.path}/instances/${this.options.instance}/`;
				}

				// If file is in "ignored" list, skip checks
				const relativePath = file.path.replace(replaceName, '');
				if (this.options.ignored.includes(relativePath)) {
					continue;
				}

				// If the file has a hash and doesn't match, mark it for download
				if (file.sha1) {
					const localHash = await getFileHash(file.path);
					if (localHash !== file.sha1) {
						toDownload.push(file);
					}
				}
			} else {
				// The file doesn't exist at all, mark it for download
				toDownload.push(file);
			}
		}

		return toDownload;
	}

	/**
	 * Calculates the total download size of all files in the bundle.
	 *
	 * @param bundle Array of items in the bundle (with a 'size' field).
	 * @returns Sum of all file sizes in bytes.
	 */
	public async getTotalSize(bundle: BundleItem[]): Promise<number> {
		let totalSize = 0;
		for (const file of bundle) {
			if (file.size) {
				totalSize += file.size;
			}
		}
		return totalSize;
	}

	/**
	 * Removes files or directories that should not be present, i.e., those
	 * not listed in the bundle and not in the "ignored" list.
	 * If the file is a directory, it's removed recursively.
	 *
	 * @param bundle Array of BundleItems representing valid files.
	 */
	public async checkFiles(bundle: BundleItem[]): Promise<void> {
		// If using instances, ensure the 'instances' directory exists
		let instancePath = '';
		if (this.options.instance) {
			if (!fs.existsSync(`${this.options.path}/instances`)) {
				fs.mkdirSync(`${this.options.path}/instances`, { recursive: true });
			}
			instancePath = `/instances/${this.options.instance}`;
		}

		// Gather all existing files in the relevant directory
		const allFiles = this.options.instance
			? this.getFiles(`${this.options.path}${instancePath}`)
			: this.getFiles(this.options.path);

		// Also gather files from "loader" and "runtime" directories to ignore
		const ignoredFiles = [
			...this.getFiles(`${this.options.path}/loader`),
			...this.getFiles(`${this.options.path}/runtime`)
		];

		// Convert custom ignored paths to actual file paths
		for (let ignoredPath of this.options.ignored) {
			ignoredPath = `${this.options.path}${instancePath}/${ignoredPath}`;
			if (fs.existsSync(ignoredPath)) {
				if (fs.statSync(ignoredPath).isDirectory()) {
					// If it's a directory, add all files within it
					ignoredFiles.push(...this.getFiles(ignoredPath));
				} else {
					// If it's a single file, just add that file
					ignoredFiles.push(ignoredPath);
				}
			}
		}

		// Mark bundle paths as ignored (so we don't delete them)
		bundle.forEach(file => {
			ignoredFiles.push(file.path);
		});

		// Filter out all ignored files from the main file list
		const filesToDelete = allFiles.filter(file => !ignoredFiles.includes(file));

		// Remove each file or directory
		for (const filePath of filesToDelete) {
			try {
				const stats = fs.statSync(filePath);
				if (stats.isDirectory()) {
					fs.rmSync(filePath, { recursive: true });
				} else {
					fs.unlinkSync(filePath);

					// Clean up empty folders going upward until we hit the main path
					let currentDir = path.dirname(filePath);
					while (true) {
						if (currentDir === this.options.path) break;
						const dirContents = fs.readdirSync(currentDir);
						if (dirContents.length === 0) {
							fs.rmSync(currentDir);
						}
						currentDir = path.dirname(currentDir);
					}
				}
			} catch {
				// If an error occurs (e.g. file locked or non-existent), skip it
				continue;
			}
		}
	}

	/**
	 * Recursively gathers all files in a given directory path.
	 * If a directory is empty, it is also added to the returned array.
	 *
	 * @param dirPath The starting directory path to walk.
	 * @param collectedFiles Used internally to store file paths.
	 * @returns The array of all file paths (and empty directories) under dirPath.
	 */
	private getFiles(dirPath: string, collectedFiles: string[] = []): string[] {
		if (fs.existsSync(dirPath)) {
			const entries = fs.readdirSync(dirPath);
			// If the directory is empty, store it as a "file" so it can be processed
			if (entries.length === 0) {
				collectedFiles.push(dirPath);
			}
			// Explore each child entry
			for (const entry of entries) {
				const fullPath = `${dirPath}/${entry}`;
				const stats = fs.statSync(fullPath);
				if (stats.isDirectory()) {
					this.getFiles(fullPath, collectedFiles);
				} else {
					collectedFiles.push(fullPath);
				}
			}
		}
		return collectedFiles;
	}
}
