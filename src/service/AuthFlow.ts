//import

import { CookieJar } from 'tough-cookie';
import { 
    HttpsCookieAgent, HttpCookieAgent, 
    CookieAgent,
} from 'http-cookie-agent/http';
import type http from 'node:http';
import type https from 'node:https';

import { RsoRequestClient, RsoAuthRequestResponse } from '../client/Axios';

import type { RsoAuthAuth, RsoAuthAuthExtend } from './Account';

//class

class AuthFlow {
    private cookie: CookieJar;
    private access_token: string;
    private id_token: string;
    private expires_in: number;
    private token_type: string;
    private entitlements_token: string;
    private region: {
        pbe: string,
        live: string,
    };
    public multifactor: boolean;
    public isError: boolean;

    private clientVersion: string;
    private clientPlatfrom: string;

    /**
     * Class Constructor
     * @param {RsoAuthAuth} data Account toJSON data
     * @param {String} clientVersion Client Version
     * @param {String} clientPlatfrom Client Platform
     */
    public constructor(data: RsoAuthAuth, clientVersion: string, clientPlatfrom: string) {
        this.cookie = CookieJar.fromJSON(JSON.stringify(data.cookie));
        this.access_token = data.access_token;
        this.id_token = data.id_token;
        this.expires_in = data.expires_in;
        this.token_type = data.token_type;
        this.entitlements_token = data.entitlements_token;
        this.region = data.region;
        this.multifactor = data.multifactor;
        this.isError = data.isError;

        this.clientVersion = clientVersion;
        this.clientPlatfrom = clientPlatfrom;
    }

    /**
     * @param {IValRequestClient} auth_response First Auth Response
     * @param {String} UserAgent User Agent
     * @param {ValRequestClient} RequestClient Request Client
     * @param {Boolean} lockRegion Lock Region
     * @returns {Promise<RsoAuthAuth>}
     */
    public async execute(auth_response: RsoAuthRequestResponse, UserAgent: string, RequestClient: RsoRequestClient, lockRegion: Boolean): Promise<RsoAuthAuth> {
        if (auth_response.isError) {
            this.isError = true;
            return this.toJSON();
        }

        //multifactor
        if (auth_response.data.type && auth_response.data.type == 'multifactor') {
            this.multifactor = true;

            return this.toJSON();
        } else {
            this.multifactor = false;
        }

        // get asscess token
        if (!auth_response.data.response || !auth_response.data.response.parameters || !auth_response.data.response.parameters.uri) {
            this.isError = true;

            return this.toJSON();
        }

        const Search_URL: URL = new URL(auth_response.data.response.parameters.uri);
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

        //ENTITLEMENTS
        const entitlements_response: RsoAuthRequestResponse<any> = await RequestClient.post('https://entitlements.auth.riotgames.com/api/token/v1', {}, {
            headers: {
                'Authorization': `${this.token_type} ${this.access_token}`,
                'User-Agent': String(UserAgent),
            },
        });

        this.entitlements_token = entitlements_response.data.entitlements_token;

        //REGION
        if (lockRegion === false) {
            let region_response: RsoAuthRequestResponse<any> = await RequestClient.put('https://riot-geo.pas.si.riotgames.com/pas/v1/product/valorant', {
                "id_token": this.id_token,
            }, {
                headers: {
                    'Authorization': `${this.token_type} ${this.access_token}`,
                    'X-Riot-Entitlements-JWT': this.entitlements_token,
                    'X-Riot-ClientVersion': this.clientVersion,
                    'X-Riot-ClientPlatform': this.clientPlatfrom,
                    'User-Agent': String(UserAgent),
                }
            });

            if (region_response.isError || !region_response.data.affinities?.pbe || !region_response.data.affinities?.live) {
                region_response = {
                    isError: true,
                    data: {
                        affinities: {
                            pbe: 'na',
                            live: 'na',
                        },
                    },
                };
            }

            this.region.pbe = region_response.data.affinities?.pbe || 'na';
            this.region.live = region_response.data.affinities?.live || 'na';
        }

        this.cookie = new CookieJar(RequestClient.theAxios.defaults.httpsAgent.jar?.store, {
            rejectPublicSuffixes: RequestClient.theAxios.defaults.httpsAgent.options?.jar?.rejectPublicSuffixes || undefined,
        });
        return this.toJSON();
    }

    /**
     * 
     * @returns {RsoAuthAuth}
     */
    public toJSON(): RsoAuthAuth {
        return {
            cookie: this.cookie.toJSON(),
            access_token: this.access_token,
            id_token: this.id_token,
            expires_in: this.expires_in,
            token_type: this.token_type,
            entitlements_token: this.entitlements_token,
            region: this.region,
            multifactor: this.multifactor,
            isError: this.isError,
        };
    }

    /**
     * @param {RsoAuthAuth} data Account toJSON data
     * @param {ValorantApiRequestResponse} auth_response First Auth Response
     * @param {RsoAuthAuthExtend} extendsData Extradata of auth
     * @returns {Promise<RsoAuthAuth>}
     */
    public static async execute(data: RsoAuthAuth, auth_response: RsoAuthRequestResponse, extendsData:RsoAuthAuthExtend): Promise<RsoAuthAuth> {
        const _newAuthFlow: AuthFlow = new AuthFlow(data, extendsData.client.version, extendsData.client.platform);

        try {
            return await _newAuthFlow.execute(auth_response, extendsData.UserAgent, extendsData.RequestClient, extendsData.lockRegion);
        } catch (error) {
            _newAuthFlow.isError = true;

            return _newAuthFlow.toJSON();
        }
    }

    public static getHttpAgent(cookie: { jar: CookieJar, ssid: string }): { http: CookieAgent<http.Agent>, https: CookieAgent<https.Agent> } {
        const ciphers: Array<string> = [
            'TLS_CHACHA20_POLY1305_SHA256',
            'TLS_AES_128_GCM_SHA256',
            'TLS_AES_256_GCM_SHA384',
            'TLS_ECDHE_ECDSA_WITH_CHACHA20_POLY1305_SHA256'
        ];

        return {
            https: new HttpsCookieAgent({ cookies: { jar: cookie.jar }, keepAlive: true, ciphers: ciphers.join(':'), honorCipherOrder: true, minVersion: 'TLSv1.2', maxVersion: 'TLSv1.3' }),
            http: new HttpCookieAgent({ cookies: { jar: cookie.jar }, keepAlive: true }),
        };
    }

    // /**
    //  * @param {RsoAuthAuth} data Account toJSON data
    //  * @param {String} url Url of First Auth Response
    //  * @param {RsoAuthAuthExtend} extendsData Extradata of auth
    //  * @returns {Promise<RsoAuthAuth>}
    //  */
    // public static async fromUrl(data: RsoAuthAuth, url: string, extendsData:RsoAuthAuthExtend): Promise<RsoAuthAuth> {
    //     const _newAuthFlow: AuthFlow = new AuthFlow(data, extendsData.clientVersion, extendsData.clientPlatform);

    //     if (!url.includes('https://playvalorant.com/opt_in')) {
    //         url = `https://playvalorant.com/opt_in${url}`;
    //     }

    //     const auth_response: ValorantApiRequestResponse<{ type: string, response: { parameters: { uri: string } } }> = {
    //         isError: false,
    //         data: {
    //             type: 'auth',
    //             response: {
    //                 parameters: {
    //                     uri: url,
    //                 },
    //             },
    //         },
    //     };

    //     try {
    //         return await _newAuthFlow.execute(auth_response, extendsData.UserAgent, extendsData.RequestClient, extendsData.lockRegion);
    //     } catch (error) {
    //         _newAuthFlow.isError = true;

    //         return _newAuthFlow.toJSON();
    //     }
    // }
}

//export
export { AuthFlow };