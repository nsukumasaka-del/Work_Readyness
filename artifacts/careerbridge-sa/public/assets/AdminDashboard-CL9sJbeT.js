const refreshKey = "bonlist-legacy-admin-chunk-refresh";
try {
  if (sessionStorage.getItem(refreshKey) !== "1") {
    sessionStorage.setItem(refreshKey, "1");
    window.location.reload();
  }
} catch {
  window.location.reload();
}

export function AdminRoute() {
  return null;
}

export default AdminRoute;
