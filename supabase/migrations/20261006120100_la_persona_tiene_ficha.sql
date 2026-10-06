-- La persona tiene ficha: comentarios, ficheros, vínculos y papelera.
--
-- Una persona de tus proyectos se abre en su propia página (/personas/<id>), y
-- las piezas comunes -- comentarios, adjuntos, vínculos, papelera -- apuntan a
-- cualquier entidad por su tipo. Para eso el tipo tiene que existir aquí.
--
-- El hito no entra (el diseño lo proponía): sus filas ya vuelven con el
-- proyecto al deshacer un borrado, y una tabla no puede ser a la vez hija de
-- una entidad y entidad propia sin que la papelera la archive por dos caminos
-- (lo vigila entities.test.ts).
--
-- Va en un archivo aparte de la migración de proyectos porque un valor nuevo
-- de un enum no se puede usar en la misma transacción en la que se añade, y
-- así nadie cae en ello por accidente al tocar la otra.

alter type public.entity_kind add value if not exists 'PERSONA';
