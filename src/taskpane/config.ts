/**
 * Backend configuration.
 *
 * For local dev, the classifier backend runs on https://localhost:4000 (see /server).
 * For production, change this to your deployed endpoint and ensure the cert is
 * trusted by the host where the task pane runs.
 */

export const CLASSIFIER_API_URL = "https://localhost:4000";

/**
 * If the backend is configured with SHARED_AUTH_TOKEN, set the matching token
 * here. Leave blank in dev. For production: do NOT ship a token in client
 * code — replace this with a per-user token minted by a real auth flow
 * (e.g. Office SSO + Microsoft Graph) and exchanged with your backend.
 */
export const CLASSIFIER_AUTH_TOKEN = "";
