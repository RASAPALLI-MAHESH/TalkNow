/*
  X3DH key agreement, as specified at https://signal.org/docs/specifications/x3dh/
  (curve X25519, hash SHA-256, info "TalkNow-X3DH-v1").
*/
import { concatBytes } from './encoding';
import { IdentityKeys, PreKeyBundle, PublicIdentity, identityBytes, publicIdentityOf } from './identity';
import { KeyPair, dh, generateDhKeyPair, hkdfSha256 } from './primitives';

const X3DH_INFO = 'TalkNow-X3DH-v1';
const F = new Uint8Array(32).fill(0xff);
const ZERO_SALT = new Uint8Array(32);

const kdf = (dhOutputs: Uint8Array[]) => hkdfSha256(concatBytes(F, ...dhOutputs), ZERO_SALT, X3DH_INFO, 32);

// AD = Encode(IK_A) || Encode(IK_B), initiator first.
const associatedData = (initiator: PublicIdentity, responder: PublicIdentity) =>
    concatBytes(identityBytes(initiator), identityBytes(responder));

export type X3DHInitiation = {
    sharedKey: Uint8Array;
    associatedData: Uint8Array;
    baseKey: Uint8Array; // our ephemeral public key, sent in the first message
    signedPreKeyId: number;
    oneTimePreKeyId: number | null;
};

/** Alice's side. The bundle must already be verified (parsePreKeyBundle). */
export const initiateX3DH = (local: IdentityKeys, bundle: PreKeyBundle, ephemeral: KeyPair = generateDhKeyPair()): X3DHInitiation => {
    const spk = bundle.signedPreKey.publicKey;
    const outputs = [
        dh(local.dh.privateKey, spk),
        dh(ephemeral.privateKey, bundle.identity.dhKey),
        dh(ephemeral.privateKey, spk),
    ];
    if (bundle.oneTimePreKey) outputs.push(dh(ephemeral.privateKey, bundle.oneTimePreKey.publicKey));

    return {
        sharedKey: kdf(outputs),
        associatedData: associatedData(publicIdentityOf(local), bundle.identity),
        baseKey: ephemeral.publicKey,
        signedPreKeyId: bundle.signedPreKey.keyId,
        oneTimePreKeyId: bundle.oneTimePreKey ? bundle.oneTimePreKey.keyId : null,
    };
};

/** Bob's side, from the header of Alice's first message. */
export const respondX3DH = (
    local: IdentityKeys,
    signedPreKey: KeyPair,
    oneTimePreKey: KeyPair | null,
    remoteIdentity: PublicIdentity,
    baseKey: Uint8Array
): { sharedKey: Uint8Array; associatedData: Uint8Array } => {
    const outputs = [
        dh(signedPreKey.privateKey, remoteIdentity.dhKey),
        dh(local.dh.privateKey, baseKey),
        dh(signedPreKey.privateKey, baseKey),
    ];
    if (oneTimePreKey) outputs.push(dh(oneTimePreKey.privateKey, baseKey));

    return {
        sharedKey: kdf(outputs),
        associatedData: associatedData(remoteIdentity, publicIdentityOf(local)),
    };
};
