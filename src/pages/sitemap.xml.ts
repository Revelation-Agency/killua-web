import type { APIRoute } from 'astro';
const routes = ['/', '/about/', '/contact/', '/solar-installation/', '/battery-storage/', '/solar-repair/', '/roof-replacement/', '/roof-repair/', '/roof-inspection/', '/ev-chargers/', '/privacy/'];
export const GET: APIRoute = ({ site }) => new Response('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' + routes.map(route=>`<url><loc>${new URL(route, site).href}</loc></url>`).join('') + '</urlset>', { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
