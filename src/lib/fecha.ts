import { Settings } from "luxon";

/**
 * Luxon, con el idioma puesto. La aplicación importa fechas de aquí y no de
 * `luxon`, y una regla de eslint lo obliga.
 *
 * Luxon sin idioma usa el de la máquina. En este servidor eso es `en-US`, así
 * que la mitad de la aplicación llevaba meses escribiendo los meses en inglés:
 * el eje de las curvas, las fechas de la tabla de operaciones, el detalle de
 * cada una. En septiembre no se nota --«Sep» se escribe igual en los dos
 * idiomas-- y en enero pone «Jan», en abril «Apr», en agosto «Aug» y en
 * diciembre «Dec».
 *
 * Y lo peor no es el idioma: es que dependía de la máquina. La misma página
 * podía salir en un idioma en el servidor y en otro en el navegador de quien
 * la abriera, y eso en React es un aviso de hidratación y un texto que cambia
 * solo al cargar.
 *
 * El código nuevo sí se acordaba: quince sitios llamaban a `.setLocale("es")`
 * uno por uno. Ésa es la forma de arreglarlo que funciona hasta que a alguien
 * se le olvida, y a alguien se le olvidó cuatro veces. Puesto aquí no hay nada
 * que recordar: no se puede tener un `DateTime` sin que el idioma esté puesto,
 * porque no se puede llegar a `DateTime` por otro sitio.
 *
 * `"es"` a secas y no `"es-ES"`: los nombres de mes y de día son los mismos en
 * todo el idioma, y quien usa esto escribe en español de América.
 *
 * Los `.setLocale("es")` que ya había siguen ahí y siguen siendo correctos;
 * ahora son una repetición, no lo único que separa la aplicación del inglés.
 */
Settings.defaultLocale = "es";

export {
  DateTime,
  Duration,
  FixedOffsetZone,
  IANAZone,
  Info,
  Interval,
  Settings,
  SystemZone,
  Zone,
} from "luxon";

export type { DateTimeUnit, DurationLikeObject, WeekdayNumbers } from "luxon";
