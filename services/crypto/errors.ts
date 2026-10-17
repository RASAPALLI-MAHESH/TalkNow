export type E2EEErrorCode =
    | 'invalid_bundle'
    | 'invalid_message'
    | 'no_session'
    | 'decrypt_failed'
    | 'unknown_signed_prekey'
    | 'unknown_one_time_prekey'
    | 'too_many_skipped'
    | 'duplicate_message'
    | 'not_ready';

export class E2EEError extends Error {
    readonly code: E2EEErrorCode;

    constructor(code: E2EEErrorCode, message?: string) {
        super(message || code);
        this.name = 'E2EEError';
        this.code = code;
    }
}

export const isE2EEError = (err: unknown, code?: E2EEErrorCode): err is E2EEError =>
    err instanceof E2EEError && (!code || err.code === code);
