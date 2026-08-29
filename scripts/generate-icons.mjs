/**
 * Los iconos que Android necesita, a partir del mismo SVG de la web.
 *
 * Se generan y se guardan en el repositorio en lugar de calcularse al
 * desplegar: el manifiesto los referencia por ruta fija, y una ruta que a
 * veces existe y a veces no es la diferencia entre que Android considere la
 * aplicación instalable o no.
 *
 * El icono «maskable» lleva la marca reducida al 60% sobre el fondo completo.
 * Android recorta el icono a la forma que tenga el lanzador -- círculo, cuadrado
 * redondeado, gota -- y sin ese margen la parte de fuera se pierde: en un
 * lanzador circular, un icono cuadrado sale con las esquinas cortadas.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";

const FONDO = "#0b1220";
const MARCA = "#38bdf8";

/** El mismo dibujo del sitio, parametrizado por cuánto ocupa la marca. */
const svg = (proporcion) => {
  const r = 16 * proporcion;
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
      <rect width="32" height="32" fill="${FONDO}"/>
      <circle cx="16" cy="16" r="${r}" fill="${MARCA}"/>
    </svg>`,
  );
};

mkdirSync("public/icons", { recursive: true });

const salidas = [
  // Los dos tamaños que exige el manifiesto para ser instalable.
  { archivo: "icon-192.png", size: 192, proporcion: 0.375 },
  { archivo: "icon-512.png", size: 512, proporcion: 0.375 },
  // Maskable: la marca al 60% de lo normal, para sobrevivir al recorte.
  { archivo: "icon-maskable-192.png", size: 192, proporcion: 0.225 },
  { archivo: "icon-maskable-512.png", size: 512, proporcion: 0.225 },
];

for (const { archivo, size, proporcion } of salidas) {
  const png = await sharp(svg(proporcion), { density: 512 })
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toBuffer();
  writeFileSync(`public/icons/${archivo}`, png);
  console.log(`public/icons/${archivo}  ${png.length} bytes`);
}
