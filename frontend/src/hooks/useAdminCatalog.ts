import { useCallback, useEffect, useState } from "react";
import {
  AdminCatalogData,
  ensureAdminCatalog,
  getAdminCatalogSnapshot,
  patchAdminCatalog,
} from "../services/adminCatalog.cache";

export function useAdminCatalog() {
  const [data, setData] = useState<AdminCatalogData | null>(() => getAdminCatalogSnapshot());
  const [loading, setLoading] = useState(!getAdminCatalogSnapshot());

  useEffect(() => {
    let cancelled = false;

    ensureAdminCatalog()
      .then((catalog) => {
        if (!cancelled) {
          setData(catalog);
          setLoading(false);
        }
      })
      .catch((err) => {
        console.error(err);
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const sync = useCallback((next: AdminCatalogData) => {
    patchAdminCatalog(next);
    setData(next);
  }, []);

  const refresh = useCallback(async () => {
    const catalog = await ensureAdminCatalog(true);
    setData(catalog);
    return catalog;
  }, []);

  return { data, loading, sync, refresh };
}
