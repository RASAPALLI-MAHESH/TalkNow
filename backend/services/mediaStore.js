const crypto = require('crypto');
const Media = require('../models/media');

// Image storage for avatars and hero backgrounds. Images live in their own MongoDB
// collection and are served from GET /api/media/:id. Swapping this module for S3 or R2
// later does not change the rest of the app, which only sees URLs.

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MEDIA_PATH_RE = /\/api\/media\/([a-f0-9]{32})$/;

class InvalidImageError extends Error {}

// Trust the bytes, not the declared type, so nothing but real images can be served.
const detectImageType = (buffer) => {
    if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
    if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
    if (buffer.length >= 6 && /^GIF8[79]a$/.test(buffer.subarray(0, 6).toString('ascii'))) return 'image/gif';
    if (buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
    return null;
};

const isImageDataUri = (value) => /^data:image\/[a-z0-9.+-]+;base64,/i.test(String(value ?? ''));

const publicBaseUrl = (req) =>
    String(process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');

const mediaUrl = (id, baseUrl) => `${baseUrl}/api/media/${id}`;

const mediaIdFromUrl = (value) => {
    const match = String(value ?? '').trim().match(MEDIA_PATH_RE);
    return match ? match[1] : null;
};

// Decodes and checks inline image data without storing anything.
const decodeImageDataUri = (dataUri) => {
    const base64 = String(dataUri).slice(String(dataUri).indexOf(',') + 1).replace(/\s/g, '');
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) throw new InvalidImageError('Invalid image data');

    const buffer = Buffer.from(base64, 'base64');
    if (buffer.length === 0) throw new InvalidImageError('Invalid image data');
    if (buffer.length > MAX_IMAGE_BYTES) throw new InvalidImageError('Image is too large (max 5 MB)');

    const contentType = detectImageType(buffer);
    if (!contentType) throw new InvalidImageError('Only PNG, JPEG, WebP or GIF images are allowed');
    return { buffer, contentType };
};

/**
 * Step 1 of saving an image field from a client: check it without storing anything.
 * Accepts '' (no image), inline image data, or a URL of an image this user already uploaded.
 * Anything else is rejected, so profiles never point at third-party hosts that could
 * track who views them.
 */
const prepareImageInput = async (value, { ownerId }) => {
    const raw = String(value ?? '').trim();
    if (!raw) return { kind: 'empty' };

    if (isImageDataUri(raw)) return { kind: 'new', ...decodeImageDataUri(raw) };

    const id = mediaIdFromUrl(raw);
    if (id && /^https?:\/\//i.test(raw) && (await Media.exists({ _id: id, ownerId }))) {
        return { kind: 'existing', id };
    }

    throw new InvalidImageError('Invalid image');
};

// Step 2: store new image data and return the URL to save on the profile.
const commitImageInput = async (prepared, { ownerId, baseUrl }) => {
    if (prepared.kind === 'empty') return '';
    if (prepared.kind === 'existing') return mediaUrl(prepared.id, baseUrl);

    const id = crypto.randomBytes(16).toString('hex');
    await Media.create({
        _id: id,
        ownerId,
        contentType: prepared.contentType,
        size: prepared.buffer.length,
        data: prepared.buffer,
    });
    return mediaUrl(id, baseUrl);
};

// Deletes an image the user no longer uses. Only touches media the user owns.
const deleteReplacedImage = async (oldUrl, newUrl, ownerId) => {
    const oldId = mediaIdFromUrl(oldUrl);
    if (!oldId || oldId === mediaIdFromUrl(newUrl)) return;
    await Media.deleteOne({ _id: oldId, ownerId });
};

const findMedia = (id) => {
    if (!/^[a-f0-9]{32}$/.test(String(id ?? ''))) return null;
    return Media.findById(id).select('contentType data').lean();
};

module.exports = {
    InvalidImageError,
    MAX_IMAGE_BYTES,
    publicBaseUrl,
    mediaUrl,
    isImageDataUri,
    decodeImageDataUri,
    prepareImageInput,
    commitImageInput,
    deleteReplacedImage,
    findMedia,
};
