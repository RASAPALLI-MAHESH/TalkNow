const express = require("express");
const { findMedia } = require("../services/mediaStore");

const router = express.Router();

// Public on purpose: image URLs carry a random 128-bit id and are shown on profiles,
// and React Native image components can't easily send auth headers.
router.get("/:id", async (req, res) => {
    try {
        const media = await findMedia(req.params.id);
        if (!media) return res.status(404).json({ message: "Not found" });

        res.set({
            'Content-Type': media.contentType,
            // Ids are never reused, so the image at a URL never changes.
            'Cache-Control': 'public, max-age=31536000, immutable',
            'Content-Disposition': 'inline',
            'Cross-Origin-Resource-Policy': 'cross-origin',
        });
        return res.send(Buffer.from(media.data.buffer ?? media.data));
    } catch (err) {
        console.error('Media fetch failed:', err);
        return res.status(500).json({ message: "Internal server error" });
    }
});

module.exports = router;
