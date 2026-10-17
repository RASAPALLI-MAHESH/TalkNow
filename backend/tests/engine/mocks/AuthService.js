// The AuthService calls the engine makes, with the access token of whichever phone is running (AsyncLocalStorage).
const { AsyncLocalStorage } = require('node:async_hooks');
const axios = require('axios');

const phone = new AsyncLocalStorage();
const base = () => process.env.TEST_API_BASE; // e.g. http://127.0.0.1:18081/api
const client = axios.create({ timeout: 10000 });
client.interceptors.request.use((config) => {
    const ctx = phone.getStore();
    if (ctx?.token) config.headers.Authorization = `Bearer ${ctx.token}`;
    return config;
});

exports.runAs = (ctx, fn) => phone.run(ctx, fn);

exports.getOwnKeyStatus = async () => {
    try {
        return (await client.get(`${base()}/keys/me`)).data;
    } catch (error) {
        if (error.response?.status === 404) return null;
        throw error;
    }
};
exports.uploadKeys = async (bundle) => (await client.put(`${base()}/keys`, bundle)).data;
exports.addOneTimePreKeys = async (registrationId, oneTimePreKeys) =>
    (await client.post(`${base()}/keys/prekeys`, { registrationId, oneTimePreKeys })).data;
exports.rotateSignedPreKey = async (registrationId, signedPreKey) => {
    await client.put(`${base()}/keys/signed-prekey`, { registrationId, signedPreKey });
};
exports.getPreKeyBundle = async (userId) => (await client.get(`${base()}/keys/${userId}`)).data;
exports.getPendingMessages = async (limit = 100) => (await client.get(`${base()}/auth/messages/pending`, { params: { limit } })).data;
exports.acknowledgeMessages = async (ids, resetIds = []) => {
    await client.post(`${base()}/auth/messages/ack`, { ids, resetIds });
};
exports.getConversationMessages = async (peerId, before) =>
    (await client.get(`${base()}/auth/messages/with/${peerId}`, { params: before ? { before } : undefined })).data;
