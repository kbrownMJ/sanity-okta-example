// Reconstitute newlines from our env variable certificate
const cert = (process.env.OKTA_CERT || "").replace(/_/g, "\r\n");

const config = {
  entryPoint: process.env.OKTA_ENTRYPOINT,
  issuer: process.env.OKTA_ISSUER,
  cert,
  sanityClient: {
    projectId: process.env.SANITY_PROJECT_ID,
    dataset: process.env.SANITY_DATASET,
    token: process.env.SANITY_TOKEN,
  },
};

export default config;
