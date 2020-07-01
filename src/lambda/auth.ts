import express, { Router } from "express";
import bodyParser from "body-parser";
import serverless from "serverless-http";
import passport from "passport";
import { Strategy, Profile } from "passport-saml";
import config from "./config";
import { login, SanitySession } from "../sanitySession";

// Make sure your SAML config on Okta returns these attributes see README.md for
// instructions.
export type OktaSamlProfile = Profile & {
  groups: string | string[];
  email: string;
  firstName?: string;
  lastName?: string;
};

const app = express();
const router = Router();

router.use((req, _res, next) => {
  const host = req.query.host;
  passport.use(
    new Strategy(
      {
        path: `${host}/.netlify/functions/auth/saml/callback`,
        entryPoint: config.entryPoint,
        issuer: config.issuer,
        cert: config.cert,
      },
      async (samlResponse: Profile, done: Function) =>
        login(samlResponse as OktaSamlProfile)
          .then((response) => done(null, response))
          .catch((err) => done(err))
    )
  );
  next();
});

app.use(require("body-parser").urlencoded({ extended: true }));
app.use(passport.initialize());

passport.serializeUser(function (session: SanitySession, done) {
  done(null, session);
});

passport.deserializeUser(function (session: SanitySession, done) {
  done(null, session);
});

router.get(
  "/saml/login",
  passport.authenticate("saml", { failureRedirect: "/", failureFlash: true }),
  function (_req, res) {
    res.redirect("/");
  }
);

router.post(
  "/saml/callback",
  bodyParser.urlencoded({ extended: false }),
  passport.authenticate("saml", {
    // Login failure handling is not actually implemented in this example
    failureRedirect: "/login-failed",
    failureFlash: true,
  }),
  function (req, res) {
    const user = req.user as SanitySession;
    // We send the URL the users browser should visit to set the Sanity Cloud
    // cookie, and also pass an origin param so the Sanity Cloud can redirect
    // them further (typically your studio URL)
    const claimUrl = `${user.endUserClaimUrl}?origin=${process.env.SANITY_STUDIO_URL}`;
    res.redirect("/?redirect=" + encodeURIComponent(claimUrl));
  }
);

// This is a trick to be able to use express on serverless
app.use("/.netlify/functions/auth", router);
export const handler = serverless(app);
