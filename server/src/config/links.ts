// src/config/links.ts
//
// Single source for the public links included in outbound emails/SMS
// (account-creation message, etc). WEBSITE_URL has a real deployed default
// since the web app is already live; the app store links stay empty until
// the app is actually published — callers treat '' as "omit this link".
export const WEBSITE_URL = process.env.WEBSITE_URL || 'https://hit-organization-web.onrender.com';

// TODO: set once the app is published on each store
export const APP_LINK_URL_IOS     = process.env.APP_LINK_URL_IOS     || '';
export const APP_LINK_URL_ANDROID = process.env.APP_LINK_URL_ANDROID || '';
