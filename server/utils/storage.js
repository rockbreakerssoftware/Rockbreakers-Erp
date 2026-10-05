const { Media } = require('../models');
const { httpError } = require('./crud');

/**
 * Image storage with two backends.
 *
 * Cloudinary is used when CLOUDINARY_URL is set, which keeps photos off the
 * 512 MB Atlas tier and serves them from a CDN instead of through our dyno.
 * Without it, images fall back to MongoDB so the app still runs with nothing
 * but a database — useful locally and on a first deploy.
 *
 * Uploads use Cloudinary's `authenticated` delivery type, so a photo is never
 * readable from a guessed URL. Selfies carry a face, a timestamp and a
 * location; they are evidence, and public delivery would make them readable
 * by anyone who ever saw a link. Access stays behind our own auth, and
 * /api/media/:id hands out a short-lived signed URL.
 */

let cloudinary = null;
if (process.env.CLOUDINARY_URL) {
  try {
    cloudinary = require('cloudinary').v2; // reads CLOUDINARY_URL itself
    cloudinary.config({ secure: true });
  } catch (e) {
    console.error('Cloudinary failed to initialise, falling back to MongoDB:', e.message);
    cloudinary = null;
  }
}

const usingCloudinary = () => !!cloudinary;

const FOLDER = {
  SELFIE: 'rockbreakers/selfies',
  CAPTURE: 'rockbreakers/captures',
  RECEIPT: 'rockbreakers/receipts',
  OTHER: 'rockbreakers/other',
};

/** How long a signed delivery URL stays valid. Long enough to load a gallery. */
const SIGNED_URL_TTL = 10 * 60;

function parseDataUrl(dataUrl, maxBytes) {
  if (!dataUrl) throw httpError(400, 'An image is required');
  const m = /^data:(image\/\w+);base64,(.+)$/.exec(dataUrl);
  if (!m) throw httpError(400, 'That image is not readable');
  const buffer = Buffer.from(m[2], 'base64');
  if (maxBytes && buffer.length > maxBytes) {
    throw httpError(413, 'That image is too large — please retake it');
  }
  return { contentType: m[1], buffer };
}

/**
 * Stores an image and returns its Media document.
 * Callers keep referencing media by _id, so neither backend changes the model.
 */
async function storeImage(dataUrl, { kind = 'OTHER', userId, maxBytes } = {}) {
  const { contentType, buffer } = parseDataUrl(dataUrl, maxBytes);

  if (cloudinary) {
    try {
      const uploaded = await new Promise((resolve, reject) => {
        cloudinary.uploader.upload_stream(
          {
            folder: FOLDER[kind] || FOLDER.OTHER,
            resource_type: 'image',
            type: 'authenticated',
            overwrite: false,
          },
          (err, result) => (err ? reject(err) : resolve(result)),
        ).end(buffer);
      });

      return Media.create({
        provider: 'cloudinary',
        publicId: uploaded.public_id,
        url: uploaded.secure_url,
        width: uploaded.width,
        height: uploaded.height,
        contentType,
        size: uploaded.bytes || buffer.length,
        kind,
        uploadedBy: userId,
      });
    } catch (e) {
      // A storage outage must not cost an engineer their proof of presence —
      // they are standing on a site and cannot retry later. Keep the bytes.
      console.error('Cloudinary upload failed, storing in MongoDB instead:', e.message);
    }
  }

  return Media.create({
    provider: 'mongo',
    data: buffer,
    contentType,
    size: buffer.length,
    kind,
    uploadedBy: userId,
  });
}

/**
 * Resolves a Media document for delivery.
 * Returns either a signed URL to redirect to, or the raw bytes to send.
 */
function resolveMedia(media) {
  if (media.provider === 'cloudinary' && media.publicId && cloudinary) {
    const url = cloudinary.url(media.publicId, {
      type: 'authenticated',
      sign_url: true,
      secure: true,
      expires_at: Math.floor(Date.now() / 1000) + SIGNED_URL_TTL,
    });
    return { redirect: url };
  }

  if (media.data) {
    // Not from a .lean() read: a lean query returns a BSON Binary rather than
    // a Buffer, and Express would JSON-serialise it instead of sending bytes.
    const buffer = Buffer.isBuffer(media.data)
      ? media.data
      : Buffer.from(media.data.buffer || media.data);
    return { buffer, contentType: media.contentType };
  }

  return null;
}

/** Removes the stored file. Only called when a Media row is genuinely dropped. */
async function deleteImage(media) {
  if (media?.provider === 'cloudinary' && media.publicId && cloudinary) {
    await cloudinary.uploader
      .destroy(media.publicId, { type: 'authenticated', resource_type: 'image' })
      .catch((e) => console.error('Cloudinary delete failed:', e.message));
  }
}

module.exports = { storeImage, resolveMedia, deleteImage, usingCloudinary, parseDataUrl };
