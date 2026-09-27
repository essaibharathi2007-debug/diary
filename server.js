require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const path = require("path");
const crypto = require("crypto");
const cloudinary = require("cloudinary").v2;

const app = express();

const PORT = process.env.PORT || 3000;

// ======================================================
// CLOUDINARY
// ======================================================

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true
});

// ======================================================
// MIDDLEWARE
// ======================================================

app.use(
    express.json({
        limit: "25mb"
    })
);

app.use(
    express.urlencoded({
        extended: true
    })
);

// ======================================================
// CORS
// ======================================================

app.use((req, res, next) => {

    const origin = req.headers.origin;

    if (origin) {
        res.header(
            "Access-Control-Allow-Origin",
            origin
        );
    } else {
        res.header(
            "Access-Control-Allow-Origin",
            "*"
        );
    }

    res.header(
        "Access-Control-Allow-Headers",
        "Origin, X-Requested-With, Content-Type, Accept, Authorization"
    );

    res.header(
        "Access-Control-Allow-Methods",
        "GET, POST, PUT, DELETE, OPTIONS"
    );

    if (req.method === "OPTIONS") {
        return res.sendStatus(204);
    }

    next();
});

// ======================================================
// TWA / DIGITAL ASSET LINKS
// ======================================================

app.get(
    "/.well-known/assetlinks.json",
    (req, res) => {

        res.sendFile(
            path.join(
                __dirname,
                "assetlinks.json"
            )
        );

    }
);

// ======================================================
// STATIC FRONTEND
// ======================================================

app.use(
    express.static(
        path.join(
            __dirname,
            "public"
        )
    )
);

// ======================================================
// USER MODEL
// ======================================================

const User = mongoose.model(
    "User",

    new mongoose.Schema(
        {
            email: {
                type: String,
                unique: true,
                required: true,
                lowercase: true,
                trim: true
            },

            password: {
                type: String,
                required: true
            },

            name: {
                type: String,
                default: ""
            },

            age: {
                type: String,
                default: ""
            },

            phone: {
                type: String,
                default: ""
            },

            bio: {
                type: String,
                default: ""
            },

            avatar: {
                type: String,
                default: ""
            },

            wakePhrase: {
                type: String,
                default: "hi cool"
            }
        },

        {
            timestamps: true
        }
    )
);

// ======================================================
// ENTRY MODEL
// ======================================================

const Entry = mongoose.model(
    "Entry",

    new mongoose.Schema(
        {
            user: {
                type: mongoose.Schema.Types.ObjectId,
                required: true,
                index: true
            },

            type: {
                type: String,
                enum: [
                    "diary",
                    "message",
                    "activity"
                ],
                default: "diary"
            },

            title: {
                type: String,
                default: ""
            },

            text: {
                type: String,
                default: ""
            },

            mood: {
                type: String,
                default: ""
            },

            tags: {
                type: [String],
                default: []
            },

            photos: {
                type: [String],
                default: []
            },

            pinned: {
                type: Boolean,
                default: false
            }
        },

        {
            timestamps: true
        }
    )
);

// ======================================================
// MEMORY ENCRYPTION
// ======================================================

const DIARY_ENCRYPTION_SECRET =
    process.env.DIARY_ENCRYPTION_KEY ||
    process.env.JWT_SECRET;

function diaryKey() {

    return crypto
        .createHash("sha256")
        .update(
            String(
                DIARY_ENCRYPTION_SECRET || ""
            )
        )
        .digest();

}

// ======================================================
// DIARY TEXT ENCRYPTION
// ======================================================

function encryptDiaryText(value) {

    const text =
        String(
            value ?? ""
        );

    if (!text) {
        return text;
    }

    const iv =
        crypto.randomBytes(12);

    const cipher =
        crypto.createCipheriv(
            "aes-256-gcm",
            diaryKey(),
            iv
        );

    const encrypted =
        Buffer.concat([
            cipher.update(
                text,
                "utf8"
            ),
            cipher.final()
        ]);

    const tag =
        cipher.getAuthTag();

    return [
        "CD1",
        iv.toString("base64url"),
        tag.toString("base64url"),
        encrypted.toString("base64url")
    ].join(".");
}

// ======================================================
// DIARY TEXT DECRYPTION
// ======================================================

function decryptDiaryText(value) {

    const text =
        String(
            value ?? ""
        );

    // Old entries remain compatible.
    if (!text.startsWith("CD1.")) {
        return text;
    }

    try {

        const parts =
            text.split(".");

        if (parts.length !== 4) {
            return text;
        }

        const iv =
            Buffer.from(
                parts[1],
                "base64url"
            );

        const tag =
            Buffer.from(
                parts[2],
                "base64url"
            );

        const encrypted =
            Buffer.from(
                parts[3],
                "base64url"
            );

        const decipher =
            crypto.createDecipheriv(
                "aes-256-gcm",
                diaryKey(),
                iv
            );

        decipher.setAuthTag(tag);

        return Buffer.concat([
            decipher.update(
                encrypted
            ),
            decipher.final()
        ]).toString("utf8");

    } catch (error) {

        console.error(
            "DIARY DECRYPT ERROR:",
            error.message
        );

        return "[Encrypted memory could not be opened]";
    }
}

// ======================================================
// ENTRY DECRYPT
// ======================================================

function decryptEntry(entry) {

    const obj =
        entry.toObject
            ? entry.toObject()
            : {
                ...entry
            };

    obj.text =
        decryptDiaryText(
            obj.text
        );

    return obj;
}

// ======================================================
// WAKE PHRASE ENCRYPTION
// ======================================================
// Example:
//
// User types:
// hi cool
//
// MongoDB stores:
// CD1.xxxxx.xxxxx.xxxxx
//
// Frontend receives:
// hi cool
//
// So voice recognition continues to work.
// ======================================================

function encryptWakePhrase(value) {

    const text =
        String(
            value ?? ""
        ).trim();

    if (!text) {
        return text;
    }

    // Prevent double encryption.
    if (
        text.startsWith("CD1.")
    ) {
        return text;
    }

    const iv =
        crypto.randomBytes(12);

    const cipher =
        crypto.createCipheriv(
            "aes-256-gcm",
            diaryKey(),
            iv
        );

    const encrypted =
        Buffer.concat([
            cipher.update(
                text,
                "utf8"
            ),
            cipher.final()
        ]);

    const tag =
        cipher.getAuthTag();

    return [
        "CD1",
        iv.toString("base64url"),
        tag.toString("base64url"),
        encrypted.toString("base64url")
    ].join(".");
}

// ======================================================
// WAKE PHRASE DECRYPTION
// ======================================================

function decryptWakePhrase(value) {

    const text =
        String(
            value ?? ""
        );

    // Existing users may still have plain text.
    if (
        !text.startsWith("CD1.")
    ) {
        return text;
    }

    try {

        const parts =
            text.split(".");

        if (parts.length !== 4) {
            return text;
        }

        const iv =
            Buffer.from(
                parts[1],
                "base64url"
            );

        const tag =
            Buffer.from(
                parts[2],
                "base64url"
            );

        const encrypted =
            Buffer.from(
                parts[3],
                "base64url"
            );

        const decipher =
            crypto.createDecipheriv(
                "aes-256-gcm",
                diaryKey(),
                iv
            );

        decipher.setAuthTag(
            tag
        );

        return Buffer.concat([
            decipher.update(
                encrypted
            ),
            decipher.final()
        ]).toString("utf8");

    } catch (error) {

        console.error(
            "WAKE PHRASE DECRYPT ERROR:",
            error.message
        );

        return "";
    }
}

// ======================================================
// SAFE USER
// ======================================================

function safe(user) {

    const obj =
        user.toObject();

    delete obj.password;

    return obj;
}

// ======================================================
// SAFE USER + DECRYPTED WAKE PHRASE
// ======================================================

function safeWithDecryptedWakePhrase(user) {

    const obj =
        safe(user);

    obj.wakePhrase =
        decryptWakePhrase(
            user.wakePhrase
        );

    return obj;
}

// ======================================================
// HELPERS
// ======================================================

function sign(user) {

    return jwt.sign(
        {
            id:
                user._id.toString()
        },

        process.env.JWT_SECRET,

        {
            expiresIn:
                "30d"
        }
    );

}

function pick(
    obj,
    keys
) {

    return Object.fromEntries(

        keys
            .filter(
                key =>
                    Object.prototype.hasOwnProperty.call(
                        obj,
                        key
                    )
            )
            .map(
                key => [
                    key,
                    obj[key]
                ]
            )
    );
}

// ======================================================
// AUTH MIDDLEWARE
// ======================================================

function auth(
    req,
    res,
    next
) {

    try {

        const header =
            req.headers.authorization ||
            "";

        if (
            !header.startsWith(
                "Bearer "
            )
        ) {

            return res.status(401).json({
                error:
                    "Login pannunga"
            });
        }

        const token =
            header
                .substring(7)
                .trim();

        if (!token) {

            return res.status(401).json({
                error:
                    "Login token missing"
            });
        }

        const decoded =
            jwt.verify(
                token,
                process.env.JWT_SECRET
            );

        req.uid =
            decoded.id;

        next();

    } catch (error) {

        console.error(
            "AUTH ERROR:",
            error.message
        );

        return res.status(401).json({
            error:
                "Login session expired. Login pannunga"
        });
    }
}

// ======================================================
// ERROR WRAPPER
// ======================================================

function wrap(fn) {

    return async (
        req,
        res
    ) => {

        try {

            await fn(
                req,
                res
            );

        } catch (error) {

            console.error(
                "API ERROR:",
                error
            );

            if (
                error.code === 11000
            ) {

                return res.status(400).json({
                    error:
                        "Email already irukku"
                });
            }

            return res.status(500).json({
                error:
                    error.message ||
                    "Server error"
            });
        }
    };
}

// ======================================================
// CLOUDINARY DELETE
// ======================================================

function getPublicId(url) {

    const match =
        /\/upload\/(?:v\d+\/)?(.+?)\.[a-z0-9]+$/i.exec(
            url || ""
        );

    return match
        ? match[1]
        : null;
}

async function destroyImages(urls) {

    if (
        !Array.isArray(urls)
    ) {
        return;
    }

    await Promise.all(

        urls
            .map(
                getPublicId
            )
            .filter(Boolean)
            .map(
                id =>
                    cloudinary
                        .uploader
                        .destroy(id)
                        .catch(
                            () => null
                        )
            )
    );
}

// ======================================================
// API TEST
// ======================================================

app.get(
    "/api/test",

    (
        req,
        res
    ) => {

        res.json({

            success:
                true,

            message:
                "Cool Diary API working",

            time:
                new Date().toISOString()

        });
    }
);

// ======================================================
// REGISTER
// ======================================================

app.post(
    "/api/register",

    wrap(
        async (
            req,
            res
        ) => {

            const email =
                String(
                    req.body.email ||
                    ""
                )
                    .trim()
                    .toLowerCase();

            const password =
                String(
                    req.body.password ||
                    ""
                );

            const name =
                String(
                    req.body.name ||
                    ""
                ).trim();

            if (!name) {

                return res.status(400).json({
                    error:
                        "Name enter pannunga"
                });
            }

            if (!email) {

                return res.status(400).json({
                    error:
                        "Email enter pannunga"
                });
            }

            if (!password) {

                return res.status(400).json({
                    error:
                        "Password enter pannunga"
                });
            }

            if (
                password.length < 6
            ) {

                return res.status(400).json({
                    error:
                        "Password minimum 6 characters venum"
                });
            }

            const existingUser =
                await User.findOne({
                    email
                });

            if (existingUser) {

                return res.status(400).json({
                    error:
                        "Indha email already registered"
                });
            }

            const hashedPassword =
                await bcrypt.hash(
                    password,
                    10
                );

            const user =
                await User.create({

                    email,

                    password:
                        hashedPassword,

                    name,

                    // IMPORTANT:
                    // Wake phrase is encrypted
                    // before MongoDB save.
                    wakePhrase:
                        encryptWakePhrase(
                            "hi cool"
                        )
                });

            return res.status(201).json({

                success:
                    true,

                message:
                    "Account created successfully",

                token:
                    sign(user),

                user:
                    safeWithDecryptedWakePhrase(
                        user
                    )

            });

        }
    )
);

// ======================================================
// LOGIN
// ======================================================

app.post(
    "/api/login",

    wrap(
        async (
            req,
            res
        ) => {

            const email =
                String(
                    req.body.email ||
                    ""
                )
                    .trim()
                    .toLowerCase();

            const password =
                String(
                    req.body.password ||
                    ""
                );

            if (!email) {

                return res.status(400).json({
                    error:
                        "Email enter pannunga"
                });
            }

            if (!password) {

                return res.status(400).json({
                    error:
                        "Password enter pannunga"
                });
            }

            console.log(
                "LOGIN REQUEST:",
                email
            );

            const user =
                await User.findOne({
                    email
                });

            if (!user) {

                return res.status(401).json({
                    error:
                        "Email / password thappu"
                });
            }

            const validPassword =
                await bcrypt.compare(
                    password,
                    user.password
                );

            if (!validPassword) {

                return res.status(401).json({
                    error:
                        "Email / password thappu"
                });
            }

            console.log(
                "LOGIN SUCCESS:",
                email
            );

            return res.status(200).json({

                success:
                    true,

                message:
                    "Login successful",

                token:
                    sign(user),

                user:
                    safeWithDecryptedWakePhrase(
                        user
                    )

            });

        }
    )
);

// ======================================================
// CURRENT USER
// ======================================================

app.get(
    "/api/me",

    auth,

    wrap(
        async (
            req,
            res
        ) => {

            const user =
                await User.findById(
                    req.uid
                );

            if (!user) {

                return res.status(404).json({
                    error:
                        "User not found"
                });
            }

            return res.json(
                safeWithDecryptedWakePhrase(
                    user
                )
            );

        }
    )
);

// ======================================================
// UPDATE PROFILE
// ======================================================

app.put(
    "/api/me",

    auth,

    wrap(
        async (
            req,
            res
        ) => {

            const oldUser =
                await User.findById(
                    req.uid
                );

            if (!oldUser) {

                return res.status(404).json({
                    error:
                        "User not found"
                });
            }

            const profileData =
                pick(
                    req.body,

                    [
                        "name",
                        "age",
                        "phone",
                        "bio",
                        "avatar",
                        "wakePhrase"
                    ]
                );

            // ==================================================
            // ENCRYPT WAKE PHRASE BEFORE MONGODB SAVE
            // ==================================================

            if (
                Object.prototype.hasOwnProperty.call(
                    profileData,
                    "wakePhrase"
                )
            ) {

                profileData.wakePhrase =
                    encryptWakePhrase(
                        profileData.wakePhrase
                    );
            }

            const user =
                await User.findByIdAndUpdate(

                    req.uid,

                    profileData,

                    {
                        new: true
                    }
                );

            if (
                oldUser.avatar &&
                oldUser.avatar !==
                    user.avatar &&
                oldUser.avatar.startsWith(
                    "http"
                )
            ) {

                await destroyImages([
                    oldUser.avatar
                ]);
            }

            return res.json(
                safeWithDecryptedWakePhrase(
                    user
                )
            );

        }
    )
);

// ======================================================
// IMAGE UPLOAD
// ======================================================

app.post(
    "/api/upload",

    auth,

    wrap(
        async (
            req,
            res
        ) => {

            const image =
                req.body.image;

            if (
                !/^data:image\/(jpeg|jpg|png|webp|gif);base64,/.test(
                    image || ""
                )
            ) {

                return res.status(400).json({
                    error:
                        "Valid image illa"
                });
            }

            if (
                !process.env.CLOUDINARY_CLOUD_NAME ||
                !process.env.CLOUDINARY_API_KEY ||
                !process.env.CLOUDINARY_API_SECRET
            ) {

                return res.status(500).json({
                    error:
                        "Cloudinary .env configuration missing"
                });
            }

            const result =
                await cloudinary
                    .uploader
                    .upload(
                        image,
                        {
                            folder:
                                "cool-diary/" +
                                req.uid,

                            resource_type:
                                "image"
                        }
                    );

            return res.json({

                success:
                    true,

                url:
                    result.secure_url

            });

        }
    )
);

// ======================================================
// GET ENTRIES
// ======================================================

app.get(
    "/api/entries",

    auth,

    wrap(
        async (
            req,
            res
        ) => {

            const entries =
                await Entry.find({
                    user:
                        req.uid
                })
                    .sort({
                        pinned: -1,
                        createdAt: -1
                    });

            return res.json(
                entries.map(
                    decryptEntry
                )
            );

        }
    )
);

// ======================================================
// CREATE ENTRY
// ======================================================

app.post(
    "/api/entries",

    auth,

    wrap(
        async (
            req,
            res
        ) => {

            const entryData =
                pick(
                    req.body,

                    [
                        "type",
                        "title",
                        "text",
                        "mood",
                        "tags",
                        "photos",
                        "pinned"
                    ]
                );

            // ==================================================
            // ENCRYPT MEMORY TEXT
            // ==================================================

            if (
                Object.prototype.hasOwnProperty.call(
                    entryData,
                    "text"
                )
            ) {

                entryData.text =
                    encryptDiaryText(
                        entryData.text
                    );
            }

            const entry =
                await Entry.create({

                    ...entryData,

                    user:
                        req.uid

                });

            // Send decrypted text back to frontend
            return res.status(201).json(
                decryptEntry(
                    entry
                )
            );

        }
    )
);

// ======================================================
// UPDATE ENTRY
// ======================================================

app.put(
    "/api/entries/:id",

    auth,

    wrap(
        async (
            req,
            res
        ) => {

            const oldEntry =
                await Entry.findOne({

                    _id:
                        req.params.id,

                    user:
                        req.uid

                });

            if (!oldEntry) {

                return res.status(404).json({
                    error:
                        "Entry illa"
                });
            }

            const updateData =
                pick(
                    req.body,

                    [
                        "type",
                        "title",
                        "text",
                        "mood",
                        "tags",
                        "photos",
                        "pinned"
                    ]
                );

            // ==================================================
            // ENCRYPT UPDATED MEMORY TEXT
            // ==================================================

            if (
                Object.prototype.hasOwnProperty.call(
                    updateData,
                    "text"
                )
            ) {

                updateData.text =
                    encryptDiaryText(
                        updateData.text
                    );
            }

            const newEntry =
                await Entry.findByIdAndUpdate(

                    oldEntry._id,

                    updateData,

                    {
                        new: true
                    }
                );

            await destroyImages(

                (oldEntry.photos || [])
                    .filter(
                        photo =>
                            !(newEntry.photos || [])
                                .includes(
                                    photo
                                )
                    )
            );

            return res.json(
                decryptEntry(
                    newEntry
                )
            );

        }
    )
);

// ======================================================
// DELETE ENTRY
// ======================================================

app.delete(
    "/api/entries/:id",

    auth,

    wrap(
        async (
            req,
            res
        ) => {

            const entry =
                await Entry.findOneAndDelete({

                    _id:
                        req.params.id,

                    user:
                        req.uid

                });

            if (entry) {

                await destroyImages(
                    entry.photos
                );
            }

            return res.json({
                success:
                    true
            });

        }
    )
);

// ======================================================
// API 404
// ======================================================

app.use(
    "/api",

    (
        req,
        res
    ) => {

        res.status(404).json({

            error:
                "API route not found",

            method:
                req.method,

            path:
                req.originalUrl

        });

    }
);

// ======================================================
// FRONTEND
// ======================================================

app.get(
    "*",

    (
        req,
        res
    ) => {

        res.sendFile(
            path.join(
                __dirname,
                "public",
                "index.html"
            )
        );

    }
);

// ======================================================
// START SERVER
// ======================================================

async function startServer() {

    try {

        if (
            !process.env.MONGODB_URI
        ) {

            throw new Error(
                "MONGODB_URI missing in .env"
            );
        }

        if (
            !process.env.JWT_SECRET
        ) {

            throw new Error(
                "JWT_SECRET missing in .env"
            );
        }

        console.log(
            "MongoDB connecting..."
        );

        await mongoose.connect(

            process.env.MONGODB_URI,

            {
                serverSelectionTimeoutMS:
                    15000,

                connectTimeoutMS:
                    15000,

                socketTimeoutMS:
                    45000,

                tls:
                    true
            }
        );

        console.log(
            "MongoDB connected successfully"
        );

        app.listen(
            PORT,

            () => {

                console.log(
                    "================================="
                );

                console.log(
                    `Cool Diary running at http://localhost:${PORT}`
                );

                console.log(
                    `API Test: http://localhost:${PORT}/api/test`
                );

                console.log(
                    "================================="
                );

            }
        );

    } catch (error) {

        console.error(
            "================================="
        );

        console.error(
            "MONGODB CONNECTION FAILED"
        );

        console.error(
            error.message
        );

        console.error(
            "================================="
        );

        process.exit(1);

    }

}

startServer();
