/**
 * URLs/rutas de Vercel Blob que el código o public/ usan directamente.
 * "Limpiar fotos sin uso" nunca las borra. El test codeBlobRefs.test.ts falla
 * si alguien agrega una URL de Blob al código sin listarla aquí.
 */
export const CODE_BLOB_REFS: string[] = [];
