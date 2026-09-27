require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const path = require("path");
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

// CORS
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
// EXPENSE MODEL
// ======================================================

const Expense = mongoose.model(
    "Expense",
    new mongoose.Schema(
        {
            user: {
                type: mongoose.Schema.Types.ObjectId,
                required: true,
                index: true
            },

            amount: {
                type: Number,
                required: true,
                min: 0
            },

            category: {
                type: String,
                default: "Other",
                trim: true
            },

            note: {
                type: String,
                default: "",
                trim: true
            },

            paymentMethod: {
                type: String,
                default: "Cash",
                trim: true
            },

            date: {
                type: String,
                required: true
            }
        },

        {
            timestamps: true
        }
    )
);

// ======================================================
// HELPERS
// ======================================================

function sign(user) {

    return jwt.sign(
        {
            id: user._id.toString()
        },

        process.env.JWT_SECRET,

        {
            expiresIn: "30d"
        }
    );
}

function safe(user) {

    const obj =
        user.toObject();

    delete obj.password;

    return obj;
}

function pick(obj, keys) {

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

function auth(req, res, next) {

    try {

        const header =
            req.headers.authorization || "";

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
// TEST
// ======================================================

app.get(
    "/api/test",

    (req, res) => {

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
                    req.body.email || ""
                )
                    .trim()
                    .toLowerCase();

            const password =
                String(
                    req.body.password || ""
                );

            const name =
                String(
                    req.body.name || ""
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

                    wakePhrase:
                        "hi cool"

                });

            return res.status(201).json({

                success:
                    true,

                message:
                    "Account created successfully",

                token:
                    sign(user),

                user:
                    safe(user)

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
                    req.body.email || ""
                )
                    .trim()
                    .toLowerCase();

            const password =
                String(
                    req.body.password || ""
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
                    safe(user)

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
                safe(user)
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

            const user =
                await User.findByIdAndUpdate(

                    req.uid,

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
                    ),

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
                safe(user)
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
                        pinned:
                            -1,

                        createdAt:
                            -1
                    });

            return res.json(
                entries
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

            const entry =
                await Entry.create({

                    ...pick(
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
                    ),

                    user:
                        req.uid

                });

            return res.status(201).json(
                entry
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

            const newEntry =
                await Entry.findByIdAndUpdate(

                    oldEntry._id,

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
                    ),

                    {
                        new: true
                    }
                );

            await destroyImages(

                (oldEntry.photos || [])
                    .filter(
                        photo =>
                            !(newEntry.photos || [])
                                .includes(photo)
                    )
            );

            return res.json(
                newEntry
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
// EXPENSES
// ======================================================

// GET ALL EXPENSES

app.get(
    "/api/expenses",

    auth,

    wrap(
        async (
            req,
            res
        ) => {

            const expenses =
                await Expense.find({
                    user:
                        req.uid
                })
                    .sort({
                        date:
                            -1,

                        createdAt:
                            -1
                    });

            return res.json(
                expenses
            );

        }
    )
);

// CREATE EXPENSE

app.post(
    "/api/expenses",

    auth,

    wrap(
        async (
            req,
            res
        ) => {

            const amount =
                Number(
                    req.body.amount
                );

            const category =
                String(
                    req.body.category ||
                    "Other"
                ).trim();

            const note =
                String(
                    req.body.note ||
                    ""
                ).trim();

            const paymentMethod =
                String(
                    req.body.paymentMethod ||
                    "Cash"
                ).trim();

            const date =
                String(
                    req.body.date ||
                    ""
                ).trim();

            if (
                !Number.isFinite(amount) ||
                amount <= 0
            ) {

                return res.status(400).json({
                    error:
                        "Valid amount enter pannunga"
                });
            }

            if (
                !/^\d{4}-\d{2}-\d{2}$/.test(
                    date
                )
            ) {

                return res.status(400).json({
                    error:
                        "Valid date select pannunga"
                });
            }

            const expense =
                await Expense.create({

                    user:
                        req.uid,

                    amount,

                    category,

                    note,

                    paymentMethod,

                    date

                });

            return res.status(201).json(
                expense
            );

        }
    )
);

// UPDATE EXPENSE

app.put(
    "/api/expenses/:id",

    auth,

    wrap(
        async (
            req,
            res
        ) => {

            const amount =
                Number(
                    req.body.amount
                );

            const date =
                String(
                    req.body.date ||
                    ""
                ).trim();

            if (
                !Number.isFinite(amount) ||
                amount <= 0
            ) {

                return res.status(400).json({
                    error:
                        "Valid amount enter pannunga"
                });
            }

            if (
                !/^\d{4}-\d{2}-\d{2}$/.test(
                    date
                )
            ) {

                return res.status(400).json({
                    error:
                        "Valid date select pannunga"
                });
            }

            const expense =
                await Expense.findOneAndUpdate(

                    {
                        _id:
                            req.params.id,

                        user:
                            req.uid
                    },

                    {

                        amount,

                        category:
                            String(
                                req.body.category ||
                                "Other"
                            ).trim(),

                        note:
                            String(
                                req.body.note ||
                                ""
                            ).trim(),

                        paymentMethod:
                            String(
                                req.body.paymentMethod ||
                                "Cash"
                            ).trim(),

                        date

                    },

                    {
                        new: true
                    }
                );

            if (!expense) {

                return res.status(404).json({
                    error:
                        "Expense illa"
                });
            }

            return res.json(
                expense
            );

        }
    )
);

// DELETE EXPENSE

app.delete(
    "/api/expenses/:id",

    auth,

    wrap(
        async (
            req,
            res
        ) => {

            const expense =
                await Expense.findOneAndDelete({

                    _id:
                        req.params.id,

                    user:
                        req.uid

                });

            if (!expense) {

                return res.status(404).json({
                    error:
                        "Expense illa"
                });
            }

            return res.json({
                success:
                    true
            });

        }
    )
);

// ======================================================
// AI MEMORY ASSISTANT
// ======================================================

function localAssistant(
    message,
    entries,
    expenses
) {

    const q =
        String(
            message || ""
        )
            .toLowerCase()
            .trim();

    const now =
        new Date();

    const today =
        now
            .toISOString()
            .slice(
                0,
                10
            );

    const month =
        today.slice(
            0,
            7
        );

    const todayExpenses =
        expenses.filter(
            x =>
                x.date ===
                today
        );

    const monthExpenses =
        expenses.filter(
            x =>
                String(
                    x.date || ""
                ).startsWith(
                    month
                )
        );

    const todayTotal =
        todayExpenses.reduce(
            (
                sum,
                x
            ) =>
                sum +
                Number(
                    x.amount || 0
                ),
            0
        );

    const monthTotal =
        monthExpenses.reduce(
            (
                sum,
                x
            ) =>
                sum +
                Number(
                    x.amount || 0
                ),
            0
        );

    // TODAY EXPENSE

    if (
        /today|innaiku|inru/.test(q) &&
        /spent|expense|selavu|spend|amount|cost/.test(q)
    ) {

        return {

            answer:
                `Today you spent ₹${todayTotal.toFixed(2)} across ${todayExpenses.length} expense${todayExpenses.length === 1 ? "" : "s"}.`,

            type:
                "expense"

        };
    }

    // MONTH EXPENSE

    if (
        /month|this month|indha month|intha month/.test(q) &&
        /spent|expense|selavu|spend|amount|cost/.test(q)
    ) {

        return {

            answer:
                `This month you spent ₹${monthTotal.toFixed(2)} across ${monthExpenses.length} expenses.`,

            type:
                "expense"

        };
    }

    // TOTAL EXPENSE

    if (
        /total|overall|all time|overall spend|motham|mothama/.test(q) &&
        /spent|expense|selavu|spend|amount|cost/.test(q)
    ) {

        const total =
            expenses.reduce(
                (
                    sum,
                    x
                ) =>
                    sum +
                    Number(
                        x.amount || 0
                    ),
                0
            );

        return {

            answer:
                `Your recorded total spending is ₹${total.toFixed(2)} across ${expenses.length} expenses.`,

            type:
                "expense"

        };
    }

    // CATEGORY EXPENSE

    const categoryMatch =
        q.match(
            /(?:on|for|category)\s+([a-z ]{2,30})/
        );

    if (
        categoryMatch &&
        /spent|expense|selavu|spend/.test(q)
    ) {

        const needle =
            categoryMatch[1]
                .trim();

        const rows =
            monthExpenses.filter(
                x =>
                    String(
                        x.category || ""
                    )
                        .toLowerCase()
                        .includes(
                            needle
                        )
            );

        const total =
            rows.reduce(
                (
                    sum,
                    x
                ) =>
                    sum +
                    Number(
                        x.amount || 0
                    ),
                0
            );

        return {

            answer:
                `I found ₹${total.toFixed(2)} spent on ${needle} this month (${rows.length} entries).`,

            type:
                "expense"

        };
    }

    // MEMORY SEARCH

    if (
        /remember|memory|diary|write|wrote|entry|entries|what did i/.test(q)
    ) {

        const recent =
            entries.slice(
                0,
                5
            );

        if (!recent.length) {

            return {

                answer:
                    "You don't have any saved memories yet.",

                type:
                    "memory"

            };
        }

        const lines =
            recent.map(
                (
                    e,
                    i
                ) =>
                    `${i + 1}. ${e.title || "Untitled memory"} — ${(e.text || "").slice(0, 100)}`
            );

        return {

            answer:
                `Here are your latest memories:\n${lines.join("\n")}`,

            type:
                "memory"

        };
    }

    // DEFAULT OVERVIEW

    const recentExpenses =
        expenses.slice(
            0,
            5
        );

    const recentEntries =
        entries.slice(
            0,
            3
        );

    return {

        answer:
            `I can help with your diary and spending.\n\nToday: ₹${todayTotal.toFixed(2)} spent\nThis month: ₹${monthTotal.toFixed(2)} spent\nSaved memories: ${entries.length}\nExpenses recorded: ${expenses.length}\n\nTry: “How much did I spend today?”, “How much this month?”, or “Show my recent memories.”`,

        type:
            "overview",

        recentExpenses,

        recentEntries

    };
}

// ======================================================
// AI ASSISTANT API
// ======================================================

app.post(
    "/api/assistant",

    auth,

    wrap(
        async (
            req,
            res
        ) => {

            const message =
                String(
                    req.body.message ||
                    ""
                ).trim();

            if (!message) {

                return res.status(400).json({
                    error:
                        "Question enter pannunga"
                });
            }

            const [
                entries,
                expenses
            ] =
                await Promise.all([

                    Entry.find({
                        user:
                            req.uid
                    })
                        .sort({
                            createdAt:
                                -1
                        })
                        .limit(50)
                        .lean(),

                    Expense.find({
                        user:
                            req.uid
                    })
                        .sort({
                            date:
                                -1,

                            createdAt:
                                -1
                        })
                        .limit(500)
                        .lean()

                ]);

            // ==================================================
            // OPTIONAL REAL AI
            // ==================================================

            if (
                process.env.OPENAI_API_KEY &&
                typeof fetch ===
                    "function"
            ) {

                try {

                    const memoryContext =
                        entries
                            .slice(
                                0,
                                20
                            )
                            .map(
                                e => ({

                                    title:
                                        e.title,

                                    type:
                                        e.type,

                                    mood:
                                        e.mood,

                                    text:
                                        String(
                                            e.text ||
                                            ""
                                        ).slice(
                                            0,
                                            500
                                        ),

                                    createdAt:
                                        e.createdAt

                                })
                            );

                    const expenseContext =
                        expenses
                            .slice(
                                0,
                                100
                            )
                            .map(
                                e => ({

                                    amount:
                                        e.amount,

                                    category:
                                        e.category,

                                    note:
                                        e.note,

                                    paymentMethod:
                                        e.paymentMethod,

                                    date:
                                        e.date

                                })
                            );

                    const aiResponse =
                        await fetch(
                            "https://api.openai.com/v1/chat/completions",
                            {

                                method:
                                    "POST",

                                headers: {

                                    "Content-Type":
                                        "application/json",

                                    "Authorization":
                                        `Bearer ${process.env.OPENAI_API_KEY}`

                                },

                                body:
                                    JSON.stringify({

                                        model:
                                            process.env.OPENAI_MODEL ||
                                            "gpt-4o-mini",

                                        temperature:
                                            0.2,

                                        messages: [

                                            {

                                                role:
                                                    "system",

                                                content:
                                                    "You are Cool Diary's private memory assistant. Answer only from the supplied memory and expense context. Be concise, friendly, and do not invent facts. Currency is INR (₹)."

                                            },

                                            {

                                                role:
                                                    "user",

                                                content:
                                                    JSON.stringify({

                                                        question:
                                                            message,

                                                        memories:
                                                            memoryContext,

                                                        expenses:
                                                            expenseContext

                                                    })

                                            }

                                        ]

                                    })

                            }
                        );

                    if (
                        aiResponse.ok
                    ) {

                        const payload =
                            await aiResponse.json();

                        const answer =
                            payload
                                ?.choices?.[0]
                                ?.message
                                ?.content
                                ?.trim();

                        if (answer) {

                            return res.json({

                                answer,

                                type:
                                    "ai",

                                provider:
                                    "openai"

                            });
                        }
                    }

                } catch (
                    aiError
                ) {

                    console.error(
                        "AI provider fallback:",
                        aiError.message
                    );
                }
            }

            // ==================================================
            // LOCAL FALLBACK
            // ==================================================

            return res.json(
                localAssistant(
                    message,
                    entries,
                    expenses
                )
            );

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

    } catch (
        error
    ) {

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
