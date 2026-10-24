import { httpRouter } from 'convex/server';
import { auth } from './auth';

const http = httpRouter();

/** OAuth callbacks and token endpoints for Convex Auth. */
auth.addHttpRoutes(http);

export default http;
