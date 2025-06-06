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
const prompt_1 = __importDefault(require("prompt"));
module.exports = async function (url) {
    console.log(`Open brosser ${url}`);
    prompt_1.default.start();
    let result = await prompt_1.default.get(['copy-URL']);
    return result['copy-URL'].split("code=")[1].split("&")[0];
};
//# sourceMappingURL=Terminal.js.map