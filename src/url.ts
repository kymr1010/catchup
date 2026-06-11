// ?id=<API_id> パラメータの読み書き

export function getUrlId(): string | null {
  return new URLSearchParams(location.search).get("id");
}

export function setUrlId(id: string | null): void {
  const u = new URL(location.href);
  if (id) u.searchParams.set("id", id);
  else u.searchParams.delete("id");
  history.replaceState(null, "", u);
}

export function appUrlFor(id: string): string {
  const u = new URL(location.href);
  u.search = "";
  u.searchParams.set("id", id);
  return u.toString();
}
