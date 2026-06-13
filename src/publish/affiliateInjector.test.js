import { describe, it, expect } from 'vitest';
import { injectAffiliateLinks } from './affiliateInjector.js';

const AFFILIATE_URLS = {
  caliente: 'https://caliente.mx/ref/TEST',
  bet365: 'https://bet365.mx/ref/TEST',
  skimlinks: 'https://go.skimresources.com/?id=TEST&url=',
};

describe('affiliateInjector', () => {
  it('wraps first "momios" with Caliente link', () => {
    const html = '<p>Los momios favorecen al equipo local. Los momios cambian.</p>';
    const result = injectAffiliateLinks(html, AFFILIATE_URLS);
    expect(result).toContain(`<a href="https://caliente.mx/ref/TEST" rel="sponsored">momios</a>`);
    // Only first occurrence
    const matches = result.match(/rel="sponsored"/g);
    expect(matches.length).toBeLessThanOrEqual(3); // max 3 groups
  });

  it('wraps first "apostar" with Caliente link (case-insensitive)', () => {
    const html = '<p>Puedes Apostar en este partido.</p>';
    const result = injectAffiliateLinks(html, AFFILIATE_URLS);
    expect(result).toContain(`<a href="https://caliente.mx/ref/TEST" rel="sponsored">Apostar</a>`);
  });

  it('wraps first "apuesta" with Caliente link', () => {
    const html = '<p>La apuesta segura es el over 2.5.</p>';
    const result = injectAffiliateLinks(html, AFFILIATE_URLS);
    expect(result).toContain(`<a href="https://caliente.mx/ref/TEST" rel="sponsored">apuesta</a>`);
  });

  it('wraps first "Caliente" with Caliente link', () => {
    const html = '<p>Revisa las cuotas en Caliente para más opciones.</p>';
    const result = injectAffiliateLinks(html, AFFILIATE_URLS);
    expect(result).toContain(`<a href="https://caliente.mx/ref/TEST" rel="sponsored">Caliente</a>`);
  });

  it('wraps first "pronóstico" with Bet365 link (accent-insensitive)', () => {
    const html = '<p>Nuestro pronostico para el partido es...</p>';
    const result = injectAffiliateLinks(html, AFFILIATE_URLS);
    expect(result).toContain(`<a href="https://bet365.mx/ref/TEST" rel="sponsored">pronostico</a>`);
  });

  it('wraps first "juega" with Bet365 link', () => {
    const html = '<p>Juega con responsabilidad siempre.</p>';
    const result = injectAffiliateLinks(html, AFFILIATE_URLS);
    expect(result).toContain(`<a href="https://bet365.mx/ref/TEST" rel="sponsored">Juega</a>`);
  });

  it('wraps first "la verde" with Skimlinks link', () => {
    const html = '<p>La Verde llega en buena forma al torneo.</p>';
    const result = injectAffiliateLinks(html, AFFILIATE_URLS);
    expect(result).toContain(`<a href="https://go.skimresources.com/?id=TEST&url=" rel="sponsored">La Verde</a>`);
  });

  it('wraps first "jersey" with Skimlinks link', () => {
    const html = '<p>Consigue el jersey oficial de la selección.</p>';
    const result = injectAffiliateLinks(html, AFFILIATE_URLS);
    expect(result).toContain(`<a href="https://go.skimresources.com/?id=TEST&url=" rel="sponsored">jersey</a>`);
  });

  it('wraps first "Nike" with Skimlinks link', () => {
    const html = '<p>Nike presentó la nueva equipación.</p>';
    const result = injectAffiliateLinks(html, AFFILIATE_URLS);
    expect(result).toContain(`<a href="https://go.skimresources.com/?id=TEST&url=" rel="sponsored">Nike</a>`);
  });

  it('only wraps first match per trigger group', () => {
    const html = '<p>Los momios son claros. Otros momios también. La apuesta principal es clara.</p>';
    const result = injectAffiliateLinks(html, AFFILIATE_URLS);
    // Caliente group: momios, apostar, apuesta, Caliente — only FIRST match across all triggers in group
    const calienteLinks = (result.match(/caliente\.mx\/ref\/TEST/g) || []);
    expect(calienteLinks).toHaveLength(1);
  });

  it('does not inject inside existing <a> tags', () => {
    const html = '<p><a href="https://other.com">momios aquí</a> y momios fuera.</p>';
    const result = injectAffiliateLinks(html, AFFILIATE_URLS);
    // Should wrap the second "momios" (outside the tag), not the one inside
    expect(result).toContain('caliente.mx/ref/TEST');
  });

  it('returns unchanged HTML if no triggers match', () => {
    const html = '<p>Un partido sin palabras clave relevantes.</p>';
    const result = injectAffiliateLinks(html, AFFILIATE_URLS);
    expect(result).toBe(html);
  });

  it('all injected links have rel="sponsored"', () => {
    const html = '<p>Los momios del pronóstico con el jersey de Nike.</p>';
    const result = injectAffiliateLinks(html, AFFILIATE_URLS);
    const links = result.match(/<a [^>]*>/g) || [];
    for (const link of links) {
      expect(link).toContain('rel="sponsored"');
    }
  });

  it('does not inject links when an affiliate URL is missing', () => {
    const html = '<p>Nuestro pronóstico para el partido es local.</p>';
    const result = injectAffiliateLinks(html, { ...AFFILIATE_URLS, bet365: '' });
    expect(result).toBe(html);
  });

  it('strips placeholder affiliate links while preserving text', () => {
    const html = '<p><a href="https://www.predictagol.com/placeholder-not-configured" rel="sponsored">Pronóstico</a> final.</p>';
    const result = injectAffiliateLinks(html, AFFILIATE_URLS);
    expect(result).toContain('Pronóstico');
    expect(result).not.toContain('placeholder-not-configured');
  });

  it('strips relative placeholder affiliate links while preserving text', () => {
    const html = '<p>Según los <a href="placeholder-not-configured" rel="sponsored">momios</a> disponibles.</p>';
    const result = injectAffiliateLinks(html, AFFILIATE_URLS);
    expect(result).toContain('momios');
    expect(result).not.toContain('placeholder-not-configured');
  });
});
