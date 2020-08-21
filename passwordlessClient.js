﻿/**
 * A client for the https://passwordless.dev API that allows webdevelopers to add WebAuthn with minimal coding.
 *
 * @export
 * @class PasswordlessClient
 */
export class PasswordlessClient {
    config = {
        apiUrl: "https://api.passwordless.dev",
        apiKey: "",
        Origin: location.origin,
        RPID: location.hostname
    }
    constructor(config) {
        this.config = { ...this.config, ...config }
    }

    /**
     * Register a new credential to a user
     *
     * @param {*} token Token generated by your backend and the passwordless api.
     * @memberof PasswordlessClient
     */
    async register(token) {

        let options;
        let session;

        try {
            var { data, sessionId } = await this.registerBegin(token);
            options = data;
            session = sessionId;

        } catch (e) {
            console.error("Failed during register/begin");
            throw e;
        }

        // Turn the challenge back into the accepted format of padded base64
        options.challenge = coerceToArrayBuffer(options.challenge);
        // Turn ID into a UInt8Array Buffer for some reason
        options.user.id = coerceToArrayBuffer(options.user.id);

        options.excludeCredentials = options.excludeCredentials.map((c) => {
            c.id = coerceToArrayBuffer(c.id);
            return c;
        });

        if (options.authenticatorSelection.authenticatorAttachment === null) options.authenticatorSelection.authenticatorAttachment = undefined;

        let newCredential;
        try {
            newCredential = await navigator.credentials.create({
                publicKey: options
            });
        } catch (e) {
            // todo friendlier and more helpful error detection
            var msg = "Failed during credentials.create in browser. One reason could be because the username is already registered with your authenticator. Please change username or authenticator."
            console.warn(msg, e);
            throw e;
        }

        try {
            await this.registerComplete(newCredential, session);
        } catch (e) {
            console.warn("Failed during register/complete", e);
        }
    }

    /**
     * Internal function
     */
    async registerBegin(token) {
        const response = await fetch(this.config.apiUrl + 'register/begin', {
            method: 'POST',
            body: JSON.stringify({
                token: token,
                ...this._params()
            }),
            headers: {
                'Accept': 'application/json',
                "Content-Type": "application/json"
            }
        });

        let data = await response.json();

        return data;
    }

    /**
     * Internal function
     */
    async registerComplete(newCredential, sessionId) {
        
        // Move data into Arrays incase it is super long
        let attestationObject = new Uint8Array(newCredential.response.attestationObject);
        let clientDataJSON = new Uint8Array(newCredential.response.clientDataJSON);
        let rawId = new Uint8Array(newCredential.rawId);

        const data = {
            id: newCredential.id,
            rawId: coerceToBase64Url(rawId),
            type: newCredential.type,
            extensions: newCredential.getClientExtensionResults(),
            response: {
                AttestationObject: coerceToBase64Url(attestationObject),
                clientDataJson: coerceToBase64Url(clientDataJSON)
            }
        };

        const response = await fetch(this.config.apiUrl + 'register/complete', {
            method: 'POST',
            body: JSON.stringify({
                response: data,
                sessionId, sessionId,
                ...this._params()
            }),
            headers: {
                'Accept': 'application/json',
                "Content-Type": "application/json"
            }
        });

        return await response.json();
    }

    /**
     * Sign in a user
     *
     * @param {*} username
     * @returns
     * @memberof PasswordlessClient
     */
    async signin(username) {

        var options, sessionId;
        try {
            ({ data: options, sessionId } = await this.signinBegin(username));
        } catch (e) {
            console.warn("Failed during signin/begin", e);
            throw e;
        }

        options.challenge = coerceToArrayBuffer(options.challenge); //const challenge = makeAssertionOptions.challenge.replace(/-/g, "+").replace(/_/g, "/");

        options.allowCredentials.forEach(function (listItem) {
            listItem.id = coerceToArrayBuffer(listItem.id);
        });

        let credential;
        try {
            credential = await navigator.credentials.get({ publicKey: options })
        } catch (e) {
            console.warn("Failed during credentials.get in browser.", e);
            throw e;
        }

        try {
            let response = await this.signinComplete(credential, sessionId);
            return response.data;
        } catch (e) {
            console.warn("Failed during signin/complete", e);
            throw e;
        }

    }

    /**
     * Internal function
     */
    async signinBegin(username) {
        var res = await fetch(this.config.apiUrl + "signin/begin", {
            method: 'POST',
            body: JSON.stringify({
                username: username,
                ...this._params(),
            }),
            headers: {
                'Accept': 'application/json'
            }
        });

        return await res.json();
    }

    /**
     * Internal function
     */
    async signinComplete(credential, sessionId) {

        // Move data into Arrays incase it is super long
        let authData = new Uint8Array(credential.response.authenticatorData);
        let clientDataJSON = new Uint8Array(credential.response.clientDataJSON);
        let rawId = new Uint8Array(credential.rawId);
        let sig = new Uint8Array(credential.response.signature);
        
        const data = {
            id: credential.id,
            rawId: coerceToBase64Url(rawId),
            type: credential.type,
            extensions: credential.getClientExtensionResults(),
            response: {
                authenticatorData: coerceToBase64Url(authData),
                clientDataJson: coerceToBase64Url(clientDataJSON),
                signature: coerceToBase64Url(sig)
            }
        };

        var res = await fetch(this.config.apiUrl + "signin/complete", {
            method: 'POST',
            body: JSON.stringify({
                response: data,
                sessionId: sessionId,
                ...this._params(),
            }),
            headers: {
                'Accept': 'application/json'
            }
        });

        return await res.json();
    }

    /**
     * Internal function
     */
    _params() {
        return {
            RPID: this.config.RPID,
            Origin: this.config.Origin,
            ApiKey: this.config.apiKey
        }
    }    
}

coerceToArrayBuffer = function (thing) {
    if (typeof thing === "string") {
        // base64url to base64
        thing = thing.replace(/-/g, "+").replace(/_/g, "/");

        // base64 to Uint8Array
        var str = window.atob(thing);
        var bytes = new Uint8Array(str.length);
        for (var i = 0; i < str.length; i++) {
            bytes[i] = str.charCodeAt(i);
        }
        thing = bytes;
    }

    // Array to Uint8Array
    if (Array.isArray(thing)) {
        thing = new Uint8Array(thing);
    }

    // Uint8Array to ArrayBuffer
    if (thing instanceof Uint8Array) {
        thing = thing.buffer;
    }

    // error if none of the above worked
    if (!(thing instanceof ArrayBuffer)) {
        throw new TypeError("could not coerce to ArrayBuffer");
    }

    return thing;
};


coerceToBase64Url = function (thing) {
    // Array or ArrayBuffer to Uint8Array
    if (Array.isArray(thing)) {
        thing = Uint8Array.from(thing);
    }

    if (thing instanceof ArrayBuffer) {
        thing = new Uint8Array(thing);
    }

    // Uint8Array to base64
    if (thing instanceof Uint8Array) {
        var str = "";
        var len = thing.byteLength;

        for (var i = 0; i < len; i++) {
            str += String.fromCharCode(thing[i]);
        }
        thing = window.btoa(str);
    }

    if (typeof thing !== "string") {
        throw new Error("could not coerce to string");
    }

    // base64 to base64url
    // NOTE: "=" at the end of challenge is optional, strip it off here
    thing = thing.replace(/\+/g, "-").replace(/\//g, "_").replace(/=*$/g, "");

    return thing;
};

window.GlobalPasswordlessClient = PasswordlessClient;
export default PasswordlessClient;