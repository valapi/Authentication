"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RsoAuthMultifactor = void 0;
const Engine_1 = require("../client/Engine");
const Auth_1 = require("../client/Auth");
const toUft8_1 = __importDefault(require("../utils/toUft8"));
const tough_cookie_1 = require("tough-cookie");
const http_1 = require("http-cookie-agent/http");
const Axios_1 = require("../client/Axios");
class RsoAuthMultifactor {
    constructor(options) {
        var _a, _b;
        this.options = options;
        this.cookie = tough_cookie_1.CookieJar.fromJSON(JSON.stringify(options.data.cookie.jar));
        const _AxiosConfig = {
            headers: {
                Cookie: this.options.data.cookie.ssid,
                "X-Riot-ClientVersion": ((_a = this.options.config.client) === null || _a === void 0 ? void 0 : _a.version) || Engine_1.CONFIG_ClientVersion,
                "X-Riot-ClientPlatform": (0, toUft8_1.default)(JSON.stringify(((_b = this.options.config.client) === null || _b === void 0 ? void 0 : _b.platform) || Engine_1.CONFIG_ClientPlatform)),
            },
            httpsAgent: new http_1.HttpsCookieAgent({ cookies: { jar: this.cookie }, keepAlive: true, ciphers: Engine_1.CONFIG_Ciphers.join(':'), honorCipherOrder: true, minVersion: 'TLSv1.2', maxVersion: 'TLSv1.3' }),
            httpAgent: new http_1.HttpCookieAgent({ cookies: { jar: this.cookie }, keepAlive: true }),
        };
        this.RsoAxios = new Axios_1.RsoAxios(new Object(Object.assign(Object.assign({}, _AxiosConfig), options.config.axiosConfig)));
    }
    //auth
    TwoFactor(verificationCode) {
        return __awaiter(this, void 0, void 0, function* () {
            //token
            const TokenResponse = yield this.RsoAxios.put('https://auth.riotgames.com/api/v1/authorization', {
                "type": "multifactor",
                "code": String(verificationCode),
                "rememberDevice": true,
            });
            if (TokenResponse.isError === false) {
                this.options.data.multifactor = false;
            }
            else {
                this.options.data.isError = true;
            }
            //auth
            this.options.data.cookie.jar = this.cookie.toJSON();
            return yield (new Auth_1.RsoAuthClient(this.options)).fromResponse(TokenResponse);
        });
    }
}
exports.RsoAuthMultifactor = RsoAuthMultifactor;
//# sourceMappingURL=Multifactor.js.map