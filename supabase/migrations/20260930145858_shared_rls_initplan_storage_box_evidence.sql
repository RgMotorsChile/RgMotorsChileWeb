-- P1-3 (storage): box-evidence (inventario). Misma semÃ¡ntica; no toca boletas_receipts_*.
alter policy box_evidence_staff_select on storage.objects using (bucket_id = 'box-evidence' and (select public.is_inv_staff()));
alter policy box_evidence_staff_insert on storage.objects with check (bucket_id = 'box-evidence' and (select public.is_inv_staff()));
alter policy box_evidence_staff_update on storage.objects using (bucket_id = 'box-evidence' and (select public.is_inv_staff())) with check (bucket_id = 'box-evidence' and (select public.is_inv_staff()));
alter policy box_evidence_staff_delete on storage.objects using (bucket_id = 'box-evidence' and (select public.is_inv_staff()));;
