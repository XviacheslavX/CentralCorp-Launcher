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
exports.login = login;
exports.refresh = refresh;
exports.validate = validate;
exports.signout = signout;
exports.ChangeAuthApi = ChangeAuthApi;
const crypto_1 = __importDefault(require("crypto"));
let api_url = 'https://authserver.mojang.com';
async function login(username, password) {
    let UUID = crypto_1.default.randomBytes(16).toString('hex');
    if (!password) {
        return {
            access_token: UUID,
            client_token: UUID,
            uuid: UUID,
            name: username,
            user_properties: '{}',
            meta: {
                online: false,
                type: 'Mojang'
            }
        };
    }
    let message = await fetch(`${api_url}/authenticate`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            agent: {
                name: "Minecraft",
                version: 1
            },
            username,
            password,
            clientToken: UUID,
            requestUser: true
        })
    }).then(res => res.json());
    if (message.error) {
        return message;
    }
    ;
    let user = {
        access_token: message.accessToken,
        client_token: message.clientToken,
        uuid: message.selectedProfile.id,
        name: message.selectedProfile.name,
        user_properties: '{}',
        meta: {
            online: true,
            type: 'Mojang'
        }
    };
    return user;
}
async function refresh(acc) {
    let message = await fetch(`${api_url}/refresh`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            accessToken: acc.access_token,
            clientToken: acc.client_token,
            requestUser: true
        })
    }).then(res => res.json());
    if (message.error) {
        return message;
    }
    ;
    let user = {
        access_token: message.accessToken,
        client_token: message.clientToken,
        uuid: message.selectedProfile.id,
        name: message.selectedProfile.name,
        user_properties: '{}',
        meta: {
            online: true,
            type: 'Mojang'
        }
    };
    return user;
}
async function validate(acc) {
    let message = await fetch(`${api_url}/validate`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            accessToken: acc.access_token,
            clientToken: acc.client_token,
        })
    });
    if (message.status == 204) {
        return true;
    }
    else {
        return false;
    }
}
async function signout(acc) {
    let message = await fetch(`${api_url}/invalidate`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            accessToken: acc.access_token,
            clientToken: acc.client_token,
        })
    }).then(res => res.text());
    if (message == "") {
        return true;
    }
    else {
        return false;
    }
}
function ChangeAuthApi(url) {
    api_url = url;
}
//# sourceMappingURL=Mojang.js.map