// import

import {
    RsoEngine,
    CONFIG_ClientPlatform, CONFIG_ClientVersion, CONFIG_Ciphers, CONFIG_UserAgent,
    type RsoOptions, type RsoAuthType
} from "../client/Engine";

import toUft8 from "../utils/toUft8";

import { RsoAxios, type RsoAxiosResponse } from "../client/Axios";
import { HttpsCookieAgent, HttpCookieAgent } from "http-cookie-agent/http";
import type { AxiosRequestConfig } from "axios";

// interface

type RsoAuthResponse = {
    type: "response";
    response: {
        mode: string,
        parameters: {
            uri: string
        },
    };
    country: string;
} | {
    type: "multifactor";
    multifactor: {
        email: string,
        method: string,
        methods: Array<string>,
        multiFactorCodeLength: number,
        mfaVersion: string,
    };
    country: string;
    securityProfile: string;
}

// class

class RsoAuthClient extends RsoEngine {
    private options: { config: RsoOptions, data: RsoAuthType };
    private RsoAxios: RsoAxios;

    public constructor(options: { config: RsoOptions, data: RsoAuthType }) {
        super()
        this.build({ config: options.config, data: options.data });

        this.options = options;

        //axios

        const _AxiosConfig: AxiosRequestConfig = {
            headers: {
                Cookie: this.cookie.ssid,
                "User-Agent": CONFIG_UserAgent,
                "X-Riot-ClientVersion": this.config.client?.version || CONFIG_ClientVersion,
                "X-Riot-ClientPlatform": toUft8(JSON.stringify(this.config.client?.platform || CONFIG_ClientPlatform)),
            },
            httpsAgent: new HttpsCookieAgent({ cookies: { jar: this.cookie.jar }, keepAlive: true, ciphers: CONFIG_Ciphers.join(':'), honorCipherOrder: true, minVersion: 'TLSv1.2', maxVersion: 'TLSv1.3' }),
            httpAgent: new HttpCookieAgent({ cookies: { jar: this.cookie.jar }, keepAlive: true }),
        };

        this.RsoAxios = new RsoAxios(new Object({ ..._AxiosConfig, ...options.config.axiosConfig }));
    }

    // auth

    public async fromUrl(TokenUrl: string) {
        //TOKEN
        const Search_URL: URL = new URL(TokenUrl);
        let Search_path = Search_URL.search;
        let Search_token = 'access_token';
        if (!Search_path) {
            if (!Search_URL.hash) {
                this.isError = true

                return this.toJSON();
            } else {
                Search_path = Search_URL.hash;
                Search_token = `#${Search_token}`;
            }
        }

        this.access_token = String(new URLSearchParams(Search_path).get(Search_token));
        this.id_token = String(new URLSearchParams(Search_path).get('id_token'));
        this.expires_in = Number(new URLSearchParams(Search_path).get('expires_in')) || 3600;
        this.token_type = String(new URLSearchParams(Search_path).get('token_type')) || 'Bearer';
        this.session_state = String(new URLSearchParams(Search_path).get('session_state'));

        //ENTITLEMENTS
        const EntitlementsResponse: RsoAxiosResponse = await this.RsoAxios.post('https://entitlements.auth.riotgames.com/api/token/v1', {}, {
            headers: {
                'Authorization': `${this.token_type} ${this.access_token}`,
            },
        });

        this.entitlements_token = EntitlementsResponse.response.data.entitlements_token;

        //REGION
        const RegionResponse: RsoAxiosResponse = await this.RsoAxios.put('https://riot-geo.pas.si.riotgames.com/pas/v1/product/valorant', {
            id_token: this.id_token,
        }, {
            headers: {
                'Authorization': `${this.token_type} ${this.access_token}`,
                'X-Riot-Entitlements-JWT': this.entitlements_token,
            }
        });

        this.region.pbe = RegionResponse.response.data?.affinities?.pbe || 'na';
        this.region.live = RegionResponse.response.data?.affinities?.live || 'na';

        //output
        return this.toJSON();
    }

    public async fromResponse(TokenResponse: RsoAxiosResponse<RsoAuthResponse>) {
        if (TokenResponse.isError || !TokenResponse.response.data.type) {
            this.isError = true;

            return this.toJSON();
        }

        //COOKIE
        if (!TokenResponse.response.headers["set-cookie"]) {
            throw new Error(
                '<cookie> Cookie is undefined'
            );
        }

        const ssid_cookie = TokenResponse.response.headers["set-cookie"].find((element: string) => /^ssid/.test(element));
        
        if (!ssid_cookie) {
            throw new Error(
                '<asid> Cookie is undefined'
            );
        }

        this.cookie.ssid = ssid_cookie;

        //MFA
        if (TokenResponse.response.data.type && TokenResponse.response.data.type == 'multifactor') {
            this.multifactor = true;

            return this.toJSON();
        } else {
            this.multifactor = false;
        }

        //URL
        if (!TokenResponse.response.data.response || !TokenResponse.response.data.response?.parameters || !TokenResponse.response.data.response?.parameters?.uri) {
            this.isError = true;

            return this.toJSON();
        }

        //output
        return (await this.fromUrl(TokenResponse.response.data.response.parameters.uri));
        
    }
}

export {
    RsoAuthClient
};

export type {
    RsoAuthResponse
};