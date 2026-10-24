/** Convex Auth issues the tokens itself, from this deployment's site URL. */
export default {
  providers: [
    {
      domain: process.env.CONVEX_SITE_URL,
      applicationID: 'convex',
    },
  ],
};
