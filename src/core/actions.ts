"use server";

import { revalidatePath } from "next/cache";

import type { EntityKind } from "@/types/database";

import { removeAttachment, uploadAttachment } from "./attachments";
import { addComment, editComment, removeComment, removeCommentsFor } from "./comments";
import { deleteModuleView, renameModuleView, saveModuleView } from "./module-views";
import { linkEntities, removeRelationsFor, searchEntities, unlink, type RelatedRow } from "./relations";
import { deleteTemplate, saveTemplate, setDefaultTemplate } from "./templates";
import { moveToTrash, purgeOne, restoreFromTrash } from "./trash";

/**
 * Las acciones de las piezas comunes de vida.
 *
 * Viven en core y no en cada módulo porque el comportamiento es idéntico en
 * los seis: un comentario sobre una noche y uno sobre una pieza de contenido
 * se escriben, se editan y se borran igual. Repetirlas seis veces sería seis
 * sitios donde arreglar el mismo fallo.
 */

// ------------------------------------------------------------- comentarios

export async function addCommentAction(
  kind: EntityKind,
  entityId: string,
  path: string,
  body: string,
): Promise<{ ok: boolean; error?: string }> {
  const ok = await addComment(kind, entityId, body);
  if (ok) revalidatePath(path);
  return ok ? { ok } : { ok, error: "El comentario está vacío o es demasiado largo." };
}

export async function editCommentAction(
  id: string,
  path: string,
  body: string,
): Promise<{ ok: boolean; error?: string }> {
  const ok = await editComment(id, body);
  if (ok) revalidatePath(path);
  return ok ? { ok } : { ok, error: "El comentario está vacío o es demasiado largo." };
}

export async function removeCommentAction(id: string, path: string): Promise<void> {
  await removeComment(id);
  revalidatePath(path);
}

// ---------------------------------------------------------------- adjuntos

export async function uploadAttachmentAction(
  kind: EntityKind,
  entityId: string,
  path: string,
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const file = formData.get("file");
  const slot = String(formData.get("slot") ?? "ADJUNTO");

  if (!(file instanceof File)) return { ok: false, error: "No llegó ningún fichero." };

  const result = await uploadAttachment(kind, entityId, slot, file);
  if (result.ok) revalidatePath(path);
  return result;
}

export async function removeAttachmentAction(id: string, path: string): Promise<void> {
  await removeAttachment(id);
  revalidatePath(path);
}

// ---------------------------------------------------------------- vínculos

export async function linkAction(
  from: { kind: EntityKind; id: string },
  to: { kind: EntityKind; id: string },
  path: string,
): Promise<{ ok: boolean; error?: string }> {
  const ok = await linkEntities(from, to);
  if (ok) revalidatePath(path);
  return ok ? { ok } : { ok, error: "No se pudo crear el vínculo." };
}

export async function unlinkAction(linkId: string, path: string): Promise<void> {
  await unlink(linkId);
  revalidatePath(path);
}

export async function searchEntitiesAction(term: string): Promise<RelatedRow[]> {
  return searchEntities(term);
}

// ---------------------------------------------------------------- papelera

/**
 * Borra con red debajo y devuelve con qué deshacerlo.
 *
 * Se lleva por delante lo que colgaba de la entidad -- comentarios y vínculos
 * -- porque no hay clave foránea que lo haga sola. Los adjuntos se quedan
 * hasta que la papelera se vacíe de verdad: borrar el fichero del cubo haría
 * que restaurar devolviera una ficha con la lista de adjuntos rota.
 */
export async function trashAction(
  kind: EntityKind,
  entityId: string,
  path: string,
): Promise<{ trashId: string | null }> {
  await removeCommentsFor(kind, entityId);
  await removeRelationsFor(kind, entityId);
  const trashId = await moveToTrash(kind, entityId);
  revalidatePath(path);
  return { trashId };
}

export async function restoreAction(trashId: string, path: string): Promise<boolean> {
  const ok = await restoreFromTrash(trashId);
  revalidatePath(path);
  return ok;
}

export async function purgeOneAction(trashId: string, path: string): Promise<void> {
  await purgeOne(trashId);
  revalidatePath(path);
}

// ------------------------------------------------------------------ vistas

export async function saveViewAction(
  moduleId: string,
  name: string,
  path: string,
  query: string,
): Promise<{ ok: boolean; error?: string }> {
  const result = await saveModuleView(moduleId, name, path, query);
  if (result.ok) revalidatePath(path);
  return result;
}

export async function renameViewAction(
  id: string,
  name: string,
  path: string,
): Promise<{ ok: boolean; error?: string }> {
  const result = await renameModuleView(id, name);
  if (result.ok) revalidatePath(path);
  return result;
}

export async function deleteViewAction(id: string, path: string): Promise<void> {
  await deleteModuleView(id);
  revalidatePath(path);
}

// -------------------------------------------------------------- plantillas

export async function saveTemplateAction(
  moduleId: string,
  name: string,
  payload: Record<string, unknown>,
  body: string | null,
  isDefault: boolean,
  path: string,
): Promise<{ ok: boolean; error?: string }> {
  const result = await saveTemplate(moduleId, name, payload, body, isDefault);
  if (result.ok) revalidatePath(path);
  return result;
}

export async function setDefaultTemplateAction(
  moduleId: string,
  id: string,
  path: string,
): Promise<void> {
  await setDefaultTemplate(moduleId, id);
  revalidatePath(path);
}

export async function deleteTemplateAction(id: string, path: string): Promise<void> {
  await deleteTemplate(id);
  revalidatePath(path);
}
