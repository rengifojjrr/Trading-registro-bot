// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { DetalleDeLaOperacion, PaperEquityChart } from "./paper-equity-chart";
import type { OperacionDePapel } from "./paper-trades-tabla";

/**
 * Lo que tiene que cumplir tocar una operación en la curva.
 *
 * La curva sola contesta «cómo va» y no contesta «por qué ahí». Un escalón
 * hacia abajo es una operación concreta, y hasta ahora había que ir a buscarla
 * a la tabla comparando horas a ojo.
 *
 * Recharts no mide nada en jsdom --el contenedor responsivo sale de cero por
 * cero-- así que aquí no se puede pulsar un punto del SVG. Lo que sí se puede
 * comprobar es lo de alrededor, que es donde están las decisiones: que las
 * marcas se calculen sobre la hora correcta y que el detalle diga lo que tiene
 * que decir.
 */

const PUNTOS = Array.from({ length: 10 }, (_, i) => ({
  ts: new Date(Date.UTC(2026, 8, 17, 10, i * 5)).toISOString(),
  equity: 10_000 - i * 10,
}));

function operacion(extra: Partial<OperacionDePapel> = {}): OperacionDePapel {
  return {
    id: "op-1",
    side: "LARGO",
    size: 0.1,
    precioEntrada: 76_000,
    horaEntrada: new Date(Date.UTC(2026, 8, 17, 10, 10)).toISOString(),
    precioSalida: 76_100,
    horaSalida: new Date(Date.UTC(2026, 8, 17, 10, 20)).toISOString(),
    pnl: -25,
    pnlPct: -0.3,
    comision: 35,
    motivoSalida: "OBJETIVO",
    barrasEnMercado: 2,
    ...extra,
  };
}

function pintar(operaciones: OperacionDePapel[]) {
  return render(
    <PaperEquityChart
      puntos={PUNTOS}
      capitalAsignado={10_000}
      timezone="UTC"
      moneda="USD"
      temporalidad="5m"
      operaciones={operaciones}
    />,
  );
}

describe("las marcas sobre la curva", () => {
  it("invita a tocarlas cuando hay alguna", () => {
    pintar([operacion()]);
    expect(screen.getByText(/Toca uno para ver por dónde entró/)).toBeTruthy();
  });

  it("sin operaciones no promete nada que no se pueda hacer", () => {
    pintar([]);
    expect(screen.queryByText(/Toca uno/)).toBeNull();
  });

  /**
   * Una operación cuya salida cae fuera de la curva --porque la curva se
   * reconstruyó, o porque falta el punto-- no puede tumbar la gráfica entera.
   */
  it("una salida fuera de la curva no rompe nada", () => {
    const fuera = operacion({ horaSalida: new Date(Date.UTC(2030, 0, 1)).toISOString() });
    expect(() => pintar([fuera])).not.toThrow();
  });
});

describe("el detalle de una operación", () => {
  /**
   * No se puede pulsar el SVG en jsdom, así que se comprueba el componente de
   * detalle a través de lo que la gráfica hace con él: se monta con la
   * operación elegida y se leen sus cifras.
   */
  it("enseña las dos puntas y por qué salió", () => {
    render(
      <DetalleDeLaOperacion
        operacion={operacion()}
        timezone="UTC"
        moneda="USD"
        onCerrar={vi.fn()}
      />,
    );

    expect(screen.getByText(/Largo · llegó al objetivo/)).toBeTruthy();
    expect(screen.getByText("Entró")).toBeTruthy();
    expect(screen.getByText("Salió")).toBeTruthy();
  });

  /**
   * El caso que motivó todo esto: el precio se movió 100 a favor y la
   * operación acabó en rojo. Sin el bruto al lado de la comisión, el escalón
   * hacia abajo parece un fallo de la aplicación.
   */
  it("con el recorrido a favor, dice qué se llevó la comisión", () => {
    render(
      <DetalleDeLaOperacion
        operacion={operacion()}
        timezone="UTC"
        moneda="USD"
        onCerrar={vi.fn()}
      />,
    );

    // 76.100 - 76.000 = +100 de recorrido, y aun así -25 de resultado.
    expect(screen.getByText("+100.00")).toBeTruthy();
    expect(screen.getByText(/de \+\$10\.00 brutos/)).toBeTruthy();
  });

  it("en un corto el recorrido a favor es el precio bajando", () => {
    render(
      <DetalleDeLaOperacion
        operacion={operacion({ side: "CORTO", precioEntrada: 76_100, precioSalida: 76_000 })}
        timezone="UTC"
        moneda="USD"
        onCerrar={vi.fn()}
      />,
    );

    expect(screen.getByText("+100.00")).toBeTruthy();
  });

  it("se puede quitar", async () => {
    const user = userEvent.setup();
    const cerrar = vi.fn();
    render(
      <DetalleDeLaOperacion
        operacion={operacion()}
        timezone="UTC"
        moneda="USD"
        onCerrar={cerrar}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Quitar" }));
    expect(cerrar).toHaveBeenCalled();
  });
});

describe("la curva sigue sirviendo sin operaciones", () => {
  it("se pinta igual que antes", () => {
    pintar([]);
    // Las tres cifras de cabecera son las de siempre: añadir las marcas no
    // podía cambiar lo que la gráfica ya contestaba.
    expect(screen.getByText("Vale ahora")).toBeTruthy();
    expect(screen.getByText("Su mejor momento")).toBeTruthy();
    expect(screen.getByText("Desde ese máximo")).toBeTruthy();
  });

  it("no se queja cuando la gráfica no tiene puntos suficientes", () => {
    const apenas = PUNTOS.slice(0, 2);
    expect(() =>
      render(
        <PaperEquityChart
          puntos={apenas}
          capitalAsignado={10_000}
          timezone="UTC"
          moneda="USD"
          temporalidad="5m"
          operaciones={[operacion()]}
        />,
      ),
    ).not.toThrow();
  });
});

describe("marcar por la salida y no por la entrada", () => {
  /**
   * La entrada no mueve el patrimonio -- el dinero pasa de efectivo a posición
   * y la cuenta vale lo mismo --, así que marcar ahí pondría el punto donde no
   * pasó nada. El escalón está en la salida.
   */
  it("es una decisión, y está escrita donde se toma", async () => {
    const fuente = await import("node:fs").then((fs) =>
      fs.readFileSync("src/components/bots/paper-equity-chart.tsx", "utf8"),
    );
    expect(fuente).toContain("op.horaSalida");
    expect(fuente).not.toMatch(/const salida = Date\.parse\(op\.horaEntrada\)/);
  });
});

/** Recharts avisa por consola de que mide cero en jsdom; no aporta nada al test. */
vi.spyOn(console, "warn").mockImplementation(() => {});
