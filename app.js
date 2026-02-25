if(process.env.NODE_ENV != "production"){
require('dotenv').config();
}

console.log(process.env.SECRET);


const express = require('express');
const app = express();
const mongoose = require('mongoose');
const path = require("path");
const methodOverride = require('method-override');
const ejsMate = require('ejs-mate');
const ExpressError = require("./utils/ExpressError.js");
const session= require("express-session");
const flash = require("connect-flash");
const passport = require("passport");
const LocalStrategy = require("passport-local");
const User = require("./models/user.js");
// Session store backed by MongoDB
const connectMongo = require('connect-mongo');
// Support multiple export shapes: { MongoStore, default } or direct function
const MongoStore = connectMongo.MongoStore || connectMongo.default || connectMongo;

const e = require('express');
const listingsRouter = require("./routes/listing.js");
const reviewsRouter = require("./routes/review.js");
const userRouter = require("./routes/user.js");
const bookingRouter = require("./routes/booking.js");
const stripeWebhookHandler = require('./routes/webhooks').stripeWebhookHandler;



const PORT = 4655;
 //const MONGO_URL = "mongodb://127.0.0.1:27017/BOOK&STAY";
// const dburl = "mongodb://127.0.0.1:27017/BOOK&STAY";
 const dbUrl=process.env.ATLASDB_URL;

// Validate DB URL early and provide actionable errors
if (!dbUrl) {
    console.error('ERROR: ATLASDB_URL is not set. Define it in your .env or environment variables.');
    console.error('Example: mongodb+srv://<user>:<password>@cluster0.mongodb.net/<dbname>?retryWrites=true&w=majority');
    process.exit(1);
}
if (/\s/.test(dbUrl)) {
    console.error('ERROR: ATLASDB_URL contains whitespace. Remove spaces and URL-encode special characters (e.g., $ -> %24, % -> %25).');
    console.error('Current value:', dbUrl);
    process.exit(1);
}

// Try connecting to Atlas first, but fall back to a local MongoDB for development if needed
// If FORCE_LOCAL_DB is set, prefer a local MongoDB immediately (useful when Atlas is unreachable)
if (process.env.FORCE_LOCAL_DB === 'true') {
    (async function connectLocal() {
        const fallback = process.env.LOCAL_MONGO_URL || 'mongodb://127.0.0.1:27017/bookandstay_dev';
        console.warn('FORCE_LOCAL_DB is true — connecting to local MongoDB:', fallback);
        try {
            if (mongoose.connection && mongoose.connection.readyState === 1 && mongoose.connection.name === (new URL(fallback.replace(/^[^\/]+:\/\//, 'http://')).pathname.replace('/','') || process.env.ATLAS_DBNAME)) {
                console.log('Mongoose already connected to local DB, skipping reconnect');
                await startServer();
                return;
            }
            await mongoose.connect(fallback);
            console.log('Connected to local MongoDB host=', mongoose.connection.host, 'db=', mongoose.connection.name);
            await startServer();
            return;
        } catch (err) {
            console.error('Failed to connect to forced local MongoDB:', err && err.message ? err.message : err);
            process.exit(1);
        }
    })();
}
(async function connectToMongo() {
    // Allow overriding the target DB name via env (useful when URL doesn't include DB name)
    const atlasDbName = process.env.ATLAS_DBNAME || undefined;
    const hasDbNameInUrl = /mongodb(?:\+srv)?:\/\/[^\/]+\/[^?]+/.test(dbUrl);
    if (!hasDbNameInUrl && !atlasDbName) {
        console.warn('Warning: ATLASDB_URL does not contain a database name and ATLAS_DBNAME is not set. Consider setting ATLAS_DBNAME or including the DB in the URL.');
    }

    try {
        await mongoose.connect(dbUrl, { dbName: atlasDbName });
        console.log(`Connected to MongoDB host=${mongoose.connection.host} db=${mongoose.connection.name}`);
        // Now that DB is connected, set up session store, middlewares, routes and start listening
        await startServer();
        return;
    } catch (err) {
        console.error('Failed to connect to MongoDB:', err && err.message ? err.message : err);
        // Detect TLS/SSL specific errors and print targeted tips
        const tlsError = err && ((err.message && (err.message.toLowerCase().includes('ssl') || err.message.toLowerCase().includes('tls') || err.message.toLowerCase().includes('tlsv1'))) || (err.cause && err.cause.code && String(err.cause.code).toLowerCase().includes('err_ssl')));
        if (tlsError) {
            console.error('\nMongoDB TLS/SSL handshake failed. Common causes and suggestions:');
            console.error('- A network middlebox or corporate proxy is intercepting TLS (try from another network or VPN).');
            console.error('- DNS SRV lookups are failing on your network (try resolving the cluster host with dig or nslookup).');
            console.error('- Your Node/OpenSSL may be incompatible (ensure TLS 1.2+ support).');
            console.error('\nTo debug: run the test script with your Atlas URI:');
            console.error('  ATLAS_TEST_URI="mongodb+srv://<user>:<pass>@cluster0.mongodb.net/<dbname>" npm run test:atlas');
        }
        // Detect authentication-specific errors
        const authFailed = (err && (
            (err.message && err.message.toLowerCase().includes('authentication failed')) ||
            err.code === 8000 ||
            (err.errorResponse && err.errorResponse.errmsg && err.errorResponse.errmsg.toLowerCase().includes('authentication failed'))
        ));

        if (process.env.NODE_ENV !== 'production') {
            const fallback = process.env.LOCAL_MONGO_URL || 'mongodb://127.0.0.1:27017/bookandstay_dev';
            console.warn('Attempting development fallback to local MongoDB:', fallback);
            try {
                await mongoose.connect(fallback);
                console.log('connected to local MongoDB (fallback)');
                console.log(`Connected to MongoDB host=${mongoose.connection.host} db=${mongoose.connection.name}`);
                // Setup session, middlewares, and routes now that local DB is available
                await startServer();
                return;
            } catch (err2) {
                console.error('Local MongoDB fallback failed:', err2 && err2.message ? err2.message : err2);
            }
        }

        if (authFailed) {
            console.error('\nMongoDB authentication failed. Common causes and fixes:');
            console.error('- Incorrect username or password. If your password contains special characters, URL-encode them (e.g., `$` -> `%24`, `%` -> `%25`).');
            console.error('- Your IP address may not be whitelisted in Atlas Network Access. For development, you can add your current IP or `0.0.0.0/0` (less secure).');
            console.error('- Ensure the database user exists and has appropriate roles (e.g. `readWrite` on the target DB).');
            console.error('- If your URI is missing a DB name, set ATLAS_DBNAME environment variable.');
            console.error('\nYou can test the connection with mongosh (replace placeholders):');
            console.error('  mongosh "mongodb+srv://<user>:<password>@cluster0.mongodb.net/<dbname>?retryWrites=true&w=majority"');
        }

        // Start server in degraded mode (no DB). This prevents all routes from returning 404 when DB connection fails.
        console.warn('Starting server in degraded mode: DB unavailable. Some features (bookings, listings) may not work correctly.');
        try {
            await startServer();
        } catch (startErr) {
            console.error('Failed to start server in degraded mode:', startErr && startErr.message ? startErr.message : startErr);
            process.exit(1);
        }
        return;
    }
})();


app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
// For normal routes (form POSTs)
app.use(express.urlencoded({ extended: true }));
// Also accept JSON bodies for API-like endpoints (payment verification)
// Capture raw body for Stripe webhooks so signature verification works even when JSON parser runs
app.use(express.json({
  verify: (req, res, buf) => {
    if (req.originalUrl && req.originalUrl.startsWith('/webhooks/stripe')) {
      req.rawBody = buf;
    }
  }
}));
app.use(methodOverride("_method"));
app.engine("ejs", ejsMate);
app.use(express.static(path.join(__dirname, "public")));

// IMPORTANT: Stripe webhooks require the raw body. We will add a specific raw body middleware on the webhook route below.



// Defer session initialization and route registration until after a DB connection is established
// This prevents parallel Atlas connections (which can produce SSL/TLS errors during startup)

// Passport strategy registration (does not require an active session store)
passport.use(new LocalStrategy(User.authenticate()));
passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());

// Keep safe defaults for templates before session is attached
// Do NOT call req.flash here because the session (and connect-flash) may not be initialized yet.
app.use((req,res,next)=>{
    res.locals.success = [];
    res.locals.error = [];
    res.locals.currUser = null; // will be populated after passport session is attached
    next();
});

// startServer: called after we have a DB connection (Atlas or local fallback)
let serverStarted = false;
async function startServer() {
    if (serverStarted) {
        console.warn('startServer already called — ignoring duplicate call');
        return;
    }
    serverStarted = true;
    console.log('Setting up session store and routes...');
    let store = null;
    try {
        // Prefer binding session store to existing mongoose connection (avoids extra TLS attempts)
        if (mongoose.connection && typeof mongoose.connection.getClient === 'function') {
            const client = mongoose.connection.getClient();
            if (client) {
                store = await MongoStore.create({
                    client,
                    dbName: mongoose.connection.name,
                    ttl: 14 * 24 * 60 * 60,
                });
                console.log('Session store created using mongoose client.');
            }
        }
    } catch (err) {
        console.error('Failed to create MongoDB session store using active connection:', err && err.message ? err.message : err);
    }

    const sessionOptions = {
        store,
        secret: process.env.SESSION_SECRET || "mysupersecretcode",
        resave: false,
        saveUninitialized: false,
        cookie: {
            expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
            maxAge: 7 * 24 * 60 * 60 * 1000,
            httpOnly: true,
        },
    };

    app.use(session(sessionOptions));
    app.use(flash());

    app.use(passport.initialize());
    app.use(passport.session());

    // Now that session and passport are available, populate res.locals from flash and user
    app.use((req, res, next) => {
        res.locals.success = req.flash("success") || [];
        res.locals.error = req.flash("error") || [];
        res.locals.currUser = req.user || null;
        next();
    });

    // Helpful convenience routes
    app.get('/', (req, res) => res.redirect('/listings'));
    app.get('/health', (req, res) => res.json({ ok: true, db: mongoose.connection && mongoose.connection.name ? mongoose.connection.name : 'unknown' }));

    // Register routes that rely on session/passport
    app.use("/listings",listingsRouter);
    app.use("/listings/:id/reviews",reviewsRouter);
    app.use("/",userRouter);
    app.use('/bookings', bookingRouter);

    // Admin routes (dev only) for configuring payment providers
    const adminRouter = require('./routes/admin');
    app.use('/admin', adminRouter);

    // Owner routes for managing bookings
    const ownerRouter = require('./routes/owner');
    app.use('/owner', ownerRouter);

    // Stripe webhook endpoint (raw body) - requires STRIPE_WEBHOOK_SECRET env var
    app.post('/webhooks/stripe', express.raw({ type: 'application/json' }), stripeWebhookHandler);

    // Catch-all for unknown routes (use app.use so path isn't passed to path-to-regexp)
    app.use((req, res, next) => {
        next(new ExpressError(404, "page not found"));
    });

    // Error handler with defaults
    app.use((err, req, res, next) => {
        const statusCode = err.statusCode || 500;
        const message = err.message || 'Something went wrong';
        // If headers already sent, delegate to default Express error handler
        if (res.headersSent) {
            console.error('Error after headers sent:', err);
            return next(err);
        }
        res.status(statusCode).render("error.ejs", { message });
    });

    app.listen(PORT, () => {
        console.log(`server is working on port http://127.0.0.1:${PORT}/listings`);
    });
}

// Global handlers to avoid crashing on unhandled rejections/uncaught exceptions
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});
process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
    process.exit(1);
});

// app.get("/demouser",async(req,res)=>{
//     let fakeUser=new User({
//         email:"student@gmail.com",
//         username:"delta-student",
//     });

//    let registeredUser=await User.register(fakeUser,"helloworld");
//    res.send(registeredUser);
// });


// Routes are registered inside startServer() after session and passport are initialized.
// See startServer() for route registration and middleware setup.


// Stripe status check (helpful message at startup)
const stripeStatus = process.env.STRIPE_MOCK === 'true' ? 'MOCK' : (process.env.STRIPE_SECRET_KEY && process.env.STRIPE_SECRET_KEY !== 'sk_test_...') ? 'CONFIGURED' : 'NOT CONFIGURED';
if (stripeStatus === 'NOT CONFIGURED') {
    console.warn('⚠️ Stripe not configured. To enable payments, set STRIPE_SECRET_KEY in your .env or use STRIPE_MOCK=true for local testing. See README_STRIPE.md');
} else {
    console.log(`✅ Stripe mode: ${stripeStatus}`);
}

// Razorpay status check
const razorStatus = (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) ? 'CONFIGURED' : 'NOT CONFIGURED';
if (razorStatus === 'NOT CONFIGURED') {
    console.warn('⚠️ Razorpay not configured. To enable Razorpay payments, set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in your .env. You can configure them at /admin/pay-config (development only). See README_STRIPE.md for quick setup.');
} else {
    console.log(`✅ Razorpay mode: ${razorStatus}`);
}

// Note: Route registration and server listen are performed inside `startServer()` after DB initialization.
// This avoids registering duplicate catch-all middleware before routes are available.





