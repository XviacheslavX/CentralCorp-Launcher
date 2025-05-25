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
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const events_1 = require("events");
const Index_js_1 = require("../../../utils/Index.js");
const Downloader_js_1 = __importDefault(require("../../../utils/Downloader.js"));
const patcher_js_1 = __importDefault(require("../../patcher.js"));
/**
 * Maps Node.js process.platform values to Mojang library naming conventions.
 * Used for choosing the right native library.
 */
const Lib = {
    win32: 'windows',
    darwin: 'osx',
    linux: 'linux'
};
/**
 * The main class for handling Forge installations, including:
 *  - Downloading the appropriate Forge installer
 *  - Extracting relevant files from the installer
 *  - Patching Forge when necessary
 *  - Creating a merged jar for older Forge versions
 */
class ForgeMC extends events_1.EventEmitter {
    constructor(options) {
        super();
        this.options = options;
    }
    /**
     * Downloads the Forge installer (or client/universal) for the specified version/build.
     * Verifies the downloaded file's MD5 hash. Returns file details or an error.
     *
     * @param Loader An object containing URLs for metadata and Forge files.
     */
    async downloadInstaller(Loader) {
        // Fetch metadata for the given Forge version
        let metaDataList = await fetch(Loader.metaData)
            .then(res => res.json())
            .then(json => json[this.options.loader.version]);
        if (!metaDataList) {
            return { error: `Forge ${this.options.loader.version} not supported` };
        }
        const allBuilds = metaDataList;
        let build;
        // Handle "latest" or "recommended" builds by checking promotions
        if (this.options.loader.build === 'latest') {
            let promotions = await fetch(Loader.promotions).then(res => res.json());
            const promoKey = `${this.options.loader.version}-latest`;
            const promoBuild = promotions.promos[promoKey];
            build = metaDataList.find(b => b.includes(promoBuild));
        }
        else if (this.options.loader.build === 'recommended') {
            let promotions = await fetch(Loader.promotions).then(res => res.json());
            let promoKey = `${this.options.loader.version}-recommended`;
            let promoBuild = promotions.promos[promoKey] || promotions.promos[`${this.options.loader.version}-latest`];
            build = metaDataList.find(b => b.includes(promoBuild));
        }
        else {
            // Else, look for a specific numeric build if provided
            build = this.options.loader.build;
        }
        const chosenBuild = metaDataList.find(b => b === build);
        if (!chosenBuild) {
            return {
                error: `Build ${build} not found, Available builds: ${allBuilds.join(', ')}`
            };
        }
        // Fetch info about the chosen build from the meta URL
        const meta = await fetch(Loader.meta.replace(/\${build}/g, chosenBuild)).then(res => res.json());
        // Determine which classifier to use (installer, client, or universal)
        const hasInstaller = meta.classifiers.installer;
        const hasClient = meta.classifiers.client;
        const hasUniversal = meta.classifiers.universal;
        let forgeURL = '';
        let ext = '';
        let hashFileOrigin = '';
        if (hasInstaller) {
            forgeURL = Loader.install.replace(/\${version}/g, chosenBuild);
            ext = Object.keys(meta.classifiers.installer)[0];
            hashFileOrigin = meta.classifiers.installer[ext];
        }
        else if (hasClient) {
            forgeURL = Loader.client.replace(/\${version}/g, chosenBuild);
            ext = Object.keys(meta.classifiers.client)[0];
            hashFileOrigin = meta.classifiers.client[ext];
        }
        else if (hasUniversal) {
            forgeURL = Loader.universal.replace(/\${version}/g, chosenBuild);
            ext = Object.keys(meta.classifiers.universal)[0];
            hashFileOrigin = meta.classifiers.universal[ext];
        }
        else {
            return { error: 'Invalid forge installer' };
        }
        const forgeFolder = path_1.default.resolve(this.options.path, 'forge');
        const fileName = `${forgeURL}.${ext}`.split('/').pop();
        const installerPath = path_1.default.resolve(forgeFolder, fileName);
        // Download if not already present
        if (!fs_1.default.existsSync(installerPath)) {
            if (!fs_1.default.existsSync(forgeFolder)) {
                fs_1.default.mkdirSync(forgeFolder, { recursive: true });
            }
            const dl = new Downloader_js_1.default();
            dl.on('progress', (downloaded, size) => {
                this.emit('progress', downloaded, size, fileName);
            });
            await dl.downloadFile(`${forgeURL}.${ext}`, forgeFolder, fileName);
        }
        // Verify the MD5 hash
        const hashFileDownload = await (0, Index_js_1.getFileHash)(installerPath, 'md5');
        if (hashFileDownload !== hashFileOrigin) {
            fs_1.default.rmSync(installerPath);
            return { error: 'Invalid hash' };
        }
        return {
            filePath: installerPath,
            metaData: chosenBuild,
            ext,
            id: `forge-${build}`
        };
    }
    /**
     * Extracts the main Forge profile from the installer's archive (install_profile.json),
     * plus an additional JSON if specified in that profile. Returns an object containing
     * both "install" and "version" data for further processing.
     *
     * @param pathInstaller Path to the downloaded Forge installer file.
     */
    async extractProfile(pathInstaller) {
        const fileContent = await (0, Index_js_1.getFileFromArchive)(pathInstaller, 'install_profile.json');
        if (!fileContent) {
            return { error: { message: 'Invalid forge installer' } };
        }
        const forgeJsonOrigin = JSON.parse(fileContent.toString());
        if (!forgeJsonOrigin) {
            return { error: { message: 'Invalid forge installer' } };
        }
        const result = {};
        // Distinguish between older and newer Forge installers
        if (forgeJsonOrigin.install) {
            result.install = forgeJsonOrigin.install;
            result.version = forgeJsonOrigin.versionInfo;
        }
        else {
            result.install = forgeJsonOrigin;
            const extraFile = await (0, Index_js_1.getFileFromArchive)(pathInstaller, path_1.default.basename(result.install.json));
            if (!extraFile) {
                return { error: { message: 'Invalid additional JSON in forge installer' } };
            }
            result.version = JSON.parse(extraFile.toString());
        }
        return result;
    }
    /**
     * Extracts the "universal" Forge jar (or other relevant data) from the installer,
     * placing it in your local "libraries" folder. Also extracts client data if required.
     *
     * @param profile The Forge profile object containing file paths to extract.
     * @param pathInstaller The path to the Forge installer file.
     * @returns A boolean (skipForgeFilter) that indicates whether to filter out certain Forge libs
     */
    async extractUniversalJar(profile, pathInstaller) {
        let skipForgeFilter = true;
        // If there's a direct file path, extract just that file
        if (profile.filePath) {
            const fileInfo = (0, Index_js_1.getPathLibraries)(profile.path);
            this.emit('extract', `Extracting ${fileInfo.name}...`);
            const destFolder = path_1.default.resolve(this.options.path, 'libraries', fileInfo.path);
            if (!fs_1.default.existsSync(destFolder)) {
                fs_1.default.mkdirSync(destFolder, { recursive: true });
            }
            const archiveContent = await (0, Index_js_1.getFileFromArchive)(pathInstaller, profile.filePath);
            if (archiveContent) {
                fs_1.default.writeFileSync(path_1.default.join(destFolder, fileInfo.name), archiveContent, { mode: 0o777 });
            }
        }
        // Otherwise, if there's a path referencing "maven/<something>"
        else if (profile.path) {
            const fileInfo = (0, Index_js_1.getPathLibraries)(profile.path);
            const filesInArchive = await (0, Index_js_1.getFileFromArchive)(pathInstaller, null, `maven/${fileInfo.path}`);
            for (const file of filesInArchive) {
                const fileName = path_1.default.basename(file);
                this.emit('extract', `Extracting ${fileName}...`);
                const fileContent = await (0, Index_js_1.getFileFromArchive)(pathInstaller, file);
                if (!fileContent) {
                    continue;
                }
                const destFolder = path_1.default.resolve(this.options.path, 'libraries', fileInfo.path);
                if (!fs_1.default.existsSync(destFolder)) {
                    fs_1.default.mkdirSync(destFolder, { recursive: true });
                }
                fs_1.default.writeFileSync(path_1.default.join(destFolder, fileName), fileContent, { mode: 0o777 });
            }
        }
        else {
            // If we do not find filePath or path in profile, skip the Forge filter
            skipForgeFilter = false;
        }
        // If there are processors, we likely have a "client.lzma" to store
        if (profile.processors?.length) {
            const universalPath = profile.libraries?.find((v) => (v.name || '').startsWith('net.minecraftforge:forge'));
            const clientData = await (0, Index_js_1.getFileFromArchive)(pathInstaller, 'data/client.lzma');
            if (clientData) {
                const fileInfo = (0, Index_js_1.getPathLibraries)(profile.path || universalPath.name, '-clientdata', '.lzma');
                const destFolder = path_1.default.resolve(this.options.path, 'libraries', fileInfo.path);
                if (!fs_1.default.existsSync(destFolder)) {
                    fs_1.default.mkdirSync(destFolder, { recursive: true });
                }
                fs_1.default.writeFileSync(path_1.default.join(destFolder, fileInfo.name), clientData, { mode: 0o777 });
                this.emit('extract', `Extracting ${fileInfo.name}...`);
            }
        }
        return skipForgeFilter;
    }
    /**
     * Downloads all the libraries needed by the Forge profile, skipping duplicates
     * and any library that is already present. Also applies optional skip logic
     * for certain Forge libraries if skipForgeFilter is true.
     *
     * @param profile The parsed Forge profile.
     * @param skipForgeFilter Whether to filter out "net.minecraftforge:forge" or "minecraftforge"
     * @returns An array of the final libraries (including newly downloaded ones).
     */
    async downloadLibraries(profile, skipForgeFilter) {
        let libraries = profile.version?.libraries || [];
        const dl = new Downloader_js_1.default();
        let checkCount = 0;
        const downloadList = [];
        let totalSize = 0;
        // Combine with any "install.libraries"
        if (profile.install?.libraries) {
            libraries = libraries.concat(profile.install.libraries);
        }
        // Remove duplicates by name
        libraries = libraries.filter((library, index, self) => index === self.findIndex(t => t.name === library.name));
        // Certain Forge libs may be skipped if skipForgeFilter is true
        const skipForge = ['net.minecraftforge:forge:', 'net.minecraftforge:minecraftforge:'];
        for (const lib of libraries) {
            // If skipForgeFilter is true, skip the core Forge libs
            if (skipForgeFilter && skipForge.some(forgePrefix => lib.name.includes(forgePrefix))) {
                // If the artifact URL is empty, we skip it
                if (!lib.downloads?.artifact?.url) {
                    this.emit('check', checkCount++, libraries.length, 'libraries');
                    continue;
                }
            }
            // Some libraries might need skipping altogether (e.g., OS-specific constraints)
            if ((0, Index_js_1.skipLibrary)(lib)) {
                this.emit('check', checkCount++, libraries.length, 'libraries');
                continue;
            }
            // Check if the library includes "natives" for the current OS
            let nativesSuffix;
            if (lib.natives) {
                nativesSuffix = lib.natives[Lib[process.platform]];
            }
            const libInfo = (0, Index_js_1.getPathLibraries)(lib.name, nativesSuffix ? `-${nativesSuffix}` : '');
            const libFolder = path_1.default.resolve(this.options.path, 'libraries', libInfo.path);
            const libFilePath = path_1.default.resolve(libFolder, libInfo.name);
            // If not present locally, schedule it for download
            if (!fs_1.default.existsSync(libFilePath)) {
                let url = null;
                let fileSize = 0;
                // First, try checking a mirror
                const baseURL = nativesSuffix ? `${libInfo.path}/` : `${libInfo.path}/${libInfo.name}`;
                const mirrorResp = await dl.checkMirror(baseURL, Index_js_1.mirrors);
                if (mirrorResp?.status === 200) {
                    fileSize = mirrorResp.size;
                    totalSize += fileSize;
                    url = mirrorResp.url;
                }
                else if (lib.downloads?.artifact) {
                    url = lib.downloads.artifact.url;
                    fileSize = lib.downloads.artifact.size;
                    totalSize += fileSize;
                }
                if (!url) {
                    return { error: `Impossible to download ${libInfo.name}` };
                }
                downloadList.push({
                    url,
                    folder: libFolder,
                    path: libFilePath,
                    name: libInfo.name,
                    size: fileSize
                });
            }
            this.emit('check', checkCount++, libraries.length, 'libraries');
        }
        // Perform the downloads if any are needed
        if (downloadList.length > 0) {
            dl.on('progress', (DL, totDL) => {
                this.emit('progress', DL, totDL, 'libraries');
            });
            await dl.downloadFileMultiple(downloadList, totalSize, this.options.downloadFileMultiple);
        }
        return libraries;
    }
    /**
     * Applies any necessary patches to Forge using the `forgePatcher` class.
     * If the patcher determines it's already patched, it skips.
     *
     * @param profile The Forge profile containing processor information
     * @returns True if successful or if no patching was required
     */
    async patchForge(profile) {
        if (profile?.processors?.length) {
            const patcher = new patcher_js_1.default(this.options);
            // Forward patcher events
            patcher.on('patch', (data) => this.emit('patch', data));
            patcher.on('error', (data) => this.emit('error', data));
            // If the patch is not valid yet, run the patch process
            if (!patcher.check(profile)) {
                const config = {
                    java: this.options.loader.config.javaPath,
                    minecraft: this.options.loader.config.minecraftJar,
                    minecraftJson: this.options.loader.config.minecraftJson
                };
                await patcher.patcher(profile, config);
            }
        }
        return true;
    }
    /**
     * For older Forge versions, merges the vanilla Minecraft jar and Forge installer files
     * into a single jar. Writes a modified version.json reflecting the new Forge version.
     *
     * @param id The new version ID (e.g., "forge-1.12.2-14.23.5.2855")
     * @param pathInstaller Path to the Forge installer
     * @returns A modified version.json with an isOldForge property and a jarPath
     */
    async createProfile(id, pathInstaller) {
        // Gather all entries from the Forge installer and the vanilla JAR
        const forgeFiles = await (0, Index_js_1.getFileFromArchive)(pathInstaller);
        const vanillaJar = await (0, Index_js_1.getFileFromArchive)(this.options.loader.config.minecraftJar);
        // Combine them, excluding "META-INF" from the final jar
        const mergedZip = await (0, Index_js_1.createZIP)([...vanillaJar, ...forgeFiles], 'META-INF');
        // Write the new combined jar to versions/<id>/<id>.jar
        const destination = path_1.default.resolve(this.options.path, 'versions', id);
        if (!fs_1.default.existsSync(destination)) {
            fs_1.default.mkdirSync(destination, { recursive: true });
        }
        fs_1.default.writeFileSync(path_1.default.resolve(destination, `${id}.jar`), mergedZip, { mode: 0o777 });
        // Update the version JSON
        const profileData = JSON.parse(fs_1.default.readFileSync(this.options.loader.config.minecraftJson).toString());
        profileData.libraries = [];
        profileData.id = id;
        profileData.isOldForge = true;
        profileData.jarPath = path_1.default.resolve(destination, `${id}.jar`);
        return profileData;
    }
}
exports.default = ForgeMC;
//# sourceMappingURL=forge.js.map