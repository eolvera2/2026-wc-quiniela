import { describe, it, expect } from 'vitest';
import { buildSystemPrompt, buildUserPrompt, DISCLAIMER_FOOTER } from './prompt.js';

describe('prompt', () => {
  describe('buildSystemPrompt', () => {
    it('returns a Spanish system prompt for pronostico_momios', () => {
      const prompt = buildSystemPrompt('pronostico_momios');
      expect(prompt).toContain('momios');
      expect(prompt).toContain('TUDN');
      expect(prompt).toContain('TV Azteca');
      // MX vernacular markers
      expect(prompt).toContain('el Tri');
      expect(prompt).toContain('la afición');
    });

    it('includes answer-first instruction (GEO/AEO)', () => {
      const prompt = buildSystemPrompt('pronostico_momios');
      expect(prompt).toMatch(/primeras.*oraciones.*responder/i);
    });

    it('includes TL;DR / Puntos Clave instruction', () => {
      const prompt = buildSystemPrompt('pronostico_momios');
      expect(prompt).toMatch(/Puntos Clave/);
    });

    it('includes question-phrased H2 instruction', () => {
      const prompt = buildSystemPrompt('pronostico_momios');
      expect(prompt).toMatch(/H2.*pregunta/i);
    });

    it('includes JSON output schema instruction', () => {
      const prompt = buildSystemPrompt('pronostico_momios');
      expect(prompt).toContain('h1_title');
      expect(prompt).toContain('meta_description');
      expect(prompt).toContain('analisis_tactico_html');
      expect(prompt).toContain('pronostico_quiniela');
      expect(prompt).toContain('url_slug');
    });

    it('varies instructions by article_type', () => {
      const momios = buildSystemPrompt('pronostico_momios');
      const alineacion = buildSystemPrompt('alineacion_probable');
      expect(momios).not.toBe(alineacion);
      expect(alineacion).toContain('alineación probable');
    });

    it('includes banned-language list', () => {
      const prompt = buildSystemPrompt('pronostico_momios');
      expect(prompt).toContain('ganador garantizado');
      expect(prompt).toContain('100% seguro');
    });
  });

  describe('buildUserPrompt', () => {
    it('injects match data placeholders', () => {
      const data = {
        teamA: 'México',
        teamB: 'Alemania',
        h2h: '3 wins, 1 draw, 2 losses',
        form: 'WWDLW',
        injuries: 'Raúl Jiménez (knee)',
        odds: { home: 2.10, draw: 3.40, away: 3.50 },
        kickoffUtc: '2026-06-11T18:00:00Z',
      };
      const prompt = buildUserPrompt(data);
      expect(prompt).toContain('México');
      expect(prompt).toContain('Alemania');
      expect(prompt).toContain('3 wins');
      expect(prompt).toContain('Raúl Jiménez');
      expect(prompt).toContain('2.10');
    });
  });

  describe('DISCLAIMER_FOOTER', () => {
    it('contains Spanish disclaimer', () => {
      expect(DISCLAIMER_FOOTER).toContain('entretenimiento e información únicamente');
    });

    it('contains English disclaimer', () => {
      expect(DISCLAIMER_FOOTER).toContain('entertainment and informational purposes only');
    });

    it('contains responsible gambling resources', () => {
      expect(DISCLAIMER_FOOTER).toContain('1-800-697-3735');
      expect(DISCLAIMER_FOOTER).toContain('cij.org.mx');
    });

    it('contains affiliate disclosure', () => {
      expect(DISCLAIMER_FOOTER).toContain('comisión');
    });

    it('contains age gate', () => {
      expect(DISCLAIMER_FOOTER).toContain('18+');
      expect(DISCLAIMER_FOOTER).toContain('21+');
    });
  });
});
