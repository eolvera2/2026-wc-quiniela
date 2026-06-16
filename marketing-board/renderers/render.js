import { Resvg } from '@resvg/resvg-js';

export function renderSvgToPng(svg, { width }) {
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: width },
    font: {
      fontFiles: ['public/fonts/PredictaGol-NormalRegular.ttf'],
      loadSystemFonts: true,
      defaultFontFamily: 'Poppins',
    },
    background: 'rgba(0,0,0,0)',
  });
  return resvg.render().asPng();
}
