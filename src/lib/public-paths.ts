export const SITE_API_BASE='/site-api/v1';
export const siteApi=(resource:'guild'|'applications'|'status'|'mods')=>`${SITE_API_BASE}/${resource}`;
