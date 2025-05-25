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
const child_process_1 = require("child_process");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const events_1 = require("events");
const Index_js_1 = require("../utils/Index.js");
class ForgePatcher extends events_1.EventEmitter {
    constructor(options) {
        super();
        this.options = options;
    }
    async patcher(profile, config, neoForgeOld = true) {
        const { processors } = profile;
        for (const [_, processor] of Object.entries(processors)) {
            if (processor.sides && !processor.sides.includes('client'))
                continue;
            const jarInfo = (0, Index_js_1.getPathLibraries)(processor.jar);
            const jarPath = path_1.default.resolve(this.options.path, 'libraries', jarInfo.path, jarInfo.name);
            const args = processor.args
                .map(arg => this.setArgument(arg, profile, config, neoForgeOld))
                .map(arg => this.computePath(arg));
            const classPaths = processor.classpath.map(cp => {
                const cpInfo = (0, Index_js_1.getPathLibraries)(cp);
                return `"${path_1.default.join(this.options.path, 'libraries', cpInfo.path, cpInfo.name)}"`;
            });
            const mainClass = await this.readJarManifest(jarPath);
            if (!mainClass) {
                this.emit('error', `Impossible de déterminer la classe principale dans le JAR: ${jarPath}`);
                continue;
            }
            await new Promise((resolve) => {
                const spawned = (0, child_process_1.spawn)(`"${path_1.default.resolve(config.java)}"`, [
                    '-classpath',
                    [`"${jarPath}"`, ...classPaths].join(path_1.default.delimiter),
                    mainClass,
                    ...args
                ], { shell: true });
                spawned.stdout.on('data', data => {
                    this.emit('patch', data.toString('utf-8'));
                });
                spawned.stderr.on('data', data => {
                    this.emit('patch', data.toString('utf-8'));
                });
                spawned.on('close', code => {
                    if (code !== 0) {
                        this.emit('error', `Le patcher Forge s'est terminé avec le code ${code}`);
                    }
                    resolve();
                });
            });
        }
    }
    check(profile) {
        const { processors } = profile;
        let files = [];
        for (const processor of Object.values(processors)) {
            if (processor.sides && !processor.sides.includes('client'))
                continue;
            processor.args.forEach(arg => {
                const finalArg = arg.replace('{', '').replace('}', '');
                if (profile.data[finalArg]) {
                    if (finalArg === 'BINPATCH')
                        return;
                    files.push(profile.data[finalArg].client);
                }
            });
        }
        files = Array.from(new Set(files));
        for (const file of files) {
            const lib = (0, Index_js_1.getPathLibraries)(file.replace('[', '').replace(']', ''));
            const filePath = path_1.default.resolve(this.options.path, 'libraries', lib.path, lib.name);
            if (!fs_1.default.existsSync(filePath))
                return false;
        }
        return true;
    }
    setArgument(arg, profile, config, neoForgeOld) {
        const finalArg = arg.replace('{', '').replace('}', '');
        const universalLib = profile.libraries.find(lib => {
            if (this.options.loader.type === 'forge')
                return lib.name.startsWith('net.minecraftforge:forge');
            else
                return lib.name.startsWith(neoForgeOld ? 'net.neoforged:forge' : 'net.neoforged:neoforge');
        });
        if (profile.data[finalArg]) {
            if (finalArg === 'BINPATCH') {
                const jarInfo = (0, Index_js_1.getPathLibraries)(profile.path || (universalLib?.name ?? ''));
                return `"${path_1.default.join(this.options.path, 'libraries', jarInfo.path, jarInfo.name).replace('.jar', '-clientdata.lzma')}"`;
            }
            return profile.data[finalArg].client;
        }
        return arg
            .replace('{SIDE}', 'client')
            .replace('{ROOT}', `"${path_1.default.dirname(path_1.default.resolve(this.options.path, 'forge'))}"`)
            .replace('{MINECRAFT_JAR}', `"${config.minecraft}"`)
            .replace('{MINECRAFT_VERSION}', `"${config.minecraftJson}"`)
            .replace('{INSTALLER}', `"${path_1.default.join(this.options.path, 'libraries')}"`)
            .replace('{LIBRARY_DIR}', `"${path_1.default.join(this.options.path, 'libraries')}"`);
    }
    computePath(arg) {
        if (arg.startsWith('[')) {
            const libInfo = (0, Index_js_1.getPathLibraries)(arg.replace('[', '').replace(']', ''));
            return `"${path_1.default.join(this.options.path, 'libraries', libInfo.path, libInfo.name)}"`;
        }
        return arg;
    }
    async readJarManifest(jarPath) {
        const manifestContent = await (0, Index_js_1.getFileFromArchive)(jarPath, 'META-INF/MANIFEST.MF');
        if (!manifestContent)
            return null;
        const content = manifestContent.toString();
        const mainClassLine = content.split('Main-Class: ')[1];
        if (!mainClassLine)
            return null;
        return mainClassLine.split('\r\n')[0];
    }
}
exports.default = ForgePatcher;
//# sourceMappingURL=patcher.js.map